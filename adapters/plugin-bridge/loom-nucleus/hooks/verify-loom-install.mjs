#!/usr/bin/env node
// Read-only Stop-hook verifier for the loom-nucleus plugin install (plugin bridge design section 4.1).
//
// What it checks (all without writing anything):
//   1. The Codex + Claude plugin.json wrappers parse and the loom-nucleus identity is well-formed
//      (Codex: name + version, no agents pointer; Claude: name, version, skills, hooks, and no legacy agents pointer).
//   2. The marketplace catalog parses and carries a well-formed loom-nucleus entry (name + source).
//   3. The loaded skill package names match the expected sets recorded from
//      distributions/snapshots/omp-builtins/portability-matrix.json (6 skill candidates) and
//      docs/harness/shared-nucleus-agents.json (canonical shared-agent packages),
//      so a dropped/duplicated/renamed component is caught.
//   4. The ~/.loom-harness/applied-manifest.json marker hashes match the installed files this plugin
//      owns (no drift, no partial write).
//   5. The installed manifests carry no forbidden provider/model/auth keys and no non-portable
//      absolute paths (re-applies the section 3 gate rules to the installed copy).
//
// On any failure it exits non-zero with a structured JSON reason on stderr; on success it stays
// silent and exits 0. It is a standalone shipped artifact: it cannot import the repo render engine at
// install time, so it embeds the expected component sets and a minimal forbidden-key / absolute-path
// re-check. tests/plugin-bridge.test.mjs asserts the embedded sets match the source-of-truth files so
// they cannot drift. The verifier never writes outside an (optional) local-only plugin data dir.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PLUGIN_NAME = "loom-nucleus";

// The 6 OMP command-derived skill candidates remain portable plugin skills.
export const EXPECTED_OMP_SKILLS = [
  "omp-btw",
  "omp-complaint-to-rule",
  "omp-guided-goal",
  "omp-handoff",
  "omp-plan",
  "omp-tangent"
];

// LOO-101 renders every canonical shared nucleus agent as a Vercel-shaped skill package.
export const EXPECTED_SHARED_AGENT_PACKAGES = [
  "belt",
  "biters",
  "blueprint",
  "bus-first",
  "ghosts",
  "inserter",
  "lab",
  "main-bus",
  "modules",
  "radar",
  "recycler",
  "repair-pack",
  "roboports",
  "rocket-launch",
  "science-pack",
  "spidertron",
  "spitters"
];

export const REQUIRED_SHARED_AGENT_PACKAGE_FILES = [
  "AGENTS.md",
  "SKILL.md",
  "references/agent-judgment.md",
  "references/rules.md",
  "references/patterns.md",
  "references/glossary.md",
  "references/coverage-gaps.md",
];

// Provider/model/auth/telemetry/profile keys forbidden in any installed manifest (mirrors the engine's
// FORBIDDEN_GLOBAL_KEYS; embedded because the verifier ships standalone).
export const FORBIDDEN_KEYS = [
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
  "Usage: node verify-loom-install.mjs [options]",
  "  --root <dir>          installed plugin root (default: $CLAUDE_PLUGIN_ROOT or the verifier's plugin root)",
  "  --home <dir>          home root holding .loom-harness/applied-manifest.json (default: $HOME)",
  "  --marketplace <path>  marketplace catalog (default: <root>/../marketplace.json)",
  "  --json                print a JSON ok report on success (default: silent)",
  "  -h, --help            show this help",
].join("\n");

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function readJsonFile(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function keyMatchesForbidden(key, forbidden) {
  return key === forbidden || key.startsWith(`${forbidden}.`) || key.endsWith(`.${forbidden}`);
}

function collectJsonKeys(node, keys = new Set()) {
  if (Array.isArray(node)) {
    for (const value of node) collectJsonKeys(value, keys);
  } else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      keys.add(key);
      collectJsonKeys(value, keys);
    }
  }
  return keys;
}

function forbiddenKeyReasons(label, parsed) {
  const reasons = [];
  const keys = collectJsonKeys(parsed);
  for (const forbidden of FORBIDDEN_KEYS) {
    for (const key of keys) {
      if (keyMatchesForbidden(key, forbidden)) reasons.push(`${label}: forbidden key ${key}`);
    }
  }
  return reasons;
}

// Flag any string value that is an absolute filesystem path; portable manifests use ./-relative
// pointers and ${CLAUDE_PLUGIN_ROOT}, never a baked-in absolute (home-leaking) path.
function absolutePathReasons(label, parsed) {
  const reasons = [];
  const visit = (node) => {
    if (typeof node === "string") {
      if (/^\/[^/]/u.test(node)) reasons.push(`${label}: non-portable absolute path value ${node}`);
    } else if (Array.isArray(node)) {
      node.forEach(visit);
    } else if (node && typeof node === "object") {
      Object.values(node).forEach(visit);
    }
  };
  visit(parsed);
  return reasons;
}

