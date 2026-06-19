#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const PLAN_PATH = process.env.CODEX_ADAPTER_PLAN_PATH ?? "docs/harness/codex-adapter-plan/adapter-plan.json";
const SOURCE_PATH = "docs/harness/omp-builtins/source.json";
const PORTABILITY_PATH = "docs/harness/omp-builtins/portability-matrix.json";
const PLAN_MD_PATH = "docs/harness/codex-adapter-plan.md";
const TEMPLATE_DIR = process.env.CODEX_ADAPTER_PLAN_TEMPLATE_DIR ?? "docs/harness/codex-adapter-plan/templates";
const REQUIRED_DOC_TOPICS = new Set([
  "config",
  "profiles",
  "project-config-boundaries",
  "custom-agents-subagents",
  "subagent-concepts",
  "skills",
  "agents-md",
  "auth",
]);
const RECOMMENDATIONS = new Set(["keep", "adapt", "drop"]);
const SECRET_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/u,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/u,
  /\bsk-[A-Za-z0-9_-]{20,}\b/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\b(?:api[_-]?key|token|secret|password)\b\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{16,}["']?/iu,
];

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
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

function stripTomlComments(text) {
  return text
    .split("\n")
    .map(line => line.replace(/(^|[ \t])#.*/u, ""))
    .join("\n");
}

function tomlKeys(text) {
  const keys = new Set();
  let currentTable = "";
  for (const line of stripTomlComments(text).split("\n")) {
    const table = line.match(/^\s*\[\[?([^\]]+)\]\]?\s*$/u);
    if (table) {
      currentTable = table[1].trim().replaceAll('"', "");
      keys.add(currentTable);
      continue;
    }
    const match = line.match(/^\s*([A-Za-z0-9_-]+)\s*=/u);
    if (!match) continue;
    keys.add(match[1]);
    if (currentTable) keys.add(`${currentTable}.${match[1]}`);
  }
  return keys;
}

function keyMatchesForbidden(key, forbidden) {
  return key === forbidden || key.startsWith(`${forbidden}.`) || key.endsWith(`.${forbidden}`);
}

function templatesForBoundary(boundary, templateFiles) {
  if (boundary.id === "custom-agent") {
    return templateFiles.filter(file => file.includes(`${path.sep}agents${path.sep}`));
  }
  const expected = path.basename(boundary.templatePath);
  return templateFiles.filter(file => path.basename(file) === expected);
}

function validateNoSecretsOrPrivatePaths(files, errors) {
  for (const filePath of files) {
    const relative = path.relative(process.cwd(), filePath).split(path.sep).join("/");
    const text = readFileSync(filePath, "utf8");
    if (/\/Users\/[^/\s"]+/u.test(text)) {
      errors.push(`${relative}: contains an absolute private home path`);
    }
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(text)) {
        errors.push(`${relative}: contains API-key/token-looking text`);
        break;
      }
    }
  }
}

function parseTomlWithPython(files, errors) {
  const script = [
    "import pathlib, sys, tomllib",
    "for raw in sys.argv[1:]:",
    "    path = pathlib.Path(raw)",
    "    tomllib.loads(path.read_text())",
  ].join("\n");
  const result = spawnSync("python3", ["-c", script, ...files], { encoding: "utf8" });
  if (result.status !== 0) {
    errors.push(`TOML parse failed:\n${result.stderr || result.stdout}`);
  }
}

