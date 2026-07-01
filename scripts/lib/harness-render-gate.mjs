import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse as parseToml } from "../vendor/smol-toml/index.js";
import { parseFrontmatter } from "./frontmatter.mjs";
import { safeJoin } from "./harness-apply-engine.mjs";
import {
  dangerousPathReason,
  pathMatchesLocalOnly,
  scanHarnessSafety,
} from "./harness-safety.mjs";

// Provider/model/auth/telemetry/profile-routing keys that must never appear in ANY rendered or
// written config (TOML or YAML), on top of each template boundary's own forbiddenKeys.
export const FORBIDDEN_GLOBAL_KEYS = [
  "model",
  "model_provider",
  "model_providers",
  "openai_base_url",
  "chatgpt_base_url",
  "profile",
  "profiles",
  "auth",
  "forced_login_method",
  "forced_chatgpt_workspace_id",
  "notify",
  "notifications",
  "otel",
  "telemetry",
];

// --- config key inspection (forbidden-key detection over rendered TOML, YAML, and JSON) -------

function stripTomlComments(text) {
  return text
    .split("\n")
    .map((line) => line.replace(/(^|[ \t])#.*/u, ""))
    .join("\n");
}

// Splits a possibly-quoted, possibly-dotted key path into bare segments:
// `"model"` -> ["model"]; `profiles.default` -> ["profiles", "default"].
function keyPathSegments(rawKeyPath) {
  return rawKeyPath
    .split(".")
    .map((segment) => segment.trim().replace(/^["']|["']$/gu, ""))
    .filter(Boolean);
}

function addKeyPath(keys, rawKeyPath, tablePrefix) {
  const segments = keyPathSegments(rawKeyPath);
  if (segments.length === 0) return;
  for (const segment of segments) keys.add(segment);
  const joined = segments.join(".");
  keys.add(joined);
  if (tablePrefix) {
    keys.add(`${tablePrefix}.${joined}`);
    keys.add(`${tablePrefix}.${segments[0]}`);
  }
}

const KEY_TOKEN = String.raw`(?:"[^"]*"|'[^']*'|[A-Za-z0-9_-]+)`;
// YAML scan is intentionally line-regex based: flat top-level key matching only,
// with no nesting or flow-style awareness. That is enough for the scanned OMP
// config/frontmatter surfaces, while TOML/JSON get parsed structurally below.
const YAML_KEY_LINE = new RegExp(String.raw`^\s*(?:-\s*)?(${KEY_TOKEN}(?:\s*\.\s*${KEY_TOKEN})*)\s*:`, "u");

function addParsedKeyPath(keys, segments) {
  for (const segment of segments) keys.add(segment);
  keys.add(segments.join("."));
}

function visitParsedToml(keys, node, prefix = []) {
  if (Array.isArray(node)) {
    for (const item of node) visitParsedToml(keys, item, prefix);
    return;
  }
  if (!node || typeof node !== "object" || Object.getPrototypeOf(node) !== Object.prototype) return;
  for (const [key, value] of Object.entries(node)) {
    const segments = [...prefix, key];
    addParsedKeyPath(keys, segments);
    visitParsedToml(keys, value, segments);
  }
}

function tomlKeys(text) {
  const keys = new Set();
  visitParsedToml(keys, parseToml(text));
  return keys;
}

function yamlKeys(text) {
  const keys = new Set();
  for (const rawLine of text.split("\n")) {
    const match = rawLine.replace(/#.*$/u, "").match(YAML_KEY_LINE);
    if (match) addKeyPath(keys, match[1], "");
  }
  return keys;
}

function jsonKeys(text) {
  const keys = new Set();
  const visit = (node) => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
    } else if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        keys.add(key);
        visit(value);
      }
    }
  };
  visit(JSON.parse(text));
  return keys;
}

export function configKindFor(relPath) {
  const ext = path.extname(relPath);
  if (ext === ".toml") return "toml";
  if (ext === ".yml" || ext === ".yaml") return "yaml";
  if (ext === ".json") return "json";
  return null;
}

export function configKeys(content, kind) {
  if (kind === "toml") return tomlKeys(content);
  if (kind === "json") return jsonKeys(content);
  return yamlKeys(content);
}

export function keyMatchesForbidden(key, forbidden) {
  return key === forbidden || key.startsWith(`${forbidden}.`) || key.endsWith(`.${forbidden}`);
}

export function markdownFrontmatter(content) {
  return parseFrontmatter(content)?.frontmatter ?? null;
}


function forbiddenKeyFindings(label, keys, candidate) {
  const findings = [];
  const forbidden = new Set([...(candidate.forbiddenKeys ?? []), ...FORBIDDEN_GLOBAL_KEYS]);
  for (const forbiddenKey of forbidden) {
    for (const key of keys) {
      if (keyMatchesForbidden(key, forbiddenKey)) findings.push(`${label}: forbidden key ${key}`);
    }
  }
  return findings;
}

// --- preflight: reject unsafe destinations before any filesystem write ------------------------

function destinationSafety(candidate) {
  for (const value of [candidate.destination, candidate.renderedRelPath]) {
    if (String(value).split(/[\\/]+/u).includes("..")) {
      return `${candidate.id}: path traversal segment in ${value}`;
    }
  }
  const destination = candidate.destination;
  if (path.isAbsolute(destination)) {
    return `${candidate.id}: destination must not be absolute: ${destination}`;
  }
  if (!destination.startsWith("~/") && !destination.startsWith(".")) {
    return `${candidate.id}: destination must be home-relative (~/...) or project-relative: ${destination}`;
  }
  return null;
}

export function preflightFindings(candidates) {
  const findings = [];
  for (const candidate of candidates) {
    const finding = destinationSafety(candidate);
    if (finding) findings.push(finding);
  }
  return [...new Set(findings)].sort();
}

// --- rendering + safety gate over rendered output --------------------------------------------

export function renderToTemp(candidates) {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "render-harness-nucleus-"));
  for (const candidate of candidates) {
    const target = safeJoin(tempRoot, candidate.renderedRelPath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, candidate.content);
  }
  return tempRoot;
}

