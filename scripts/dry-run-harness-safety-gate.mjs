#!/usr/bin/env node
import { existsSync, lstatSync, readFileSync, readlinkSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  PRIVATE_HOME_PATH_PATTERN,
  SECRET_PATTERNS,
  MANIFEST_DISPOSITIONS as DISPOSITIONS,
  MANIFEST_SOURCE_HARNESSES as SOURCE_HARNESSES,
  textOf,
  asArray,
  isNonEmptyString,
  normalizePathText,
  isPatternPath,
  globPatternToRegex,
  pathMatchesLocalOnly,
  secretError,
  dangerousPathReason,
  scanHarnessSafety,
  validateHarnessManifest as validateManifestResourceManifest,
} from "./lib/harness-safety.mjs";
import {
  codexPlanPath,
  compatSkillsRoot,
  claudePlanPath,
  dryRunLinkPlanPath,
  nucleusSkillsRoot,
  nucleusUtilitiesRoot,
  resourceManifestPath,
} from "./lib/layout.mjs";

const USAGE = [
  "Usage: node scripts/dry-run-harness-safety-gate.mjs",
  "  [--manifest <path>]",
  "  [--plan <path>]",
  "  [--codex-plan <path>]",
  "  [--claude-plan <path>]",
  "  [--check-live]",
  "  [--skip-git-tracked-check]",
  "  [--source-root <dir>]",
].join(" ");

const DEFAULT_MANIFEST = resourceManifestPath;
const DEFAULT_PLAN = dryRunLinkPlanPath;
const DEFAULT_CODEX_PLAN = codexPlanPath;
const DEFAULT_CLAUDE_PLAN = claudePlanPath;
const LINK_MODES = new Set(["candidate-symlink", "report-only"]);
const REQUIRED_LINK_FIELDS = [
  "id",
  "sourceHarness",
  "sourceResource",
  "mode",
  "livePath",
  "disposition",
];
const REQUIRED_GENERATED_FIELDS = [
  "id",
  "sourceHarness",
  "operation",
  "destination",
  "sourceTemplate",
  "status",
  "approval",
];
const REQUIRED_HARNESSES = ["omp", "codex", "claude"];

const SOURCE_SCAN_SCOPES = [
  /^docs\//u,
  /^adapters\/omp\/source\//u,
  /^scripts\//u,
];
const SOURCE_SCAN_PATTERN_DEFINITIONS = new Set([
  "scripts/dry-run-harness-safety-gate.mjs",
  "scripts/validate-claude-adapter-plan.mjs",
  "scripts/validate-codex-adapter-plan.mjs",
  "scripts/validate-harness-manifest.mjs",
  "scripts/validate-omp-builtins-snapshot.mjs",
  "scripts/validate-skills.mjs",
  "scripts/lib/harness-safety.mjs",
]);

function readArgs(argv) {
  const options = {
    manifest: DEFAULT_MANIFEST,
    plan: DEFAULT_PLAN,
    codexPlan: DEFAULT_CODEX_PLAN,
    claudePlan: DEFAULT_CLAUDE_PLAN,
    checkLive: false,
    skipGitTrackedCheck: false,
    sourceRoot: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log(USAGE);
      process.exit(0);
    }
    if (arg === "--check-live") {
      options.checkLive = true;
      continue;
    }
    if (arg === "--skip-git-tracked-check") {
      options.skipGitTrackedCheck = true;
      continue;
    }
    if (!["--manifest", "--plan", "--codex-plan", "--claude-plan", "--source-root"].includes(arg)) {
      throw new Error(`Unknown option: ${arg}`);
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`${arg} requires a value`);
    }
    if (arg === "--manifest") options.manifest = next;
    if (arg === "--plan") options.plan = next;
    if (arg === "--codex-plan") options.codexPlan = next;
    if (arg === "--claude-plan") options.claudePlan = next;
    if (arg === "--source-root") options.sourceRoot = next;
    index += 1;
  }
  return options;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(path.resolve(filePath), "utf8"));
}

function isMergeDestination(value) {
  return /\s+entries\b/iu.test(String(value ?? ""));
}

function mergeBasePath(value) {
  return String(value).split(/\s+/u)[0];
}