function dryRunRenderTemplates(files, errors) {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "codex-adapter-plan-"));
  try {
    for (const file of files) {
      const relative = path.relative(TEMPLATE_DIR, file);
      const destination = path.join(tempRoot, relative);
      mkdirSync(path.dirname(destination), { recursive: true });
      writeFileSync(destination, readFileSync(file, "utf8"));
    }
    const rendered = walkFiles(tempRoot, file => file.endsWith(".toml"));
    if (rendered.length !== files.length) {
      errors.push("dry-run render did not preserve all TOML templates");
    }
    parseTomlWithPython(rendered, errors);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function validateOfficialDocs(plan, errors) {
  const refs = plan.officialCodexDocs ?? [];
  const topics = new Set(refs.map(ref => ref.topic));
  for (const topic of REQUIRED_DOC_TOPICS) {
    if (!topics.has(topic)) errors.push(`official docs: missing topic ${topic}`);
  }
  for (const ref of refs) {
    if (!/^https:\/\/developers\.openai\.com\/codex\//u.test(ref.url)) {
      errors.push(`official docs: non-Codex official URL for ${ref.topic}`);
    }
    if (!ref.usedFor) errors.push(`official docs: ${ref.topic} missing usedFor`);
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
    if (mapping.recommendation === "adapt" && !mapping.codexCandidate) {
      errors.push(`agent mapping: adapted agent ${mapping.ompAgent} needs a Codex candidate`);
    }
    if (mapping.candidateTemplate && !existsSync(mapping.candidateTemplate)) {
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
    if (mapping.codexSurface !== "skill") errors.push(`skill mapping: ${mapping.ompCommand} must target Codex skill`);
    if (!mapping.futureSkillName) errors.push(`skill mapping: ${mapping.ompCommand} missing futureSkillName`);
    if (!mapping.rationale) errors.push(`skill mapping: ${mapping.ompCommand} missing rationale`);
  }
  for (const command of expected) {
    if (!seen.has(command)) errors.push(`skill mapping: missing OMP command ${command}`);
  }
}

function validateTemplateBoundaries(plan, templateFiles, errors) {
  const boundaries = new Map((plan.templateBoundaries ?? []).map(boundary => [boundary.id, boundary]));
  for (const id of ["base-config", "profile", "custom-agent", "skills-config"]) {
    if (!boundaries.has(id)) errors.push(`template boundary: missing ${id}`);
  }
  for (const boundary of boundaries.values()) {
    if (!existsSync(boundary.templatePath)) errors.push(`template boundary: missing template ${boundary.templatePath}`);
    if (!boundary.boundary) errors.push(`template boundary: ${boundary.id} missing boundary text`);
    if (!Array.isArray(boundary.forbiddenKeys) || boundary.forbiddenKeys.length === 0) {
      errors.push(`template boundary: ${boundary.id} missing forbidden keys`);
    }
  }
  for (const boundary of boundaries.values()) {
    for (const file of templatesForBoundary(boundary, templateFiles)) {
      const keys = tomlKeys(readFileSync(file, "utf8"));
      for (const forbidden of boundary.forbiddenKeys) {
        for (const key of keys) {
          if (keyMatchesForbidden(key, forbidden)) {
            errors.push(`${path.relative(process.cwd(), file)}: forbidden key ${key} from ${boundary.id}`);
          }
        }
      }
    }
  }
  const agentTemplates = templateFiles.filter(file => file.includes(`${path.sep}agents${path.sep}`));
  const parsedAgentNames = new Set();
  for (const file of agentTemplates) {
    const text = readFileSync(file, "utf8");
    for (const required of ["name", "description", "developer_instructions"]) {
      if (!new RegExp(`^${required}\\s*=`, "mu").test(text)) {
        errors.push(`${path.relative(process.cwd(), file)}: missing custom agent key ${required}`);
      }
    }
    const name = text.match(/^name\s*=\s*"([^"]+)"/mu)?.[1];
    if (name) parsedAgentNames.add(name);
    if (name === "omp-reviewer" && /^\s*sandbox_mode\s*=\s*"workspace-write"/mu.test(stripTomlComments(text))) {
      errors.push(`${path.relative(process.cwd(), file)}: review agent must not request workspace-write sandbox`);
    }
  }
  for (const mapping of plan.ompAgentMappings ?? []) {
    if (mapping.candidateTemplate) {
      const expectedName = path.basename(mapping.candidateTemplate, ".toml");
      if (!parsedAgentNames.has(expectedName)) {
        errors.push(`agent template: ${mapping.candidateTemplate} does not define name ${expectedName}`);
      }
    }
  }
}

function validateLocalOnly(plan, errors) {
  const text = JSON.stringify(plan.localOnlyCodexSurfaces ?? []);
  for (const marker of [
    "auth.json",
    "sessions",
    "history.jsonl",
    "log",
    "cache",
    "plugins/cache",
    "attachments",
    "sqlite",
    "state",
    "automations",
    "browser",
    "computer-use",
    "shell_snapshots",
    "memories",
  ]) {
    if (!text.includes(marker)) errors.push(`local-only surfaces: missing ${marker}`);
  }
}

function validateGeneratedSurfaces(plan, errors) {
  const surfaces = new Set((plan.generatedCandidateSurfaces ?? []).map(surface => surface.surface));
  for (const surface of [
    ".codex/config.toml",
    "~/.codex/omp-harness.config.toml",
    ".codex/agents/*.toml",
    "~/.codex/agents/*.toml",
    "~/.codex/config.toml skills.config entries",
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
  for (const marker of [
    "global layer",
    "project layer",
    "idempotent",
    "one issue/worktree/PR",
    ".agents/skills",
    "Use when",
    "GitHub",
  ]) {
    if (!policy.includes(marker)) errors.push(`workflow nucleus: missing ${marker}`);
  }
  const translation = JSON.stringify(nucleus.codexTranslation ?? []);
  for (const marker of ["Project-specific", "General reusable", "custom agents", "dry-run manifests"]) {
    if (!translation.includes(marker)) errors.push(`workflow nucleus translation: missing ${marker}`);
  }
}

function validateMarkdown(plan, errors) {
  const md = readFileSync(PLAN_MD_PATH, "utf8");
  const digest = createHash("sha256").update(md).digest("hex").slice(0, 12);
  for (const agent of plan.ompAgentMappings ?? []) {
    if (!md.includes(`\`${agent.ompAgent}\``)) errors.push(`markdown: missing OMP agent ${agent.ompAgent}`);
  }
  for (const decision of plan.humanDecisionsBeforeImplementation ?? []) {
    if (!md.includes(decision)) errors.push(`markdown: missing human decision ${decision.slice(0, 40)}...`);
  }
  if (!md.includes("Dry-Run Render And Validation Strategy")) {
    errors.push("markdown: missing dry-run validation strategy");
  }
  if (!md.includes("https://developers.openai.com/codex/config-basic")) {
    errors.push("markdown: missing official Codex docs links");
  }
  if (!md.includes("Repository Workflow Nucleus") || !md.includes("~/.omp/agent/workflow-kit")) {
    errors.push("markdown: missing workflow-kit nucleus section");
  }
  return digest;
}

try {
  const errors = [];
  const plan = readJson(PLAN_PATH);
  const source = readJson(SOURCE_PATH);
  const portability = readJson(PORTABILITY_PATH);
  const templateFiles = walkFiles(TEMPLATE_DIR, file => file.endsWith(".toml"));
  const checkedFiles = [PLAN_PATH, PLAN_MD_PATH, ...templateFiles].map(file => path.resolve(file));

  if (plan.schemaVersion !== 1) errors.push("adapter plan schemaVersion must be 1");
  if (plan.generatedForIssue !== 41) errors.push("adapter plan generatedForIssue must be 41");
  if (templateFiles.length < 5) errors.push("expected multiple Codex TOML templates");
  validateOfficialDocs(plan, errors);
  validateAgentMappings(source, plan, errors);
  validateSkillMappings(portability, plan, errors);
  validateTemplateBoundaries(plan, templateFiles, errors);
  validateLocalOnly(plan, errors);
  validateGeneratedSurfaces(plan, errors);
  validateWorkflowNucleus(plan, errors);
  validateNoSecretsOrPrivatePaths(checkedFiles, errors);
  dryRunRenderTemplates(templateFiles, errors);
  const markdownDigest = validateMarkdown(plan, errors);

  if (!Array.isArray(plan.dryRunValidationStrategy) || plan.dryRunValidationStrategy.length < 6) {
    errors.push("adapter plan must list a dry-run validation strategy");
  }
  if (!Array.isArray(plan.humanDecisionsBeforeImplementation) || plan.humanDecisionsBeforeImplementation.length < 5) {
    errors.push("adapter plan must list human decisions before implementation");
  }
  if (!Array.isArray(plan.humanDecisionResolutions) || plan.humanDecisionResolutions.length < 5) {
    errors.push("adapter plan must list human decision resolutions");
  }
  if (!(plan.liveConfigApprovalPolicyOptions ?? []).some(option => option.id === "strict-manual" && option.recommended)) {
    errors.push("adapter plan must recommend strict-manual live config approval");
  }

  if (errors.length > 0) {
    console.error("Codex adapter plan validation failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(
    `Codex adapter plan validation passed: ${plan.ompAgentMappings.length} OMP agent mappings, ${plan.skillCandidateMappings.length} skill mappings, ${templateFiles.length} TOML templates, docs digest ${markdownDigest}`,
  );
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