function gateReasons(label, parsed) {
  return [...forbiddenKeyReasons(label, parsed), ...absolutePathReasons(label, parsed)];
}

function checkPluginManifest(label, file, { requireVersion, allowAgents }) {
  const reasons = [];
  if (!existsSync(file)) {
    reasons.push(`${label}: missing plugin manifest ${file}`);
    return reasons;
  }
  let parsed;
  try {
    parsed = readJsonFile(file);
  } catch (error) {
    reasons.push(`${label}: invalid JSON (${error.message})`);
    return reasons;
  }
  if (parsed.name !== PLUGIN_NAME) reasons.push(`${label}: plugin name must be ${PLUGIN_NAME}, got ${parsed.name}`);
  if (requireVersion && !isNonEmptyString(parsed.version)) reasons.push(`${label}: missing version`);
  if (!isNonEmptyString(parsed.skills) || !parsed.skills.startsWith("./")) {
    reasons.push(`${label}: skills pointer must be a ./-relative string`);
  }
  if (allowAgents) {
    if (!isNonEmptyString(parsed.agents) || !parsed.agents.startsWith("./")) {
      reasons.push(`${label}: agents pointer must be a ./-relative string`);
    }
  } else if ("agents" in parsed) {
    reasons.push(`${label}: plugin manifest must not declare an agents pointer`);
  }
  reasons.push(...gateReasons(label, parsed));
  return reasons;
}

function marketplaceSourceOk(source) {
  if (typeof source === "string") return source.length > 0;
  if (source && typeof source === "object") {
    return isNonEmptyString(source.path) || isNonEmptyString(source.url) || isNonEmptyString(source.repo);
  }
  return false;
}

function checkMarketplace(label, file) {
  const reasons = [];
  if (!existsSync(file)) {
    reasons.push(`${label}: missing marketplace ${file}`);
    return reasons;
  }
  let parsed;
  try {
    parsed = readJsonFile(file);
  } catch (error) {
    reasons.push(`${label}: invalid JSON (${error.message})`);
    return reasons;
  }
  if (!Array.isArray(parsed.plugins)) {
    reasons.push(`${label}: plugins must be an array`);
    return reasons;
  }
  const entry = parsed.plugins.find((plugin) => plugin && plugin.name === PLUGIN_NAME);
  if (!entry) {
    reasons.push(`${label}: no ${PLUGIN_NAME} entry`);
  } else if (!marketplaceSourceOk(entry.source)) {
    reasons.push(`${label}: ${PLUGIN_NAME} entry has no usable source`);
  }
  reasons.push(...gateReasons(label, parsed));
  return reasons;
}

function checkHooks(label, file) {
  const reasons = [];
  if (!existsSync(file)) {
    reasons.push(`${label}: missing hooks ${file}`);
    return reasons;
  }
  let parsed;
  try {
    parsed = readJsonFile(file);
  } catch (error) {
    reasons.push(`${label}: invalid JSON (${error.message})`);
    return reasons;
  }
  const stop = parsed?.hooks?.Stop;
  if (!Array.isArray(stop) || stop.length === 0) {
    reasons.push(`${label}: missing Stop hook group`);
    return reasons;
  }
  const handlers = stop.flatMap((group) => (Array.isArray(group?.hooks) ? group.hooks : []));
  const command = handlers.find((handler) => handler && handler.type === "command");
  if (!command) reasons.push(`${label}: Stop hook has no command handler`);
  else if (typeof command.timeout !== "number") reasons.push(`${label}: Stop command handler has no numeric timeout`);
  reasons.push(...gateReasons(label, parsed));
  return reasons;
}

