#!/usr/bin/env node
// Render-to-write executor for the harness nucleus.
//
// Two modes:
//   (default) dry-run  — render the Codex templates and the decided OMP source into an
//                        ephemeral temp dir only, run the #45 safety gate over the rendered
//                        output, and print a deterministic candidate manifest. Zero writes
//                        to live ~/.codex, ~/.omp, ~/.claude, or repo config.
//   --write            — strict-manual HITL apply. Refuses unless the dry-run render and the
//                        safety gate pass clean. Create-missing-only: never overwrites an
//                        existing non-marker live file (skips with exists:). Backs up any
//                        kit-owned marker before updating it. Idempotent against a marker
//                        manifest, so a second run is a clean no-op.
//
// Build is AFK. The --write path is the executor of the strict-manual approval policy decided
// in docs/harness/codex-adapter-plan.md, never a bypass of it.

import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  asArray,
  containsPrivateHomePath,
  dangerousPathReason,
  globPatternToRegex,
  isPatternPath,
  normalizePathText,
  pathMatchesLocalOnly,
  secretError,
} from "./lib/harness-safety.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

const DEFAULTS = {
  plan: "docs/harness/codex-adapter-plan/adapter-plan.json",
  manifest: "docs/harness/resource-manifest.json",
  templateDir: "docs/harness/codex-adapter-plan/templates",
  ompSource: "omp/.omp/agent",
};

const MARKER_DIR = ".loom-harness";
const MARKER_FILE = "applied-manifest.json";
const MARKER_SCHEMA_VERSION = 1;

const APPROVAL_POLICY =
  "strict-manual (separate issue/PR, dry-run rendered diff, dangerous-key validation, live-file backup, explicit human approval before any write)";

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

const USAGE = [
  "Usage: node scripts/render-harness-nucleus.mjs [options]",
  "  --write                 apply appliable candidates (strict-manual, create-missing-only)",
  "  --json                  emit a machine-readable manifest instead of text",
  "  --home <dir>            resolve ~ live destinations under <dir> (default: $HOME)",
  "  --plan <path>           adapter plan json",
  "  --manifest <path>       resource manifest json",
  "  --template-dir <path>   codex template directory",
  "  --omp-source <path>     decided OMP source directory",
  "  -h, --help              show this help",
].join("\n");