function resolveDisplayPath(value) {
  if (!isNonEmptyString(value)) return null;
  if (value.startsWith("repo:")) return path.resolve(value.slice("repo:".length));
  if (value.startsWith("~/")) return path.join(homedir(), value.slice(2));
  if (path.isAbsolute(value)) return value;
  return path.resolve(value);
}

function inspectPath(displayPath, checkLive) {
  if (!isNonEmptyString(displayPath)) {
    return { status: "not planned", symlink: "not applicable" };
  }
  if (isPatternPath(displayPath)) {
    return { status: "pattern", symlink: "not applicable" };
  }
  if (!checkLive) {
    return { status: "not checked", symlink: "not checked" };
  }
  const actualPath = resolveDisplayPath(displayPath);
  try {
    const stat = lstatSync(actualPath);
    if (stat.isSymbolicLink()) {
      return { status: "present", type: "symlink", symlink: readlinkSync(actualPath) };
    }
    if (stat.isDirectory()) return { status: "present", type: "directory", symlink: "not a symlink" };
    if (stat.isFile()) return { status: "present", type: "file", symlink: "not a symlink" };
    return { status: "present", type: "other", symlink: "not a symlink" };
  } catch (error) {
    if (error?.code === "ENOENT") return { status: "missing", symlink: "not applicable" };
    return { status: `error: ${error.message}`, symlink: "unknown" };
  }
}

function inspectOverwriteRisk(destination, checkLive) {
  if (isMergeDestination(destination)) {
    const base = mergeBasePath(destination);
    const inspection = inspectPath(base, checkLive);
    if (!checkLive) return "not checked";
    if (inspection.status === "present") return `merge into existing ${base}`;
    if (inspection.status === "missing") return `merge target missing: ${base}`;
    return inspection.status;
  }
  if (isPatternPath(destination)) return "pattern requires explicit file review";
  const inspection = inspectPath(destination, checkLive);
  if (!checkLive) return "not checked";
  if (inspection.status === "present") return `would overwrite existing ${inspection.type ?? "path"}`;
  if (inspection.status === "missing") return "no existing file";
  return inspection.status;
}

function validateManifest(manifest) {
  return validateManifestResourceManifest(manifest);
}


function validateCodexPlan(codexPlan) {
  const errors = [];
  const localOnlyPatterns = [];
  const generatedSurfaces = [];

  if (codexPlan.schemaVersion !== 1) errors.push("codex plan: schemaVersion must be 1");
  errors.push(...scanHarnessSafety("codex plan", codexPlan));

  for (const surface of codexPlan.localOnlyCodexSurfaces ?? []) {
    if (isNonEmptyString(surface.pathPattern)) localOnlyPatterns.push(surface.pathPattern);
  }
  for (const surface of codexPlan.generatedCandidateSurfaces ?? []) {
    if (surface.status !== "dry-run-only") {
      errors.push(`codex plan: generated surface ${surface.surface} must be dry-run-only`);
    }
    if (isNonEmptyString(surface.surface)) generatedSurfaces.push(surface);
  }
  return { errors, localOnlyPatterns, generatedSurfaces };
}

function validateClaudePlan(claudePlan) {
  const errors = [];
  const localOnlyPatterns = [];
  const generatedSurfaces = [];

  if (claudePlan.schemaVersion !== 1) errors.push("claude plan: schemaVersion must be 1");
  errors.push(...scanHarnessSafety("claude plan", claudePlan));

  for (const surface of claudePlan.localOnlyClaudeSurfaces ?? []) {
    if (isNonEmptyString(surface.pathPattern)) localOnlyPatterns.push(surface.pathPattern);
  }
  for (const surface of claudePlan.generatedCandidateSurfaces ?? []) {
    if (surface.status !== "dry-run-only") {
      errors.push(`claude plan: generated surface ${surface.surface} must be dry-run-only`);
    }
    if (isNonEmptyString(surface.surface)) generatedSurfaces.push(surface);
  }
  return { errors, localOnlyPatterns, generatedSurfaces };
}

