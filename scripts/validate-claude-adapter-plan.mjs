#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { claudeTemplatesDir } from "./lib/layout.mjs";
import { parseFrontmatter as parseMarkdownFrontmatter } from "./lib/frontmatter.mjs";
import { scanHarnessSafety } from "./lib/harness-safety.mjs";

const PLAN_PATH = process.env.CLAUDE_ADAPTER_PLAN_PATH ?? "docs/harness/claude-adapter-plan/adapter-plan.json";
const SOURCE_PATH = "distributions/snapshots/omp-builtins/source.json";
const PORTABILITY_PATH = "distributions/snapshots/omp-builtins/portability-matrix.json";
const PLAN_MD_PATH = "docs/harness/claude-adapter-plan.md";
const DEFAULT_TEMPLATE_DIR = claudeTemplatesDir;
const TEMPLATE_DIR = process.env.CLAUDE_ADAPTER_PLAN_TEMPLATE_DIR ?? DEFAULT_TEMPLATE_DIR;

const RECOMMENDATIONS = new Set(["keep", "adapt", "drop"]);
const READ_ONLY_AGENT_FORBIDDEN_TOOLS = new Set(["Edit", "Write", "Bash"]);
function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function relative(filePath) {
  return path.relative(process.cwd(), filePath).split(path.sep).join("/");
}

function walkFiles(root, predicate = () => true) {
  const result = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...walkFiles(full, predicate));
    } else if (entry.isFile() && predicate(full)) {
      result.push(full);
    }
  }
  return result.sort();
}

function readTemplateFrontmatter(filePath, errors) {
  const text = readFileSync(filePath, "utf8");
  const parsed = parseMarkdownFrontmatter(text);
  if (!parsed) {
    errors.push(`${relative(filePath)}: missing YAML frontmatter`);
    return { data: {}, body: text };
  }
  for (const invalid of parsed.invalidLines) {
    errors.push(`${relative(filePath)}: unsupported frontmatter line ${invalid.text.trim()}`);
  }
  return { data: parsed.values, body: parsed.body };
}


function collectJsonKeys(value, prefix = "", keys = new Set()) {
  if (Array.isArray(value)) {
    keys.add(prefix);
    return keys;
  }
  if (!value || typeof value !== "object") return keys;
  for (const key of Object.keys(value)) {
    const next = prefix ? `${prefix}.${key}` : key;
    keys.add(next);
    collectJsonKeys(value[key], next, keys);
  }
  return keys;
}

function keyMatchesForbidden(key, forbidden) {
  return key === forbidden || key.startsWith(`${forbidden}.`) || key.endsWith(`.${forbidden}`);
}

function resolveTemplatePath(templatePath) {
  const normalized = templatePath.split("/").join(path.sep);
  const defaultRoot = DEFAULT_TEMPLATE_DIR.split("/").join(path.sep);
  if (!normalized.startsWith(`${defaultRoot}${path.sep}`)) return templatePath;
  return path.join(TEMPLATE_DIR, path.relative(DEFAULT_TEMPLATE_DIR, templatePath));
}

function validateNoSecretsOrPrivatePaths(files, errors) {
  for (const filePath of files) {
    for (const finding of scanHarnessSafety(relative(filePath), readFileSync(filePath, "utf8"))) {
      errors.push(finding.replace(/API-key\/token\/secret-looking text/u, "API-key/token-looking text"));
    }
  }
}


