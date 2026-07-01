#!/usr/bin/env node
// Cross-harness plugin-bridge renderer (LOO-8 slice 2).
//
// Reuses the slice-1 render-to-write executor (scripts/render-harness-nucleus.mjs) verbatim for the
// safety gate, marker manifest, create-missing-only apply engine, and disposition resolution. This
// script only adds a new candidate source: the tracked loom-nucleus plugin templates under
// adapters/plugin-bridge/, plus three plugin-bridge-specific containment guards layered on top of
// the engine gate before any write:
//   - a destination allowlist: appliable writes may only ever land on the personal marketplace catalog
//     or the co-located loom-nucleus plugin source; any other home track/adapt destination refuses.
//   - template-path validation: template paths are checked (no absolute, no `..`, realpath under the
//     bridge dir) BEFORE the template file is read.
//   - symlink-escape detection: before writing, the live target's existing parent chain is realpathed
//     and required to stay under the real allowed root (rejects a symlinked ~/.agents/plugins ancestor).
//
//   (default) dry-run  — render the plugin/marketplace/skill/agent/hook templates into an ephemeral
//                        temp dir, gate the rendered bytes, and print a deterministic candidate
//                        manifest. Zero writes to any live path.
//   --write            — strict-manual apply. Refuses unless the dry-run render + gate + containment
//                        checks pass clean, then applies create-missing-only against the live HOME and
//                        records the ~/.loom-harness/applied-manifest.json marker. Idempotent.

import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyCandidates,
  loadMarker,
  markerPath,
  renderAndGate,
  resolveDisposition,
  resolveHomeRoot,
  saveMarkerIfChanged,
} from "./render-harness-nucleus.mjs";
import { asArray, normalizePathText } from "./lib/harness-safety.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

export const DEFAULTS = {
  plan: "adapters/plugin-bridge/plan.json",
  manifest: "docs/harness/resource-manifest.json",
  bridgeDir: "adapters/plugin-bridge",
};

// The ONLY home destinations render-plugin-bridge may ever write: the personal marketplace catalog
// and the co-located loom-nucleus plugin source. Everything else is reported; a track/adapt home
// destination outside this root is a containment violation that refuses the write.
export const PLUGIN_BRIDGE_ROOT = "~/.agents/plugins";

const APPROVAL_POLICY =
  "strict-manual (dry-run rendered diff, dangerous-key validation, destination allowlist, symlink-escape guard, live-file backup, marker-tracked create-missing-only)";

const USAGE = [
  "Usage: node scripts/render-plugin-bridge.mjs [options]",
  "  --write                 apply appliable candidates (strict-manual, create-missing-only)",
  "  --json                  emit a machine-readable manifest instead of text",
  "  --home <dir>            resolve ~ live destinations under <dir> (default: $HOME)",
  "  --plan <path>           plugin-bridge plan json",
  "  --manifest <path>       resource manifest json",
  "  --bridge-dir <path>     directory holding the plugin-bridge templates",
  "  -h, --help              show this help",
].join("\n");