function readArgs(argv) {
  const options = {
    write: false,
    json: false,
    home: null,
    plan: DEFAULTS.plan,
    manifest: DEFAULTS.manifest,
    templateDir: DEFAULTS.templateDir,
    ompSource: DEFAULTS.ompSource,
  };
  const valueFlags = new Map([
    ["--home", "home"],
    ["--plan", "plan"],
    ["--manifest", "manifest"],
    ["--template-dir", "templateDir"],
    ["--omp-source", "ompSource"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") {
      console.log(USAGE);
      process.exit(0);
    }
    if (arg === "--write") {
      options.write = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    const key = valueFlags.get(arg);
    if (!key) throw new Error(`Unknown option: ${arg}`);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) throw new Error(`${arg} requires a value`);
    options[key] = next;
    index += 1;
  }
  return options;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function repoPath(relative) {
  return path.isAbsolute(relative) ? relative : path.join(REPO_ROOT, relative);
}

export function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

export function resolveHomeRoot(options) {
  return options.home ? path.resolve(options.home) : process.env.HOME ?? homedir();
}

export function pathExists(filePath) {
  try {
    lstatSync(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

// Join relPath under root, refusing any result that escapes root (path traversal backstop).
export function safeJoin(root, relPath) {
  const base = path.resolve(root);
  const target = path.resolve(base, relPath);
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new Error(`refusing to resolve outside ${base}: ${relPath}`);
  }
  return target;
}

// Live HOME path for a home-anchored ("~/...") display destination; null for project-scoped
// or otherwise non-home destinations that cannot be applied against a single HOME.
export function resolveLivePath(displayDestination, homeRoot) {
  if (!displayDestination.startsWith("~/")) return null;
  return safeJoin(homeRoot, displayDestination.slice(2));
}

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
const TOML_KEY_LINE = new RegExp(String.raw`^\s*(${KEY_TOKEN}(?:\s*\.\s*${KEY_TOKEN})*)\s*=`, "u");
const YAML_KEY_LINE = new RegExp(String.raw`^\s*(?:-\s*)?(${KEY_TOKEN}(?:\s*\.\s*${KEY_TOKEN})*)\s*:`, "u");

function tomlKeys(text) {
  const keys = new Set();
  let currentTable = "";
  for (const line of stripTomlComments(text).split("\n")) {
    const table = line.match(/^\s*\[\[?([^\]]+)\]\]?\s*$/u);
    if (table) {
      currentTable = keyPathSegments(table[1]).join(".");
      for (const segment of currentTable.split(".")) if (segment) keys.add(segment);
      if (currentTable) keys.add(currentTable);
      continue;
    }
    const match = line.match(TOML_KEY_LINE);
    if (match) addKeyPath(keys, match[1], currentTable);
  }
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

// YAML frontmatter block of a Markdown document (the text between the leading `---` line and the
// next `---`). Returns null when the document has no frontmatter, so frontmatter-less Markdown is
// left unscanned and behaves exactly as before.
export function markdownFrontmatter(content) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/u.exec(content);
  return match ? match[1] : null;
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

// --- candidate model -------------------------------------------------------------------------

function collectFiles(root, current = root) {
  const files = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") continue;
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(root, full));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function localOnlyPatterns(manifest, plan) {
  const patterns = new Set();
  for (const resource of manifest.resources ?? []) {
    if (resource.disposition === "local-only") {
      for (const livePath of asArray(resource.currentLivePath)) patterns.add(livePath);
    }
  }
  for (const surface of plan.localOnlyCodexSurfaces ?? []) {
    if (surface.pathPattern) patterns.add(surface.pathPattern);
  }
  return [...patterns].sort();
}

// Disposition is resolved from the resource manifest (the source of truth for ownership).
// Precedence: local-only patterns first, then a home-anchored manifest resource for the same
// harness, then a documented safe fallback of reference-only (reported, never auto-applied).
export function resolveDisposition(displayDestination, harness, manifest, localOnly) {
  if (pathMatchesLocalOnly(displayDestination, localOnly)) return "local-only";
  const normalized = normalizePathText(displayDestination);
  for (const resource of manifest.resources ?? []) {
    if (resource.sourceHarness !== harness) continue;
    if (resource.disposition === "local-only") continue;
    for (const livePath of asArray(resource.currentLivePath)) {
      if (typeof livePath !== "string" || livePath.startsWith("repo:")) continue;
      const pattern = normalizePathText(livePath);
      if (!pattern) continue;
      if (isPatternPath(pattern)) {
        if (globPatternToRegex(pattern).test(normalized)) return resource.disposition;
      } else {
        const base = pattern.replace(/\/$/u, "");
        if (normalized === base || normalized.startsWith(`${base}/`)) return resource.disposition;
      }
    }
  }
  return "reference-only";
}

function renderedRelForCodex(displayDestination) {
  const scope = displayDestination.startsWith("~/") ? "user" : "project";
  const tail = displayDestination.startsWith("~/")
    ? displayDestination.slice(2)
    : displayDestination.replace(/^\.?\//u, "");
  return path.join("codex", scope, tail);
}

function expandDestination(destination, agentName) {
  return destination.includes("*") ? destination.replace("*", agentName) : destination;
}

function buildCandidates(plan, manifest, options) {
  const localOnly = localOnlyPatterns(manifest, plan);
  const candidates = [];

  const agentTemplates = (plan.ompAgentMappings ?? [])
    .filter((mapping) => mapping.candidateTemplate)
    .map((mapping) => mapping.candidateTemplate);

  for (const boundary of plan.templateBoundaries ?? []) {
    const isAgent = boundary.id === "custom-agent";
    const isMerge = boundary.id === "base-config" || boundary.id === "skills-config";
    const templates = isAgent ? agentTemplates : [boundary.templatePath];
    for (const templateRel of templates) {
      const agentName = path.basename(templateRel, ".toml");
      const source = repoPath(
        isAgent
          ? path.join(options.templateDir, "agents", path.basename(templateRel))
          : path.join(options.templateDir, path.basename(boundary.templatePath)),
      );
      const content = readFileSync(source, "utf8");
      for (const rawDestination of boundary.candidateDestinations ?? []) {
        const destination = expandDestination(rawDestination, agentName);
        const disposition = resolveDisposition(destination, "codex", manifest, localOnly);
        const operation = isMerge ? "merge-entries" : "create-file";
        const appliable = (disposition === "track" || disposition === "adapt") && operation === "create-file";
        candidates.push({
          id: `codex:${boundary.id}:${destination}`,
          harness: "codex",
          boundaryId: boundary.id,
          forbiddenKeys: boundary.forbiddenKeys ?? [],
          source: path.relative(REPO_ROOT, source),
          content,
          renderedRelPath: renderedRelForCodex(destination),
          destination,
          disposition,
          operation,
          appliable,
        });
      }
    }
  }

  // Decided OMP source: render the portable base config tree. Never render local-only overlays.
  const ompRoot = repoPath(options.ompSource);
  for (const file of collectFiles(ompRoot)) {
    const rel = path.relative(ompRoot, file).split(path.sep).join("/");
    if (/\.local\.ya?ml$/u.test(rel)) continue;
    const destination = `~/.omp/agent/${rel}`;
    const disposition = resolveDisposition(destination, "omp", manifest, localOnly);
    const appliable = disposition === "track" || disposition === "adapt";
    candidates.push({
      id: `omp:${destination}`,
      harness: "omp",
      boundaryId: null,
      forbiddenKeys: [],
      source: path.relative(REPO_ROOT, file),
      content: readFileSync(file, "utf8"),
      renderedRelPath: path.join("omp", "agent", rel),
      destination,
      disposition,
      appliable,
      operation: "create-file",
    });
  }

  candidates.sort((left, right) => {
    if (left.harness !== right.harness) return left.harness.localeCompare(right.harness);
    if (left.destination !== right.destination) return left.destination.localeCompare(right.destination);
    return left.renderedRelPath.localeCompare(right.renderedRelPath);
  });
  return { candidates, localOnly };
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

function parseRenderedTomlWithPython(tomlFiles, findings) {
  if (tomlFiles.length === 0) return;
  const script = [
    "import pathlib, sys, tomllib",
    "for raw in sys.argv[1:]:",
    "    tomllib.loads(pathlib.Path(raw).read_text())",
  ].join("\n");
  const result = spawnSync("python3", ["-c", script, ...tomlFiles], { encoding: "utf8" });
  if (result.error) {
    findings.push(`rendered TOML parse could not run python3: ${result.error.message}`);
    return;
  }
  if (result.status !== 0) {
    findings.push(`rendered TOML parse failed: ${(result.stderr || result.stdout || "").trim()}`);
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
    const secret = secretError(label, candidate.content);
    if (secret) findings.push(secret);
    const privatePath = containsPrivateHomePath(label, candidate.content);
    if (privatePath) findings.push(privatePath);
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
  parseRenderedTomlWithPython(tomlFiles, findings);
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

// --- live inspection (read-only) -------------------------------------------------------------

function liveInspect(candidate, homeRoot, marker) {
  let livePath;
  try {
    livePath = resolveLivePath(candidate.destination, homeRoot);
  } catch {
    // Unsafe (traversing/absolute) destination — the preflight reports it; never resolve it live.
    return { livePath: null, status: "unsafe-destination", overwriteRisk: "rejected (unsafe path)", ownership: "none" };
  }
  if (!livePath) {
    return { livePath: null, status: "not-home-scoped", overwriteRisk: "project-scoped (not resolved against HOME)", ownership: "none" };
  }
  if (!pathExists(livePath)) {
    return { livePath, status: "absent", overwriteRisk: "no existing file", ownership: "none" };
  }
  const marked = Boolean(marker.entries[candidate.destination]);
  if (!marked) {
    return { livePath, status: "user-file", overwriteRisk: "would not overwrite (existing non-marker file skipped)", ownership: "user-file" };
  }
  const current = sha256(readFileSync(livePath));
  if (current === sha256(candidate.content)) {
    return { livePath, status: "already-applied", overwriteRisk: "already applied (no change)", ownership: "marker-owned" };
  }
  return { livePath, status: "marker-outdated", overwriteRisk: "would update kit-owned marker (backup taken)", ownership: "marker-owned" };
}

// --- marker manifest -------------------------------------------------------------------------

export function markerPath(homeRoot) {
  return path.join(homeRoot, MARKER_DIR, MARKER_FILE);
}

export function loadMarker(homeRoot) {
  const file = markerPath(homeRoot);
  if (!existsSync(file)) {
    return { schemaVersion: MARKER_SCHEMA_VERSION, generatedBy: "render-harness-nucleus", entries: {} };
  }
  const parsed = readJson(file);
  if (!parsed.entries || typeof parsed.entries !== "object") parsed.entries = {};
  return parsed;
}

function serializeMarker(marker) {
  const entries = {};
  for (const key of Object.keys(marker.entries).sort()) entries[key] = marker.entries[key];
  return `${JSON.stringify({ schemaVersion: MARKER_SCHEMA_VERSION, generatedBy: "render-harness-nucleus", entries }, null, 2)}\n`;
}

export function saveMarkerIfChanged(homeRoot, marker) {
  const file = markerPath(homeRoot);
  const serialized = serializeMarker(marker);
  if (existsSync(file) && readFileSync(file, "utf8") === serialized) return false;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, serialized);
  return true;
}

export function backupTimestamp() {
  return new Date().toISOString().replace(/[:.]/gu, "-");
}

// --- reporting -------------------------------------------------------------------------------

function buildManifest(candidates, localOnly, homeRoot, marker, mode) {
  const reported = [];
  for (const candidate of candidates) {
    const live = liveInspect(candidate, homeRoot, marker);
    reported.push({
      id: candidate.id,
      harness: candidate.harness,
      source: candidate.source,
      destination: candidate.destination,
      disposition: candidate.disposition,
      operation: candidate.operation,
      appliable: candidate.appliable,
      liveStatus: live.status,
      ownership: live.ownership,
      overwriteRisk: live.overwriteRisk,
      requiredApproval: candidate.appliable ? "strict-manual" : "n/a (reported only)",
    });
  }
  return {
    mode,
    approvalPolicy: "strict-manual",
    renderedFiles: candidates.length,
    candidates: reported,
    skippedLocalOnly: localOnly,
    counts: {
      rendered: candidates.length,
      appliable: reported.filter((entry) => entry.appliable).length,
      reported: reported.filter((entry) => !entry.appliable).length,
    },
  };
}

function printTextManifest(manifest, findings) {
  const lines = [];
  lines.push("Harness nucleus renderer");
  lines.push(`Mode: ${manifest.mode}`);
  lines.push(`Approval policy: ${APPROVAL_POLICY}`);
  lines.push(`Rendered files: ${manifest.renderedFiles} (temp only; no live path written in dry-run)`);
  lines.push("");
  lines.push("[appliable candidates] (disposition track/adapt; eligible for --write create-missing-only)");
  for (const entry of manifest.candidates.filter((candidate) => candidate.appliable)) {
    lines.push(`- ${entry.destination}`);
    lines.push(`  harness: ${entry.harness}`);
    lines.push(`  source: ${entry.source}`);
    lines.push(`  disposition: ${entry.disposition}`);
    lines.push(`  operation: ${entry.operation}`);
    lines.push(`  applied: ${manifest.mode === "dry-run" ? "not-applied (dry-run)" : entry.liveStatus}`);
    lines.push(`  liveStatus: ${entry.liveStatus}`);
    lines.push(`  ownership: ${entry.ownership}`);
    lines.push(`  overwriteRisk: ${entry.overwriteRisk}`);
    lines.push(`  requiredApproval: ${entry.requiredApproval}`);
  }
  lines.push("");
  lines.push("[reported candidates] (reference-only/local-only; rendered + validated, never written)");
  for (const entry of manifest.candidates.filter((candidate) => !candidate.appliable)) {
    lines.push(`- ${entry.destination}`);
    lines.push(`  harness: ${entry.harness}`);
    lines.push(`  disposition: ${entry.disposition}`);
    lines.push(`  operation: ${entry.operation}`);
    lines.push(`  liveStatus: ${entry.liveStatus}`);
    lines.push(`  ownership: ${entry.ownership}`);
  }
  lines.push("");
  lines.push("[skipped local-only surfaces] (never rendered as write targets)");
  for (const pattern of manifest.skippedLocalOnly) lines.push(`- ${pattern}`);
  lines.push("");
  if (findings.length > 0) {
    lines.push("[safety findings]");
    for (const finding of findings) lines.push(`- ${finding}`);
    lines.push("");
    lines.push("Result: failed");
  } else {
    lines.push("Result: passed");
  }
  return lines.join("\n");
}

function reportFailure(options, mode, findings, extra = {}) {
  if (options.json) {
    console.log(JSON.stringify({ mode, result: "fail", findings, ...extra }, null, 2));
  } else {
    console.error(`${mode === "write" ? "Refusing to write: dry-run safety gate failed" : "Render failed"}:`);
    for (const finding of findings) console.error(`- ${finding}`);
  }
}

// --- modes -----------------------------------------------------------------------------------

function runDryRun(candidates, localOnly, options, homeRoot, marker) {
  const findings = renderAndGate(candidates, localOnly);
  const manifest = buildManifest(candidates, localOnly, homeRoot, marker, "dry-run");
  if (options.json) {
    console.log(JSON.stringify({ ...manifest, result: findings.length === 0 ? "pass" : "fail", findings }, null, 2));
  } else {
    console.log(printTextManifest(manifest, findings));
  }
  return findings.length === 0 ? 0 : 1;
}

// --- apply engine (create-missing-only / backup-on-drift / marker idempotency) ---------------

// Pure apply loop shared by --write: creates missing live files, skips existing non-marker user
// files, backs up + updates a drifted kit-owned marker, and records the marker. Mutates
// `marker.entries`; persisting the marker is the caller's job. Returns { actions, backups }.
export function applyCandidates(candidates, homeRoot, marker) {
  const actions = [];
  const backups = [];
  for (const candidate of candidates) {
    if (!candidate.appliable) continue;
    const livePath = resolveLivePath(candidate.destination, homeRoot);
    if (!livePath) {
      actions.push({ destination: candidate.destination, action: "skipped", reason: "not home-scoped" });
      continue;
    }
    const wantHash = sha256(candidate.content);
    if (!pathExists(livePath)) {
      mkdirSync(path.dirname(livePath), { recursive: true });
      writeFileSync(livePath, candidate.content);
      marker.entries[candidate.destination] = {
        sha256: wantHash,
        renderedFrom: candidate.source,
        appliedAt: new Date().toISOString(),
      };
      actions.push({ destination: candidate.destination, action: "created", livePath });
      continue;
    }
    const marked = Boolean(marker.entries[candidate.destination]);
    if (!marked) {
      actions.push({ destination: candidate.destination, action: "skipped", reason: "exists", livePath });
      continue;
    }
    if (sha256(readFileSync(livePath)) === wantHash) {
      actions.push({ destination: candidate.destination, action: "already-applied", livePath });
      continue;
    }
    // Kit-owned marker drifted from the rendered content: back up, then update.
    const backup = `${livePath}.loom-bak-${backupTimestamp()}`;
    copyFileSync(livePath, backup);
    writeFileSync(livePath, candidate.content);
    marker.entries[candidate.destination] = {
      sha256: wantHash,
      renderedFrom: candidate.source,
      appliedAt: new Date().toISOString(),
    };
    backups.push(backup);
    actions.push({ destination: candidate.destination, action: "updated", livePath, backup });
  }
  return { actions, backups };
}

function runWrite(candidates, localOnly, options, homeRoot, marker) {
  // 1. Refuse unless a clean preflight + dry-run render + safety gate pass.
  const findings = renderAndGate(candidates, localOnly);
  if (findings.length > 0) {
    reportFailure(options, "write", findings, { refused: true });
    return 1;
  }

  // 2. Apply appliable candidates create-missing-only against the live HOME.
  const { actions, backups } = applyCandidates(candidates, homeRoot, marker);
  const markerChanged = saveMarkerIfChanged(homeRoot, marker);

  if (options.json) {
    console.log(
      JSON.stringify(
        { mode: "write", result: "pass", approvalPolicy: "strict-manual", actions, backups, markerManifest: markerPath(homeRoot), markerChanged },
        null,
        2,
      ),
    );
  } else {
    const lines = ["Harness nucleus renderer", "Mode: write", `Approval policy: ${APPROVAL_POLICY}`, "", "[write actions]"];
    for (const action of actions) {
      const suffix = action.backup ? ` (backup ${path.basename(action.backup)})` : action.reason ? ` (${action.reason})` : "";
      lines.push(`- ${action.action}: ${action.destination}${suffix}`);
    }
    lines.push("");
    lines.push("[backups]");
    if (backups.length === 0) lines.push("- none");
    for (const backup of backups) lines.push(`- ${backup}`);
    lines.push("");
    lines.push(`Marker manifest: ${markerPath(homeRoot)}${markerChanged ? "" : " (unchanged)"}`);
    lines.push("Result: passed");
    console.log(lines.join("\n"));
  }
  return 0;
}

function main() {
  const options = readArgs(process.argv.slice(2));
  const plan = readJson(repoPath(options.plan));
  const manifest = readJson(repoPath(options.manifest));
  const homeRoot = resolveHomeRoot(options);
  const marker = loadMarker(homeRoot);
  const { candidates, localOnly } = buildCandidates(plan, manifest, options);
  return options.write
    ? runWrite(candidates, localOnly, options, homeRoot, marker)
    : runDryRun(candidates, localOnly, options, homeRoot, marker);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exit(main());
  } catch (error) {
    console.error(error.message);
    console.error(USAGE);
    process.exit(2);
  }
}