function dryRunRenderTemplates(templateFiles, errors) {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "claude-adapter-plan-"));
  try {
    for (const file of templateFiles) {
      const destination = path.join(tempRoot, path.relative(TEMPLATE_DIR, file));
      mkdirSync(path.dirname(destination), { recursive: true });
      writeFileSync(destination, readFileSync(file, "utf8"));
    }
    const rendered = walkFiles(tempRoot);
    if (rendered.length !== templateFiles.length) {
      errors.push("dry-run render did not preserve all templates");
    }
    for (const file of rendered) {
      const text = readFileSync(file, "utf8");
      if (file.endsWith(".json")) JSON.parse(text);
      if (file.endsWith(".md") && file.endsWith(`${path.sep}SKILL.md`)) readTemplateFrontmatter(file, errors);
      if (file.endsWith(".md") && file.includes(`${path.sep}agents${path.sep}`)) readTemplateFrontmatter(file, errors);
      if (file.endsWith(`${path.sep}CLAUDE.md.template.md`) && !text.includes("@AGENTS.md")) {
        errors.push(`${file}: instruction template must import @AGENTS.md`);
      }
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function validateConventionInputs(plan, errors) {
  const text = JSON.stringify(plan.localClaudeConventionInputs ?? []);
  for (const marker of [
    "~/.claude/docs/authoring-agents.md",
    "~/.claude/docs/authoring-skills.md",
    "~/.claude/docs/architecture.md",
    "frontmatter",
    "Use when",
    "Runtime",
  ]) {
    if (!text.includes(marker)) errors.push(`local convention inputs: missing ${marker}`);
  }
  for (const input of plan.localClaudeConventionInputs ?? []) {
    if (!input.inspection || !input.usedFor) {
      errors.push(`local convention inputs: ${input.source} missing inspection or usedFor`);
    }
  }
}

function validateDeclarativeCandidates(plan, errors) {
  const candidates = new Map((plan.declarativeCandidateSurfaces ?? []).map(candidate => [candidate.id, candidate]));
  for (const id of ["claude-instructions", "claude-settings", "claude-agents", "claude-skills", "curated-skill-symlinks"]) {
    if (!candidates.has(id)) errors.push(`declarative candidates: missing ${id}`);
  }
  for (const candidate of candidates.values()) {
    if (!candidate.kind || !candidate.claudeSurface || !candidate.templatePath) {
      errors.push(`declarative candidates: ${candidate.id} missing kind, claudeSurface, or templatePath`);
    }
    if (!Array.isArray(candidate.candidateDestinations) || candidate.candidateDestinations.length === 0) {
      errors.push(`declarative candidates: ${candidate.id} missing destinations`);
    }
    if (candidate.templatePath && !existsSync(resolveTemplatePath(candidate.templatePath)) && !existsSync(candidate.templatePath)) {
      errors.push(`declarative candidates: missing template ${candidate.templatePath}`);
    }
  }
}

function validateAgentMappings(source, plan, errors) {
  const expected = new Set(source.expectedBundledAgents ?? []);
  const seen = new Set();
  for (const mapping of plan.ompAgentMappings ?? []) {
    if (!expected.has(mapping.ompAgent)) errors.push(`agent mapping: unknown OMP agent ${mapping.ompAgent}`);
    if (seen.has(mapping.ompAgent)) errors.push(`agent mapping: duplicate OMP agent ${mapping.ompAgent}`);
    seen.add(mapping.ompAgent);
    if (!RECOMMENDATIONS.has(mapping.recommendation)) {
      errors.push(`agent mapping: invalid recommendation for ${mapping.ompAgent}`);
    }
    if (!mapping.claudeSurface) errors.push(`agent mapping: ${mapping.ompAgent} missing Claude surface`);
    if (mapping.recommendation === "adapt" && !mapping.claudeCandidate) {
      errors.push(`agent mapping: adapted agent ${mapping.ompAgent} needs a Claude candidate`);
    }
    if (mapping.candidateTemplate && !existsSync(resolveTemplatePath(mapping.candidateTemplate))) {
      errors.push(`agent mapping: missing template ${mapping.candidateTemplate}`);
    }
    if (!mapping.rationale) errors.push(`agent mapping: ${mapping.ompAgent} missing rationale`);
  }
  for (const agent of expected) {
    if (!seen.has(agent)) errors.push(`agent mapping: missing OMP agent ${agent}`);
  }
}

function validateSkillMappings(portability, plan, errors) {
  const expected = new Set(
    (portability.commands ?? [])
      .filter(command => command.portabilityClass === "skill")
      .map(command => command.name),
  );
  const seen = new Set();
  for (const mapping of plan.skillCandidateMappings ?? []) {
    if (!expected.has(mapping.ompCommand)) errors.push(`skill mapping: unknown OMP skill command ${mapping.ompCommand}`);
    if (seen.has(mapping.ompCommand)) errors.push(`skill mapping: duplicate OMP command ${mapping.ompCommand}`);
    seen.add(mapping.ompCommand);
    if (mapping.claudeSurface !== "skill") errors.push(`skill mapping: ${mapping.ompCommand} must target Claude skill`);
    if (!/^omp-/u.test(mapping.futureSkillName ?? "")) {
      errors.push(`skill mapping: ${mapping.ompCommand} futureSkillName must start with omp-`);
    }
    if (!mapping.sharedWorkflowSource?.startsWith("nucleus/skills/")) {
      errors.push(`skill mapping: ${mapping.ompCommand} must name sharedWorkflowSource under nucleus/skills`);
    }
    if (!mapping.adapterMode?.includes("review")) {
      errors.push(`skill mapping: ${mapping.ompCommand} must require review before adapter/link apply`);
    }
    if (mapping.generatedClaudeAdapter && !existsSync(resolveTemplatePath(mapping.generatedClaudeAdapter))) {
      errors.push(`skill mapping: missing generated adapter ${mapping.generatedClaudeAdapter}`);
    }
    if (mapping.generatedClaudeAdapter === mapping.sharedWorkflowSource) {
      errors.push(`skill mapping: ${mapping.ompCommand} must distinguish shared workflow source from generated adapter`);
    }
    if (!mapping.rationale) errors.push(`skill mapping: ${mapping.ompCommand} missing rationale`);
  }
  for (const command of expected) {
    if (!seen.has(command)) errors.push(`skill mapping: missing OMP command ${command}`);
  }
}

function validateTemplateBoundaries(plan, templateFiles, errors) {
  const boundaries = new Map((plan.templateBoundaries ?? []).map(boundary => [boundary.id, boundary]));
  for (const id of ["claude-instructions", "claude-settings", "claude-agent", "claude-skill", "skill-symlink-candidates"]) {
    if (!boundaries.has(id)) errors.push(`template boundary: missing ${id}`);
  }
  for (const boundary of boundaries.values()) {
    if (!existsSync(resolveTemplatePath(boundary.templatePath))) {
      errors.push(`template boundary: missing template ${boundary.templatePath}`);
    }
    if (!boundary.boundary) errors.push(`template boundary: ${boundary.id} missing boundary text`);
  }

  const instructionPath = resolveTemplatePath(boundaries.get("claude-instructions")?.templatePath ?? "");
  if (existsSync(instructionPath)) {
    const text = readFileSync(instructionPath, "utf8");
    for (const marker of boundaries.get("claude-instructions").requiredMarkers ?? []) {
      if (!text.toLowerCase().includes(marker.toLowerCase())) {
        errors.push(`${relative(instructionPath)}: missing instruction marker ${marker}`);
      }
    }
  }

  const settingsBoundary = boundaries.get("claude-settings");
  if (settingsBoundary) {
    const settingsPath = resolveTemplatePath(settingsBoundary.templatePath);
    const settings = readJson(settingsPath);
    const keys = collectJsonKeys(settings);
    for (const forbidden of settingsBoundary.forbiddenKeys ?? []) {
      for (const key of keys) {
        if (keyMatchesForbidden(key, forbidden)) {
          errors.push(`${relative(settingsPath)}: forbidden key ${key}`);
        }
      }
    }
    const deny = settings.permissions?.deny ?? [];
    for (const marker of ["projects", "sessions", "session-env", "shell-snapshots", "daemon", "daemon-auth", "history.jsonl", "settings.local.json", "cache", "plugins/cache"]) {
      if (!deny.some(entry => entry.includes(marker))) {
        errors.push(`${relative(settingsPath)}: deny list missing ${marker}`);
      }
    }
  }

  const agentFiles = templateFiles.filter(file => file.includes(`${path.sep}agents${path.sep}`) && file.endsWith(".md"));
  const parsedAgentNames = new Set();
  for (const file of agentFiles) {
    const { data, body } = readTemplateFrontmatter(file, errors);
    for (const required of ["name", "description", "tools"]) {
      if (!data[required]) errors.push(`${relative(file)}: missing agent frontmatter ${required}`);
    }
    for (const key of Object.keys(data)) {
      if (!["name", "description", "tools"].includes(key)) {
        errors.push(`${relative(file)}: unsupported agent frontmatter key ${key}`);
      }
    }
    if (data.name) parsedAgentNames.add(data.name);
    for (const tool of data.tools ?? []) {
      if (READ_ONLY_AGENT_FORBIDDEN_TOOLS.has(tool)) {
        errors.push(`${relative(file)}: read-heavy agent template must not grant ${tool}`);
      }
    }
    if (!/^# /mu.test(body)) errors.push(`${relative(file)}: missing markdown body heading`);
    if (!body.includes("Do not read Claude runtime")) {
      errors.push(`${relative(file)}: missing Claude runtime boundary`);
    }
  }
  for (const mapping of plan.ompAgentMappings ?? []) {
    if (mapping.candidateTemplate) {
      const expectedName = path.basename(mapping.candidateTemplate, ".md");
      if (!parsedAgentNames.has(expectedName)) {
        errors.push(`agent template: ${mapping.candidateTemplate} does not define name ${expectedName}`);
      }
    }
  }

  const skillFiles = templateFiles.filter(file => file.endsWith(`${path.sep}SKILL.md`));
  for (const file of skillFiles) {
    const { data, body } = readTemplateFrontmatter(file, errors);
    for (const required of ["name", "description"]) {
      if (!data[required]) errors.push(`${relative(file)}: missing skill frontmatter ${required}`);
    }
    if (!body.includes("Use when")) errors.push(`${relative(file)}: missing Use when trigger`);
    if (!body.includes("Do not claim to control OMP runtime state")) {
      errors.push(`${relative(file)}: missing OMP runtime boundary`);
    }
  }

  const symlinkTemplate = readJson(path.join(TEMPLATE_DIR, "skill-symlinks.template.json"));
  if (symlinkTemplate.dryRunOnly !== true) errors.push("skill symlink template must be dry-run only");
  for (const candidate of symlinkTemplate.candidates ?? []) {
    for (const key of ["name", "sharedSource", "candidateDestinations", "status", "requiresHumanApproval"]) {
      if (!(key in candidate)) errors.push(`skill symlink candidate: ${candidate.name ?? "unknown"} missing ${key}`);
    }
    if (candidate.sharedSource === "~/.claude" || candidate.sharedSource === "~/.claude/") {
      errors.push(`skill symlink candidate: ${candidate.name} must not use whole Claude home as source`);
    }
    if (!candidate.sharedSource?.startsWith("nucleus/skills/")) {
      errors.push(`skill symlink candidate: ${candidate.name} must use a per-skill shared source`);
    }
    if (candidate.status !== "candidate-only") errors.push(`skill symlink candidate: ${candidate.name} must be candidate-only`);
    if (candidate.requiresHumanApproval !== true) {
      errors.push(`skill symlink candidate: ${candidate.name} must require human approval`);
    }
  }
  for (const forbidden of ["copy ~/.claude", "symlink ~/.claude", "replace ~/.claude/skills"]) {
    if (!(symlinkTemplate.bulkRootActionsForbidden ?? []).includes(forbidden)) {
      errors.push(`skill symlink template: missing forbidden bulk action ${forbidden}`);
    }
  }
}

function validateLocalOnly(plan, errors) {
  const text = JSON.stringify(plan.localOnlyClaudeSurfaces ?? []);
  for (const marker of [
    ".credentials.json",
    "~/.claude.json",
    "history.jsonl",
    "projects",
    "sessions",
    "session-env",
    "shell-snapshots",
    "tasks",
    "teams",
    "jobs",
    "file-history",
    "cache",
    "paste-cache",
    "plugins/cache",
    "plugins/data",
    "daemon",
    "daemon-auth",
    "settings.local.json",
    "log",
    "backups",
    "workflows",
    "todos",
    "statsig",
    "sqlite",
  ]) {
    if (!text.includes(marker)) errors.push(`local-only surfaces: missing ${marker}`);
  }
}

function validateGeneratedSurfaces(plan, errors) {
  const surfaces = new Set((plan.generatedCandidateSurfaces ?? []).map(surface => surface.surface));
  for (const surface of [
    ".claude/CLAUDE.md",
    "~/.claude/CLAUDE.md",
    ".claude/settings.json",
    "~/.claude/settings.json",
    ".claude/agents/*.md",
    "~/.claude/agents/*.md",
    ".claude/skills/*/SKILL.md",
    "~/.claude/skills/*/SKILL.md",
    "per-skill symlink manifest",
  ]) {
    if (!surfaces.has(surface)) errors.push(`generated surfaces: missing ${surface}`);
  }
  for (const surface of plan.generatedCandidateSurfaces ?? []) {
    if (surface.status !== "dry-run-only") {
      errors.push(`generated surfaces: ${surface.surface} must be dry-run-only`);
    }
  }
}

function validateWorkflowNucleus(plan, errors) {
  if (!(plan.sourceInputs ?? []).includes("~/.omp/agent/workflow-kit")) {
    errors.push("source inputs: missing workflow-kit reference");
  }
  const nucleus = plan.repositoryWorkflowNucleus ?? {};
  if (nucleus.source !== "~/.omp/agent/workflow-kit") {
    errors.push("workflow nucleus: source must be ~/.omp/agent/workflow-kit");
  }
  if (nucleus.status !== "reference-only") {
    errors.push("workflow nucleus: status must be reference-only");
  }
  const policy = JSON.stringify(nucleus.portablePolicy ?? []);
  for (const marker of ["global layer", "project layer", "idempotent", "one issue/worktree/PR", "nucleus/skills", "Use when", "GitHub"]) {
    if (!policy.includes(marker)) errors.push(`workflow nucleus: missing ${marker}`);
  }
  const translation = JSON.stringify(nucleus.claudeTranslation ?? []);
  for (const marker of ["Project-specific", "General reusable", "Claude agents", "dry-run manifests"]) {
    if (!translation.includes(marker)) errors.push(`workflow nucleus translation: missing ${marker}`);
  }
}

function validateDuplicateRisks(plan, errors) {
  const text = JSON.stringify(plan.duplicateSkillRootRisks ?? []);
  for (const marker of ["~/.claude/skills", "~/.codex/skills", "~/.agents/skills", "repo:nucleus/skills", "document-only", "forbid-bulk-symlink"]) {
    if (!text.includes(marker)) errors.push(`duplicate risks: missing ${marker}`);
  }
  for (const forbidden of ["delete", "move", "rewrite", "dedupe"]) {
    if (!text.includes(`do not ${forbidden}`) && text.includes(`issue42Action\":\"${forbidden}`)) {
      errors.push(`duplicate risks: should not propose ${forbidden}`);
    }
  }
}

function validateMarkdown(plan, errors, planMdPath = PLAN_MD_PATH) {
  const md = readFileSync(planMdPath, "utf8");
  const digest = createHash("sha256").update(md).digest("hex").slice(0, 12);
  for (const agent of plan.ompAgentMappings ?? []) {
    if (!md.includes(`\`${agent.ompAgent}\``)) errors.push(`markdown: missing OMP agent ${agent.ompAgent}`);
  }
  for (const mapping of plan.skillCandidateMappings ?? []) {
    if (!md.includes(`\`${mapping.ompCommand}\``)) errors.push(`markdown: missing OMP command ${mapping.ompCommand}`);
  }
  for (const decision of plan.humanDecisionsBeforeImplementation ?? []) {
    if (!md.includes(decision)) errors.push(`markdown: missing human decision ${decision.slice(0, 40)}...`);
  }
  for (const marker of [
    "Claude Conventions Used",
    "Dry-Run Render And Validation Strategy",
    "~/.omp/agent/workflow-kit",
    "does not write to live `~/.claude`",
    "does not delete duplicate skills",
  ]) {
    if (!md.includes(marker)) errors.push(`markdown: missing ${marker}`);
  }
  if (md.includes("Official Claude Docs Used")) errors.push("markdown: should not claim unverified official Claude docs");
  return digest;
}

export function validateClaudeAdapterPlan(options = {}) {
  const errors = [];
  const planPath = options.planPath ?? PLAN_PATH;
  const planMdPath = options.planMdPath ?? PLAN_MD_PATH;
  const sourcePath = options.sourcePath ?? SOURCE_PATH;
  const portabilityPath = options.portabilityPath ?? PORTABILITY_PATH;
  const templateDir = options.templateDir ?? TEMPLATE_DIR;
  const plan = readJson(planPath);
  const source = readJson(sourcePath);
  const portability = readJson(portabilityPath);
  const templateFiles = walkFiles(templateDir, file => file.endsWith(".md") || file.endsWith(".json"));
  const checkedFiles = [planPath, planMdPath, ...templateFiles].map(file => path.resolve(file));

  if (plan.schemaVersion !== 1) errors.push("adapter plan schemaVersion must be 1");
  if (plan.generatedForIssue !== 42) errors.push("adapter plan generatedForIssue must be 42");
  if (templateFiles.length < 9) errors.push("expected multiple Claude templates");
  validateConventionInputs(plan, errors);
  validateDeclarativeCandidates(plan, errors);
  validateAgentMappings(source, plan, errors);
  validateSkillMappings(portability, plan, errors);
  validateTemplateBoundaries(plan, templateFiles, errors);
  validateLocalOnly(plan, errors);
  validateGeneratedSurfaces(plan, errors);
  validateWorkflowNucleus(plan, errors);
  validateDuplicateRisks(plan, errors);
  validateNoSecretsOrPrivatePaths(checkedFiles, errors);
  dryRunRenderTemplates(templateFiles, errors);
  const markdownDigest = validateMarkdown(plan, errors, planMdPath);

  if (!Array.isArray(plan.dryRunValidationStrategy) || plan.dryRunValidationStrategy.length < 8) {
    errors.push("adapter plan must list a dry-run validation strategy");
  }
  if (!Array.isArray(plan.humanDecisionsBeforeImplementation) || plan.humanDecisionsBeforeImplementation.length < 5) {
    errors.push("adapter plan must list human decisions before implementation");
  }
  if (!Array.isArray(plan.humanDecisionResolutions) || plan.humanDecisionResolutions.length < 5) {
    errors.push("adapter plan must list human decision resolutions");
  }
  if (!(plan.liveClaudeApplyPolicyOptions ?? []).some(option => option.id === "strict-manual" && option.recommended)) {
    errors.push("adapter plan must recommend strict-manual live Claude apply policy");
  }

  return { errors, plan, templateFiles, markdownDigest };
}

function main() {
  const result = validateClaudeAdapterPlan();
  if (result.errors.length > 0) {
    console.error("Claude adapter plan validation failed:");
    for (const error of result.errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(
    `Claude adapter plan validation passed: ${result.plan.ompAgentMappings.length} OMP agent mappings, ${result.plan.skillCandidateMappings.length} skill mappings, ${result.templateFiles.length} templates, docs digest ${result.markdownDigest}`,
  );
  console.log(`Dry-run candidate surfaces: ${result.plan.generatedCandidateSurfaces.map(surface => surface.surface).join(", ")}`);
}

const invokedDirectly = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (invokedDirectly) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}