export function readArgs(argv) {
  const options = {
    write: false,
    json: false,
    home: null,
    plan: DEFAULTS.plan,
    manifest: DEFAULTS.manifest,
    bridgeDir: DEFAULTS.bridgeDir,
  };
  const valueFlags = new Map([
    ["--home", "home"],
    ["--plan", "plan"],
    ["--manifest", "manifest"],
    ["--bridge-dir", "bridgeDir"],
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

function repoPath(relative) {
  return path.isAbsolute(relative) ? relative : path.join(REPO_ROOT, relative);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

// Local-only destination patterns drawn from the resource manifest (the source of truth for ownership).
export function localOnlyPatterns(manifest) {
  const patterns = new Set();
  for (const resource of manifest.resources ?? []) {
    if (resource.disposition === "local-only") {
      for (const livePath of asArray(resource.currentLivePath)) patterns.add(livePath);
    }
  }
  return [...patterns].sort();
}

// True only for the personal marketplace catalog or the co-located loom-nucleus plugin source.
export function isAllowedPluginDestination(destination) {
  const normalized = normalizePathText(destination);
  if (normalized.split("/").includes("..")) return false;
  return (
    normalized === `${PLUGIN_BRIDGE_ROOT}/marketplace.json` ||
    normalized.startsWith(`${PLUGIN_BRIDGE_ROOT}/loom-nucleus/`)
  );
}

// Finding 3: validate a raw template path BEFORE reading it. Plugin-owned templates must stay
// under the bridge dir; shared-agent package templates are the exception and must come from the
// repo-local canonical `.agents/skills/` source tree.
function resolveTemplatePath(bridgeDir, templateRel) {
  if (typeof templateRel !== "string" || templateRel.length === 0) {
    throw new Error(`invalid template path: ${JSON.stringify(templateRel)}`);
  }
  if (path.isAbsolute(templateRel)) {
    throw new Error(`template path must be relative, not absolute: ${templateRel}`);
  }
  if (templateRel.split(/[\\/]+/u).includes("..")) {
    throw new Error(`template path must not contain '..': ${templateRel}`);
  }

  const normalized = normalizePathText(templateRel);
  const sourceRoot = normalized.startsWith(".agents/skills/")
    ? path.join(REPO_ROOT, ".agents", "skills")
    : bridgeDir;
  const baseReal = realpathSync(sourceRoot);
  const sourcePath = normalized.startsWith(".agents/skills/")
    ? path.resolve(REPO_ROOT, normalized)
    : path.resolve(bridgeDir, normalized);
  const real = realpathSync(sourcePath);
  if (real !== baseReal && !real.startsWith(baseReal + path.sep)) {
    const boundary = normalized.startsWith(".agents/skills/") ? ".agents/skills" : "the bridge dir";
    throw new Error(`template path escapes ${boundary}: ${templateRel}`);
  }
  return real;
}

function renderedRelPathFor(template) {
  const projectDestination = template.destination?.replace(/^\.\//u, "");
  if (projectDestination === "distributions/loom-nucleus/.claude-plugin/marketplace.json") {
    return projectDestination;
  }
  if (template.destination?.startsWith(`${PLUGIN_BRIDGE_ROOT}/loom-nucleus/`)) {
    return path.join("distributions/loom-nucleus", template.destination.slice(`${PLUGIN_BRIDGE_ROOT}/loom-nucleus/`.length));
  }
  return path.join("distributions", template.template);
}

function listPackageFiles(root, current = root, files = []) {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const filePath = path.join(current, entry.name);
    const stat = lstatSync(filePath);
    if (stat.isSymbolicLink()) throw new Error(`package source must not contain symlinks: ${path.relative(REPO_ROOT, filePath)}`);
    if (entry.isDirectory()) {
      listPackageFiles(root, filePath, files);
    } else if (entry.isFile()) {
      files.push(path.relative(root, filePath).split(path.sep).join("/"));
    }
  }
  return files.sort();
}

export function expandedPlanTemplates(plan) {
  const templates = [...(plan.templates ?? [])];
  const seen = new Set(templates.map((template) => template.template));
  for (const agent of plan.agents ?? []) {
    if (!agent.packaged || !agent.packageRoot?.startsWith(".agents/skills/")) continue;
    const packageRoot = repoPath(agent.packageRoot);
    for (const file of listPackageFiles(packageRoot)) {
      const template = `${agent.packageRoot}/${file}`;
      if (seen.has(template)) continue;
      seen.add(template);
      templates.push({
        id: `shared-agent-${agent.name}-${file.replace(/[^a-z0-9]+/giu, "-").replace(/^-|-$/gu, "").toLowerCase()}`,
        kind: "shared-agent-package",
        consumedBy: agent.consumedBy ?? "both",
        template,
        destination: `~/.agents/plugins/loom-nucleus/skills/${agent.name}/${file}`,
        dispositionHarness: "codex",
        notes: "Canonical shared-agent package file sourced from repo .agents/skills and rendered into plugin distribution output.",
      });
    }
  }
  return templates;
}


export function buildPluginCandidates(plan, manifest, options) {
  const bridgeDir = repoPath(options.bridgeDir ?? DEFAULTS.bridgeDir);
  const localOnly = localOnlyPatterns(manifest);
  const candidates = [];

  for (const template of expandedPlanTemplates(plan)) {
    // Finding 3: validate the raw template path before the read.
    const realSource = resolveTemplatePath(bridgeDir, template.template);
    const content = readFileSync(realSource, "utf8");
    const disposition = resolveDisposition(template.destination, template.dispositionHarness, manifest, localOnly);
    // Finding 1: appliable requires a tracked/adapted disposition, a home-anchored destination, AND a
    // destination inside the plugin-bridge write allowlist. Anything else is reported, never written.
    const appliable =
      (disposition === "track" || disposition === "adapt") &&
      template.destination.startsWith("~/") &&
      isAllowedPluginDestination(template.destination);
    candidates.push({
      id: `${template.dispositionHarness}:${template.id}:${template.destination}`,
      harness: template.dispositionHarness,
      kind: template.kind,
      consumedBy: template.consumedBy,
      boundaryId: null,
      forbiddenKeys: template.forbiddenKeys ?? [],
      source: path.relative(REPO_ROOT, realSource),
      content,
      renderedRelPath: renderedRelPathFor(template),
      destination: template.destination,
      disposition,
      operation: "create-file",
      appliable,
    });
  }

  candidates.sort((left, right) => {
    if (left.destination !== right.destination) return left.destination.localeCompare(right.destination);
    return left.renderedRelPath.localeCompare(right.renderedRelPath);
  });
  return { candidates, localOnly };
}

// Finding 1: any home-anchored track/adapt candidate outside the write allowlist is a containment
// violation (refuses the whole write), in addition to being marked non-appliable.
export function containmentFindings(candidates) {
  const findings = [];
  for (const candidate of candidates) {
    const writeDisposition = candidate.disposition === "track" || candidate.disposition === "adapt";
    if (
      candidate.destination.startsWith("~/") &&
      writeDisposition &&
      !isAllowedPluginDestination(candidate.destination)
    ) {
      findings.push(
        `${candidate.id}: home destination ${candidate.destination} is outside the plugin-bridge write allowlist (${PLUGIN_BRIDGE_ROOT}/marketplace.json or ${PLUGIN_BRIDGE_ROOT}/loom-nucleus/**)`,
      );
    }
  }
  return [...new Set(findings)].sort();
}

// Deepest existing ancestor of `p` (p itself if it exists).
function existingAncestor(p) {
  let current = path.resolve(p);
  while (!existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return current;
}

// Finding 2: applyCandidates joins lexically, so a symlinked ~/.agents/plugins (or any ancestor up to
// it) would redirect a create-missing write outside the boundary. Before writing, realpath every
// existing component on the path down to the target and require each to stay within the real allowed
// root (or be an ancestor of it, e.g. ~/.agents before ~/.agents/plugins is created).
function symlinkEscapeReason(destination, homeRoot) {
  if (!destination.startsWith("~/")) return null;
  if (!existsSync(homeRoot)) return null;
  const realHome = realpathSync(path.resolve(homeRoot));
  const allowedRoot = path.join(realHome, ".agents", "plugins");
  const livePath = path.join(realHome, destination.slice(2));
  if (livePath !== allowedRoot && !livePath.startsWith(allowedRoot + path.sep)) {
    return `${destination}: resolves outside the plugin-bridge root`;
  }
  let probe = livePath;
  while (probe !== realHome) {
    if (existsSync(probe)) {
      const real = realpathSync(probe);
      const underAllowed = real === allowedRoot || real.startsWith(allowedRoot + path.sep);
      const ancestorOfAllowed = real === allowedRoot || allowedRoot.startsWith(real + path.sep);
      if (!underAllowed && !ancestorOfAllowed) {
        return `${destination}: a symlinked path component escapes the plugin-bridge root (${probe} -> ${real})`;
      }
      if (lstatSync(probe).isSymbolicLink() && !underAllowed) {
        return `${destination}: symlinked parent ${probe} rejected`;
      }
    }
    const parent = path.dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  return null;
}

export function symlinkContainmentFindings(candidates, homeRoot) {
  const findings = [];
  for (const candidate of candidates) {
    if (!candidate.appliable) continue;
    const reason = symlinkEscapeReason(candidate.destination, homeRoot);
    if (reason) findings.push(reason);
  }
  return [...new Set(findings)].sort();
}

// The full plugin-bridge gate: the engine's render + safety gate plus the plugin-bridge containment
// checks (destination allowlist + symlink-escape). Any finding refuses the write.
export function pluginBridgeGate(candidates, localOnly, homeRoot) {
  return [
    ...new Set([
      ...containmentFindings(candidates),
      ...symlinkContainmentFindings(candidates, homeRoot),
      ...renderAndGate(candidates, localOnly),
    ]),
  ].sort();
}

// Refuses unless a clean render + gate + containment, then applies create-missing-only and records
// the marker. Reuses the engine's applyCandidates + saveMarkerIfChanged verbatim.
export function gateAndApply(candidates, localOnly, homeRoot, marker) {
  const findings = pluginBridgeGate(candidates, localOnly, homeRoot);
  if (findings.length > 0) {
    return { refused: true, findings, actions: [], backups: [], markerChanged: false };
  }
  const { actions, backups } = applyCandidates(candidates, homeRoot, marker);
  const markerChanged = saveMarkerIfChanged(homeRoot, marker);
  return { refused: false, findings: [], actions, backups, markerChanged };
}

function buildManifest(plan, candidates, localOnly, mode) {
  const reported = candidates.map((candidate) => ({
    id: candidate.id,
    kind: candidate.kind,
    consumedBy: candidate.consumedBy,
    harness: candidate.harness,
    source: candidate.source,
    destination: candidate.destination,
    disposition: candidate.disposition,
    appliable: candidate.appliable,
  }));
  return {
    mode,
    approvalPolicy: "strict-manual",
    plugin: plan.pluginName,
    pluginVersion: plan.pluginVersion,
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
  lines.push("Plugin-bridge renderer");
  lines.push(`Mode: ${manifest.mode}`);
  lines.push(`Plugin: ${manifest.plugin}@${manifest.pluginVersion}`);
  lines.push(`Approval policy: ${APPROVAL_POLICY}`);
  lines.push(`Rendered files: ${manifest.renderedFiles} (temp only; no live path written in dry-run)`);
  lines.push("");
  lines.push("[appliable candidates] (track/adapt + home-anchored + inside the write allowlist)");
  for (const entry of manifest.candidates.filter((candidate) => candidate.appliable)) {
    lines.push(`- ${entry.destination}`);
    lines.push(`  kind: ${entry.kind} (consumedBy: ${entry.consumedBy})`);
    lines.push(`  source: ${entry.source}`);
    lines.push(`  disposition: ${entry.disposition}`);
  }
  lines.push("");
  lines.push("[reported candidates] (reference-only/project-scoped; rendered + validated, never written to HOME)");
  for (const entry of manifest.candidates.filter((candidate) => !candidate.appliable)) {
    lines.push(`- ${entry.destination}`);
    lines.push(`  kind: ${entry.kind} (consumedBy: ${entry.consumedBy})`);
    lines.push(`  disposition: ${entry.disposition}`);
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

function runDryRun(plan, candidates, localOnly, options, homeRoot) {
  const findings = pluginBridgeGate(candidates, localOnly, homeRoot);
  const manifest = buildManifest(plan, candidates, localOnly, "dry-run");
  if (options.json) {
    console.log(JSON.stringify({ ...manifest, result: findings.length === 0 ? "pass" : "fail", findings }, null, 2));
  } else {
    console.log(printTextManifest(manifest, findings));
  }
  return findings.length === 0 ? 0 : 1;
}

function runWrite(plan, candidates, localOnly, options, homeRoot, marker) {
  const { refused, findings, actions, backups, markerChanged } = gateAndApply(candidates, localOnly, homeRoot, marker);
  if (refused) {
    if (options.json) {
      console.log(JSON.stringify({ mode: "write", result: "fail", refused: true, findings }, null, 2));
    } else {
      console.error("Refusing to write: plugin-bridge safety gate failed:");
      for (const finding of findings) console.error(`- ${finding}`);
    }
    return 1;
  }
  if (options.json) {
    console.log(
      JSON.stringify(
        { mode: "write", result: "pass", approvalPolicy: "strict-manual", actions, backups, markerManifest: markerPath(homeRoot), markerChanged },
        null,
        2,
      ),
    );
  } else {
    const lines = ["Plugin-bridge renderer", "Mode: write", `Approval policy: ${APPROVAL_POLICY}`, "", "[write actions]"];
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
  const { candidates, localOnly } = buildPluginCandidates(plan, manifest, options);
  const homeRoot = resolveHomeRoot(options);
  if (!options.write) return runDryRun(plan, candidates, localOnly, options, homeRoot);
  const marker = loadMarker(homeRoot);
  return runWrite(plan, candidates, localOnly, options, homeRoot, marker);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message);
    console.error(USAGE);
    process.exit(2);
  }
}