function parseRenderedToml(tomlFiles, findings) {
  for (const file of tomlFiles) {
    try {
      parseToml(readFileSync(file, "utf8"));
    } catch (error) {
      findings.push(`rendered TOML parse failed: ${error.message}`);
    }
  }
}

// Runs the #45 safety-gate rules over the RENDERED content (not the static plan): secret-looking
// values, absolute private home paths, dangerous destination paths, local-only write targets,
// forbidden provider/model/auth/telemetry/profile keys (TOML, YAML, JSON), and TOML/JSON parseability.
export function gateRenderedOutput(candidates, localOnly, tempRoot) {
  const findings = [];
  const tomlFiles = [];
  for (const candidate of candidates) {
    const label = candidate.renderedRelPath;
    findings.push(...scanHarnessSafety(label, candidate.content));
    const dangerous = dangerousPathReason(candidate.destination);
    if (dangerous) {
      findings.push(`${label}: candidate destination ${candidate.destination} is dangerous (${dangerous})`);
    }
    if (pathMatchesLocalOnly(candidate.destination, localOnly)) {
      findings.push(`${label}: candidate destination ${candidate.destination} is local-only and must never be a write target`);
    }
    const kind = configKindFor(candidate.renderedRelPath);
    if (kind) {
      let keys = null;
      try {
        keys = configKeys(candidate.content, kind);
      } catch (error) {
        // Unparseable rendered config (e.g. malformed JSON) is a gate finding, never a throw.
        findings.push(`${label}: invalid ${kind.toUpperCase()} (${error.message})`);
      }
      if (keys) findings.push(...forbiddenKeyFindings(label, keys, candidate));
      if (kind === "toml") tomlFiles.push(safeJoin(tempRoot, candidate.renderedRelPath));
    } else if (path.extname(candidate.renderedRelPath) === ".md") {
      // Markdown components (SKILL.md, agents/*.md) can carry YAML frontmatter; forbidden-key-scan
      // that frontmatter as YAML so model:/auth:/profile: keys never slip in. Frontmatter-less
      // Markdown is left untouched.
      const frontmatter = markdownFrontmatter(candidate.content);
      if (frontmatter !== null) {
        let keys = null;
        try {
          keys = configKeys(frontmatter, "yaml");
        } catch (error) {
          findings.push(`${label}: invalid frontmatter YAML (${error.message})`);
        }
        if (keys) findings.push(...forbiddenKeyFindings(label, keys, candidate));
      }
    }
  }
  parseRenderedToml(tomlFiles, findings);
  return [...new Set(findings)].sort();
}

// Runs preflight + render + gate; returns sorted findings without leaving any temp dir behind.
export function renderAndGate(candidates, localOnly) {
  const preflight = preflightFindings(candidates);
  if (preflight.length > 0) return preflight;
  const tempRoot = renderToTemp(candidates);
  try {
    return gateRenderedOutput(candidates, localOnly, tempRoot);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