function listSkillNames(skillsDir) {
  if (!existsSync(skillsDir)) return [];
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function listAgentNames(agentsDir) {
  if (!existsSync(agentsDir)) return [];
  return readdirSync(agentsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name.replace(/\.md$/u, ""))
    .sort();
}

function setDiffReasons(label, expected, actual) {
  const reasons = [];
  const present = new Set(actual);
  const wanted = new Set(expected);
  for (const name of expected) if (!present.has(name)) reasons.push(`${label}: missing ${name}`);
  for (const name of actual) if (!wanted.has(name)) reasons.push(`${label}: unexpected ${name}`);
  return reasons;
}

function checkComponents(root) {
  const reasons = [];
  const skillsDir = path.join(root, "skills");
  const skills = listSkillNames(skillsDir);
  const expectedSkills = [...EXPECTED_OMP_SKILLS, ...EXPECTED_SHARED_AGENT_PACKAGES].sort();
  reasons.push(...setDiffReasons("skills", expectedSkills, skills));
  for (const name of EXPECTED_OMP_SKILLS) {
    if (skills.includes(name) && !existsSync(path.join(skillsDir, name, "SKILL.md"))) {
      reasons.push(`skills: ${name} has no SKILL.md`);
    }
  }
  for (const name of EXPECTED_SHARED_AGENT_PACKAGES) {
    for (const rel of REQUIRED_SHARED_AGENT_PACKAGE_FILES) {
      if (!existsSync(path.join(skillsDir, name, rel))) {
        reasons.push(`skills: ${name} missing ${rel}`);
      }
    }
  }
  return reasons;
}

function isUnder(target, root) {
  const normalizedRoot = path.resolve(root);
  const normalizedTarget = path.resolve(target);
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(normalizedRoot + path.sep);
}

function checkMarker(ownedRoot, homeRoot) {
  const reasons = [];
  const markerFile = path.join(homeRoot, ".loom-harness", "applied-manifest.json");
  if (!existsSync(markerFile)) {
    reasons.push(`marker: missing ${markerFile}`);
    return reasons;
  }
  let marker;
  try {
    marker = readJsonFile(markerFile);
  } catch (error) {
    reasons.push(`marker: invalid JSON (${error.message})`);
    return reasons;
  }
  const entries = marker.entries && typeof marker.entries === "object" ? marker.entries : {};
  let matched = 0;
  for (const [destination, record] of Object.entries(entries)) {
    if (!destination.startsWith("~/")) continue;
    const live = path.join(homeRoot, destination.slice(2));
    if (!isUnder(live, ownedRoot)) continue;
    matched += 1;
    if (!existsSync(live)) {
      reasons.push(`marker: ${destination} recorded but live file missing`);
      continue;
    }
    if (record && isNonEmptyString(record.sha256) && sha256(readFileSync(live)) !== record.sha256) {
      reasons.push(`marker: ${destination} hash drift`);
    }
  }
  if (matched === 0) reasons.push(`marker: no recorded entries under ${ownedRoot}`);
  return reasons;
}

export function verifyInstall({ root, home, marketplace }) {
  const ownedRoot = path.dirname(root);
  const marketplaceFile = marketplace ?? path.join(ownedRoot, "marketplace.json");
  const reasons = [];
  reasons.push(...checkPluginManifest("codex-plugin", path.join(root, ".codex-plugin", "plugin.json"), { requireVersion: true, allowAgents: false }));
  reasons.push(...checkPluginManifest("claude-plugin", path.join(root, ".claude-plugin", "plugin.json"), { requireVersion: false, allowAgents: false }));
  reasons.push(...checkMarketplace("marketplace", marketplaceFile));
  reasons.push(...checkHooks("hooks", path.join(root, "hooks", "hooks.json")));
  reasons.push(...checkComponents(root));
  reasons.push(...checkMarker(ownedRoot, home));
  return reasons;
}

function readArgs(argv) {
  const options = { root: null, home: null, marketplace: null, json: false };
  const valueFlags = new Map([
    ["--root", "root"],
    ["--home", "home"],
    ["--marketplace", "marketplace"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") {
      console.log(USAGE);
      process.exit(0);
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

function resolveOptions(parsed) {
  const home = parsed.home ? path.resolve(parsed.home) : process.env.HOME ?? homedir();
  const root = parsed.root
    ? path.resolve(parsed.root)
    : process.env.CLAUDE_PLUGIN_ROOT
      ?? process.env.PLUGIN_ROOT
      ?? path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  return { home, root, marketplace: parsed.marketplace ? path.resolve(parsed.marketplace) : null, json: parsed.json };
}

function main() {
  const options = resolveOptions(readArgs(process.argv.slice(2)));
  const reasons = verifyInstall(options);
  if (reasons.length > 0) {
    process.stderr.write(`${JSON.stringify({ ok: false, plugin: PLUGIN_NAME, root: options.root, reasons }, null, 2)}\n`);
    return 1;
  }
  if (options.json) process.stdout.write(`${JSON.stringify({ ok: true, plugin: PLUGIN_NAME }, null, 2)}\n`);
  return 0;
}

// Robust main-module detection: canonicalize both sides through realpath so a symlinked invocation
// path (e.g. macOS /var -> /private/var on a temp install) still runs main().
function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  try {
    process.exit(main());
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, plugin: PLUGIN_NAME, reasons: [`verifier error: ${error.message}`] }, null, 2)}\n`);
    process.exit(2);
  }
}