function validateTemplatePath(templatePath, errors, label) {
  if (!isNonEmptyString(templatePath)) return;
  if (isPatternPath(templatePath)) {
    const prefix = templatePath.slice(0, templatePath.search(/[*?[{]/u));
    const directory = prefix.endsWith("/") ? prefix.slice(0, -1) : path.dirname(prefix);
    if (!existsSync(path.resolve(directory))) {
      errors.push(`${label}: sourceTemplate parent does not exist: ${directory}`);
    }
    return;
  }
  if (!existsSync(path.resolve(templatePath))) {
    errors.push(`${label}: sourceTemplate does not exist: ${templatePath}`);
  }
}

function isBulkClaudeSkillRootLink(link) {
  if (link.sourceHarness !== "claude" || link.mode !== "candidate-symlink") return false;
  const live = normalizePathText(link.livePath).replace(/\/$/u, "");
  const target = normalizePathText(link.proposedTarget).replace(/\/$/u, "");
  return live === "~/.claude/skills"
    || live === ".claude/skills"
    || target === compatSkillsRoot
    || target === nucleusSkillsRoot
    || target === `~/${compatSkillsRoot}`;
}

function validatePlan(plan, manifestInfo, codexInfo, claudeInfo, options) {
  const errors = [];
  const warnings = [];
  const activeLinks = [];
  const generatedDestinations = [];
  const seenLinkIds = new Set();
  const seenLinkLivePaths = new Map();
  const seenGeneratedIds = new Set();
  const localOnlyPatterns = [...manifestInfo.localOnlyPatterns, ...codexInfo.localOnlyPatterns, ...claudeInfo.localOnlyPatterns];

  if (plan.schemaVersion !== 1) errors.push("plan: schemaVersion must be 1");
  if (!Array.isArray(plan.candidateLinks)) errors.push("plan: candidateLinks must be an array");
  if (!Array.isArray(plan.generatedConfigDestinations)) errors.push("plan: generatedConfigDestinations must be an array");

  errors.push(...scanHarnessSafety("plan", plan));

  for (const [index, link] of (plan.candidateLinks ?? []).entries()) {
    const label = link?.id || `candidateLinks[${index}]`;
    if (!link || typeof link !== "object" || Array.isArray(link)) {
      errors.push(`${label}: must be an object`);
      continue;
    }
    for (const field of REQUIRED_LINK_FIELDS) {
      if (!(field in link)) errors.push(`${label}: missing required field ${field}`);
    }
    if (!isNonEmptyString(link.id)) {
      errors.push(`${label}: id must be a non-empty string`);
    } else if (seenLinkIds.has(link.id)) {
      errors.push(`${label}: duplicate candidate link id`);
    } else {
      seenLinkIds.add(link.id);
    }
    if (!SOURCE_HARNESSES.has(link.sourceHarness) || link.sourceHarness === "cross-harness") {
      errors.push(`${label}: sourceHarness must be omp, codex, or claude`);
    }
    if (!LINK_MODES.has(link.mode)) errors.push(`${label}: mode must be one of ${[...LINK_MODES].join(", ")}`);
    if (!DISPOSITIONS.has(link.disposition)) errors.push(`${label}: disposition must be one of ${[...DISPOSITIONS].join(", ")}`);
    if (link.disposition === "local-only") errors.push(`${label}: local-only resources cannot be candidate links`);
    if (link.mode === "candidate-symlink" && !isNonEmptyString(link.proposedTarget)) {
      errors.push(`${label}: candidate-symlink requires proposedTarget`);
    }
    if (link.mode === "report-only" && link.proposedTarget !== null && link.proposedTarget !== undefined) {
      errors.push(`${label}: report-only links must use proposedTarget null or omit it`);
    }
    if (isBulkClaudeSkillRootLink(link)) {
      errors.push(`${label}: bulk Claude skill-root symlinks are forbidden; use curated per-skill candidates`);
    }

    const resource = manifestInfo.byId.get(link.sourceResource);
    if (!resource) {
      errors.push(`${label}: sourceResource not found in manifest: ${link.sourceResource}`);
    } else {
      if (resource.disposition === "local-only") {
        errors.push(`${label}: sourceResource ${link.sourceResource} is local-only`);
      }
      if (resource.disposition !== link.disposition) {
        errors.push(`${label}: disposition ${link.disposition} does not match sourceResource ${resource.disposition}`);
      }
      if (resource.sourceHarness !== link.sourceHarness) {
        errors.push(`${label}: sourceHarness ${link.sourceHarness} does not match sourceResource ${resource.sourceHarness}`);
      }
    }

    const liveOwner = seenLinkLivePaths.get(link.livePath);
    if (liveOwner && liveOwner !== label) {
      warnings.push(`duplicate candidate live path ${link.livePath} appears in ${liveOwner} and ${label}`);
    } else {
      seenLinkLivePaths.set(link.livePath, label);
    }

    for (const [field, value] of [["livePath", link.livePath], ["proposedTarget", link.proposedTarget]]) {
      if (!isNonEmptyString(value)) continue;
      const reason = dangerousPathReason(value);
      if (reason) errors.push(`${label}: ${field} is dangerous ${reason}: ${value}`);
    }
    if (pathMatchesLocalOnly(link.proposedTarget, localOnlyPatterns)) {
      errors.push(`${label}: proposedTarget matches a local-only runtime path: ${link.proposedTarget}`);
    }
    if (pathMatchesLocalOnly(link.livePath, localOnlyPatterns)) {
      errors.push(`${label}: livePath is a local-only runtime path and cannot be linked: ${link.livePath}`);
    }
    if (isNonEmptyString(link.proposedTarget) && !link.proposedTarget.startsWith("repo:")) {
      errors.push(`${label}: proposedTarget must be repo-relative via repo:<path>, not ${link.proposedTarget}`);
    }
    if (isNonEmptyString(link.proposedTarget) && !isPatternPath(link.proposedTarget) && !existsSync(resolveDisplayPath(link.proposedTarget))) {
      errors.push(`${label}: proposedTarget does not exist: ${link.proposedTarget}`);
    }
    activeLinks.push(link);
  }

  for (const harness of REQUIRED_HARNESSES) {
    if (!activeLinks.some((link) => link.sourceHarness === harness)) {
      errors.push(`plan: missing active ${harness} candidate link`);
    }
  }

  for (const [index, destination] of (plan.generatedConfigDestinations ?? []).entries()) {
    const label = destination?.id || `generatedConfigDestinations[${index}]`;
    if (!destination || typeof destination !== "object" || Array.isArray(destination)) {
      errors.push(`${label}: must be an object`);
      continue;
    }
    for (const field of REQUIRED_GENERATED_FIELDS) {
      if (!(field in destination)) errors.push(`${label}: missing required field ${field}`);
    }
    if (!isNonEmptyString(destination.id)) {
      errors.push(`${label}: id must be a non-empty string`);
    } else if (seenGeneratedIds.has(destination.id)) {
      errors.push(`${label}: duplicate generated destination id`);
    } else {
      seenGeneratedIds.add(destination.id);
    }
    if (!SOURCE_HARNESSES.has(destination.sourceHarness) || destination.sourceHarness === "cross-harness") {
      errors.push(`${label}: sourceHarness must be omp, codex, or claude`);
    }
    if (destination.status !== "dry-run-only") {
      errors.push(`${label}: status must be dry-run-only`);
    }
    if (destination.approval !== "future-issue-required") {
      errors.push(`${label}: approval must be future-issue-required`);
    }
    const reason = dangerousPathReason(destination.destination);
    if (reason) errors.push(`${label}: destination is dangerous ${reason}: ${destination.destination}`);
    if (pathMatchesLocalOnly(destination.destination, localOnlyPatterns)) {
      errors.push(`${label}: destination matches a local-only runtime path: ${destination.destination}`);
    }
    validateTemplatePath(destination.sourceTemplate, errors, label);
    generatedDestinations.push(destination);
  }

  const planGeneratedSurfaces = new Set(generatedDestinations.map((destination) => destination.destination));
  for (const codexSurface of codexInfo.generatedSurfaces) {
    if (!planGeneratedSurfaces.has(codexSurface.surface)) {
      errors.push(`plan: missing generated destination from Codex adapter plan: ${codexSurface.surface}`);
    }
  }
  for (const claudeSurface of claudeInfo.generatedSurfaces) {
    if (!planGeneratedSurfaces.has(claudeSurface.surface)) {
      errors.push(`plan: missing generated destination from Claude adapter plan: ${claudeSurface.surface}`);
    }
  }

  return { errors, warnings, activeLinks, generatedDestinations, localOnlyPatterns };
}

function trackedPathErrors() {
  const errors = [];
  const result = spawnSync("git", ["ls-files", "-z"], { encoding: "utf8" });
  if (result.status !== 0) return [`git tracked path check failed: ${result.stderr || result.stdout}`];
  for (const trackedPath of result.stdout.split("\0").filter(Boolean)) {
    // Skill content lives under the canonical skills root and rendered compat skills root; skill names such as "computer-use"
    // or "browser" legitimately match runtime-state path tokens. Skill files are
    // secret-scanned by validate-skills and the tracked-source content scan, so they
    // are exempt from this runtime-state path-name check.
    if (trackedPath.startsWith(`${nucleusSkillsRoot}/`) || trackedPath.startsWith(`${nucleusUtilitiesRoot}/`) || trackedPath.startsWith(`${compatSkillsRoot}/`)) continue;
    const reason = dangerousPathReason(trackedPath);
    if (reason) errors.push(`tracked repo path is dangerous ${reason}: ${trackedPath}`);
  }
  return errors;
}

function normalizeRelativePath(filePath) {
  return filePath.replaceAll(path.sep, "/");
}

function isInSourceScanScope(relativePath) {
  return SOURCE_SCAN_SCOPES.some((scope) => scope.test(relativePath));
}

function collectSourceRootFiles(root, current = root) {
  const files = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === ".DS_Store") continue;
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceRootFiles(root, fullPath));
    } else if (entry.isFile()) {
      files.push(normalizeRelativePath(path.relative(root, fullPath)));
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function isAllowedPatternDefinitionLine(relativePath, line) {
  if (!SOURCE_SCAN_PATTERN_DEFINITIONS.has(relativePath)) return false;
  return /PRIVATE_HOME_PATH_PATTERN\s*=|\/\\bgh\[pousr\]|\/\\bgithub_pat_|\/\\bsk-|\/\\bAKIA|api\[_-\]\?key/u.test(line);
}

function listSourceScanFiles(options) {
  if (options.sourceRoot) {
    const root = path.resolve(options.sourceRoot);
    return {
      errors: [],
      root,
      files: collectSourceRootFiles(root).filter(isInSourceScanScope),
    };
  }
  const result = spawnSync("git", ["ls-files", "-z"], { encoding: "utf8" });
  if (result.status !== 0) {
    return {
      errors: [`tracked source scan failed: ${result.stderr || result.stdout}`],
      root: process.cwd(),
      files: [],
    };
  }
  return {
    errors: [],
    root: process.cwd(),
    files: result.stdout.split("\0").filter(Boolean).map(normalizeRelativePath).filter(isInSourceScanScope),
  };
}

function trackedSourceErrors(options) {
  const listing = listSourceScanFiles(options);
  const errors = [...listing.errors];
  let scannedFiles = 0;
  for (const relativePath of listing.files) {
    const filePath = path.join(listing.root, relativePath);
    let content = "";
    try {
      content = readFileSync(filePath, "utf8");
    } catch (error) {
      errors.push(`tracked source scan failed for ${relativePath}: ${error.message}`);
      continue;
    }
    if (content.includes("\u0000")) continue;
    scannedFiles += 1;
    const lines = content.split(/\r?\n/u);
    for (const [lineIndex, line] of lines.entries()) {
      const location = `${relativePath}:${lineIndex + 1}`;
      if (PRIVATE_HOME_PATH_PATTERN.test(line) && !isAllowedPatternDefinitionLine(relativePath, line)) {
        errors.push(`${location}: tracked source contains absolute private home path`);
      }
      if (SECRET_PATTERNS.some((pattern) => pattern.test(line)) && !isAllowedPatternDefinitionLine(relativePath, line)) {
        errors.push(`${location}: tracked source contains API-key/token/secret-looking text`);
      }
    }
  }
  return { errors, scannedFiles };
}

function printLink(link, options) {
  const live = inspectPath(link.livePath, options.checkLive);
  const target = inspectPath(link.proposedTarget, options.checkLive);
  console.log(`- ${link.id}`);
  console.log(`  mode: ${link.mode}`);
  console.log(`  disposition: ${link.disposition}`);
  console.log(`  live: ${link.livePath}`);
  console.log(`  liveStatus: ${live.status}${live.type ? ` (${live.type})` : ""}`);
  console.log(`  liveSymlink: ${live.symlink}`);
  console.log(`  plannedTarget: ${link.proposedTarget ?? "none"}`);
  console.log(`  targetStatus: ${target.status}${target.type ? ` (${target.type})` : ""}`);
  console.log(`  notes: ${link.notes ?? ""}`);
}

function printGenerated(destination, options) {
  console.log(`- ${destination.id}`);
  console.log(`  operation: ${destination.operation}`);
  console.log(`  destination: ${destination.destination}`);
  console.log(`  sourceTemplate: ${destination.sourceTemplate}`);
  console.log(`  overwriteRisk: ${inspectOverwriteRisk(destination.destination, options.checkLive)}`);
  console.log(`  approval: ${destination.approval}`);
}

function printReport(options, manifestInfo, codexInfo, claudeInfo, planInfo, sourceInfo) {
  console.log("Harness dry-run safety gate");
  console.log(`Manifest: ${options.manifest}`);
  console.log(`Plan: ${options.plan}`);
  console.log(`Codex adapter plan: ${options.codexPlan}`);
  console.log(`Claude adapter plan: ${options.claudePlan}`);
  console.log("Mutation: disabled");
  console.log(`Live link check: ${options.checkLive ? "path-only" : "disabled"}`);
  console.log("");
  console.log(`Manifest validation: passed (${manifestInfo.resources.length} resources)`);
  console.log(`Local-only symlink target guard: passed (${planInfo.localOnlyPatterns.length} patterns blocked)`);
  console.log(`Generated surface sync: passed (${codexInfo.generatedSurfaces.length} Codex surfaces, ${claudeInfo.generatedSurfaces.length} Claude surfaces covered)`);
  console.log(`Tracked source content scan: passed (${sourceInfo.scannedFiles} files scanned)`);
  console.log("");

  console.log("[candidate live links]");
  for (const harness of REQUIRED_HARNESSES) {
    console.log(`[${harness}]`);
    for (const link of planInfo.activeLinks.filter((candidate) => candidate.sourceHarness === harness)) {
      printLink(link, options);
    }
  }

  console.log("");
  console.log("[generated config destinations]");
  for (const destination of planInfo.generatedDestinations) {
    printGenerated(destination, options);
  }

  console.log("");
  console.log("[local-only ignored]");
  for (const resource of manifestInfo.resources.filter((candidate) => candidate.disposition === "local-only")) {
    console.log(`- ${resource.id}: ${asArray(resource.currentLivePath).join(", ")}`);
  }
  for (const surface of codexInfo.localOnlyPatterns) {
    console.log(`- codex adapter: ${surface}`);
  }
  for (const surface of claudeInfo.localOnlyPatterns) {
    console.log(`- claude adapter: ${surface}`);
  }

  console.log("");
  console.log("[duplicates]");
  const duplicateWarnings = [...manifestInfo.warnings, ...planInfo.warnings];
  if (duplicateWarnings.length === 0) {
    console.log("- none");
  } else {
    for (const warning of duplicateWarnings) console.log(`- ${warning}`);
  }
  console.log("");
  console.log("Result: passed");
}

try {
  const options = readArgs(process.argv.slice(2));
  const manifest = readJson(options.manifest);
  const plan = readJson(options.plan);
  const codexPlan = readJson(options.codexPlan);
  const claudePlan = readJson(options.claudePlan);

  const manifestInfo = validateManifest(manifest);
  const codexInfo = validateCodexPlan(codexPlan);
  const claudeInfo = validateClaudePlan(claudePlan);
  const planInfo = validatePlan(plan, manifestInfo, codexInfo, claudeInfo, options);
  const errors = [...manifestInfo.errors, ...codexInfo.errors, ...claudeInfo.errors, ...planInfo.errors];
  if (!options.skipGitTrackedCheck && !options.sourceRoot) errors.push(...trackedPathErrors());
  const sourceInfo = trackedSourceErrors(options);
  errors.push(...sourceInfo.errors);

  if (errors.length > 0) {
    console.error("Harness dry-run safety gate failed:");
    for (const error of errors) console.error(`- ${error}`);
    console.error(USAGE);
    process.exit(1);
  }

  printReport(options, manifestInfo, codexInfo, claudeInfo, planInfo, sourceInfo);
} catch (error) {
  console.error(error.message);
  console.error(USAGE);
  process.exit(2);
}
