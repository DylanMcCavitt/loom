import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  claudePlanPath,
  codexPlanPath,
  codexTemplatesDir,
  ompSourceRoot,
  resourceManifestPath,
} from "./layout.mjs";
import {
  asArray,
  globPatternToRegex,
  isPatternPath,
  normalizePathText,
  pathMatchesLocalOnly,
} from "./harness-safety.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");

export const DEFAULT_RENDER_NUCLEUS_OPTIONS = {
  plan: codexPlanPath,
  claudePlan: claudePlanPath,
  manifest: resourceManifestPath,
  templateDir: codexTemplatesDir,
  ompSource: ompSourceRoot,
};

export function repoPath(relative) {
  return path.isAbsolute(relative) ? relative : path.join(REPO_ROOT, relative);
}

export function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
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

export function localOnlyPatterns(manifest, ...plans) {
  const patterns = new Set();
  for (const resource of manifest.resources ?? []) {
    if (resource.disposition === "local-only") {
      for (const livePath of asArray(resource.currentLivePath)) patterns.add(livePath);
    }
  }
  for (const plan of plans) {
    for (const surface of plan.localOnlyCodexSurfaces ?? []) {
      if (surface.pathPattern) patterns.add(surface.pathPattern);
    }
    for (const surface of plan.localOnlyClaudeSurfaces ?? []) {
      if (surface.pathPattern) patterns.add(surface.pathPattern);
    }
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

function renderedRelForClaude(displayDestination) {
  const scope = displayDestination.startsWith("~/") ? "user" : "project";
  const tail = displayDestination.startsWith("~/")
    ? displayDestination.slice(2)
    : displayDestination.replace(/^\.?\//u, "");
  return path.join("claude", scope, tail);
}

// Reportable Claude boundaries: instruction/settings (LOO-94) plus generated agent and skill
// candidates (LOO-95). The skill-symlink-candidates boundary stays excluded — no whole-root or
// per-skill symlink is ever rendered as a candidate.
const CLAUDE_REPORTABLE_BOUNDARIES = new Set([
  "claude-instructions",
  "claude-settings",
  "claude-agent",
  "claude-skill",
]);

// Code-owned allowlist for the strict-manual apply gate (LOO-151). Only these boundaries may
// ever become appliable under --approve-claude-apply; claude-instructions is deliberately
// excluded so a manifest-only reclassification can never make ~/.claude/CLAUDE.md writable.
const CLAUDE_GATE_APPLIABLE_BOUNDARIES = new Set([
  "claude-settings",
  "claude-agent",
  "claude-skill",
]);

// Resolves one boundary to concrete { templatePath, expandName } entries. Agent and skill
// boundaries fan out over the plan's curated mappings; expandName fills the destination `*`.
function claudeBoundaryEntries(boundary, claudePlan) {
  if (boundary.id === "claude-agent") {
    return (claudePlan.ompAgentMappings ?? [])
      .filter((mapping) => mapping.claudeCandidate && mapping.candidateTemplate)
      .map((mapping) => ({
        templatePath: mapping.candidateTemplate,
        expandName: mapping.claudeCandidate,
      }));
  }
  if (boundary.id === "claude-skill") {
    return (claudePlan.skillCandidateMappings ?? [])
      .filter((mapping) => mapping.generatedClaudeAdapter && mapping.futureSkillName)
      .map((mapping) => ({
        templatePath: mapping.generatedClaudeAdapter,
        expandName: mapping.futureSkillName,
      }));
  }
  return [{ templatePath: boundary.templatePath, expandName: null }];
}

function expandDestination(destination, agentName) {
  return destination.includes("*") ? destination.replace("*", agentName) : destination;
}

function isHarnessPrefixedAgentTemplate(templateRel) {
  return /^omp-/u.test(path.basename(templateRel, ".toml"));
}

export function buildCandidates(plan, manifest, options, claudePlan = null) {
  const localOnly = localOnlyPatterns(manifest, plan, claudePlan ?? {});
  const candidates = [];

  const agentTemplates = (plan.ompAgentMappings ?? [])
    .filter((mapping) => mapping.candidateTemplate && !isHarnessPrefixedAgentTemplate(mapping.candidateTemplate))
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

  // Claude slices (LOO-94 instruction/settings, LOO-95 agents/skills): reported dry-run
  // candidates by default. Under the strict-manual gate (LOO-151), --approve-claude-apply makes
  // home-scoped adapt-disposition candidates from the code-owned boundary allowlist eligible for
  // create-missing-only apply; everything else stays reported and is never written.
  for (const boundary of (claudePlan?.templateBoundaries ?? []).filter((entry) =>
    CLAUDE_REPORTABLE_BOUNDARIES.has(entry.id),
  )) {
    for (const { templatePath, expandName } of claudeBoundaryEntries(boundary, claudePlan)) {
      const source = repoPath(templatePath);
      const content = readFileSync(source, "utf8");
      for (const rawDestination of boundary.candidateDestinations ?? []) {
        const destination = expandDestination(rawDestination, expandName);
        const disposition = resolveDisposition(destination, "claude", manifest, localOnly);
        const gatedAppliable =
          Boolean(options.approveClaudeApply) &&
          CLAUDE_GATE_APPLIABLE_BOUNDARIES.has(boundary.id) &&
          disposition === "adapt" &&
          destination.startsWith("~/");
        candidates.push({
          id: `claude:${boundary.id}:${destination}`,
          harness: "claude",
          boundaryId: boundary.id,
          forbiddenKeys: boundary.forbiddenKeys ?? [],
          source: path.relative(REPO_ROOT, source),
          content,
          renderedRelPath: renderedRelForClaude(destination),
          destination,
          disposition,
          operation: gatedAppliable ? "create-file" : "future-issue-required",
          appliable: gatedAppliable,
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

