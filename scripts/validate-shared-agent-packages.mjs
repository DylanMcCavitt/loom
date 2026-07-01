#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const DEFAULTS = Object.freeze({
  contract: "docs/harness/shared-nucleus-agents.json",
  plan: "docs/harness/plugin-bridge/plan.json",
  bridgeDir: "docs/harness/plugin-bridge",
  skillsDir: ".agents/skills",
});

export const DETERMINISTIC_RULES = Object.freeze([
  {
    id: "package-structure",
    reason: "Required files and directories are known from the shared contract and can be checked from the filesystem.",
    fix: "Restore the missing package path or regenerate the shared-agent packages from the contract.",
  },
  {
    id: "rule-schema",
    reason: "Rule IDs and rule field labels are mechanical Markdown fields with concrete required values.",
    fix: "Use `## rule/{stable-id}` and fill every required rule schema field.",
  },
  {
    id: "canonical-names",
    reason: "Harness-prefixed names and legacy OMP role-port paths are exact string/path violations.",
    fix: "Use canonical shared agent names and keep OMP-prefixed role ports superseded, not active.",
  },
  {
    id: "skill-sections",
    reason: "Generated shared-agent `SKILL.md` sections are fixed headings declared by the shared contract.",
    fix: "Restore the missing section heading in the generated package entrypoint; preserved active repo skills may keep their hand-authored structure.",
  },
]);

const REQUIRED_RULE_FIELD_LABELS = Object.freeze({
  status: "Status",
  scope: "Scope",
  rule: "Rule",
  why: "Why",
  exceptions: "Exceptions",
  source: "Source",
  badExample: "Bad example",
  goodExample: "Good example",
  assumptions: "Assumptions",
  openDecisions: "Open decisions",
});

function repoPath(relativeOrAbsolute) {
  return path.isAbsolute(relativeOrAbsolute) ? relativeOrAbsolute : path.join(repoRoot, relativeOrAbsolute);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function isNonEmptyFile(filePath) {
  return existsSync(filePath) && statSync(filePath).isFile() && readFileSync(filePath, "utf8").trim().length > 0;
}

function isDirectory(dirPath) {
  return existsSync(dirPath) && statSync(dirPath).isDirectory();
}

function listRelativeFiles(root, current = root, files = []) {
  if (!isDirectory(root)) return files;
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const filePath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      listRelativeFiles(root, filePath, files);
    } else if (entry.isFile()) {
      files.push(path.relative(root, filePath).split(path.sep).join("/"));
    }
  }
  return files.sort();
}


function frontmatterName(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/u);
  if (!match) return null;
  const nameLine = match[1].split("\n").find((line) => line.startsWith("name:"));
  return nameLine?.slice("name:".length).trim() ?? null;
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function hasHeading(markdown, level, title) {
  const pattern = new RegExp(`^${"#".repeat(level)}\\s+${escapeRegex(title)}\\s*$`, "mu");
  return pattern.test(markdown);
}

function ruleBlocks(markdown) {
  const starts = [...markdown.matchAll(/^##\s+(rule\/[^\s]+)\s*$/gmu)];
  return starts.map((match, index) => {
    const start = match.index;
    const next = starts[index + 1]?.index ?? markdown.length;
    return { id: match[1], body: markdown.slice(start, next) };
  });
}

function fieldValue(block, label) {
  const pattern = new RegExp(`^${escapeRegex(label)}:\\s*(.+)$`, "mu");
  return block.match(pattern)?.[1]?.trim() ?? "";
}

function validateRuleFile(agentName, rulesPath, contract, failures) {
  const markdown = readFileSync(rulesPath, "utf8");
  const blocks = ruleBlocks(markdown);
  if (blocks.length === 0) {
    failures.push(`${agentName}: references/rules.md must contain at least one rule/{stable-id} block`);
    return 0;
  }

  const requiredFields = contract.ruleSchema.fields ?? [];
  for (const block of blocks) {
    if (!/^rule\/[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(block.id)) {
      failures.push(`${agentName}: ${block.id} must match rule/{stable-id} with a lower-kebab stable id`);
    }
    for (const field of requiredFields) {
      const label = REQUIRED_RULE_FIELD_LABELS[field];
      if (!label) {
        failures.push(`${agentName}: unknown rule schema field ${field}`);
        continue;
      }
      const value = fieldValue(block.body, label);
      if (!value) failures.push(`${agentName}: ${block.id} missing ${label}`);
    }
    if (contract.ruleSchema.stableSourceRequired && !fieldValue(block.body, "Source")) {
      failures.push(`${agentName}: ${block.id} missing stable Source`);
    }
  }
  return blocks.length;
}

function sortedDirectoryNames(dirPath) {
  if (!isDirectory(dirPath)) return [];
  return readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function hasLegacyRolePortPath(value) {
  return /(?:^|\/)agents\/(?:omp|codex|claude)-[^/]+(?:\.(?:md|toml))?$/u.test(value);
}

export function validateSharedAgentPackages(options = {}) {
  const contractPath = repoPath(options.contract ?? DEFAULTS.contract);
  const planPath = repoPath(options.plan ?? DEFAULTS.plan);
  const bridgeDir = repoPath(options.bridgeDir ?? DEFAULTS.bridgeDir);
  const canonicalSkillsRoot = repoPath(options.skillsDir ?? DEFAULTS.skillsDir);
  const contract = readJson(contractPath);
  const plan = readJson(planPath);
  const failures = [];
  let rulesChecked = 0;

  const packageSpec = contract.repositoryStructure.perAgentSkillPackage;
  const expectedAgentNames = contract.agents.map((agent) => agent.name).sort();
  const forbiddenPrefixes = contract.namingRules.forbiddenPrefixes ?? [];
  const planAgentNames = (plan.agents ?? []).map((agent) => agent.name).sort();
  const expectedPluginSkillNames = [...expectedAgentNames, ...(plan.skills ?? []).map((skill) => skill.name)].sort();
  const pluginSkillsRoot = path.join(bridgeDir, "loom-nucleus", "skills");

  if (JSON.stringify(planAgentNames) !== JSON.stringify(expectedAgentNames)) {
    failures.push(`plugin-bridge plan agents must match shared contract roster: expected ${expectedAgentNames.join(", ")}, got ${planAgentNames.join(", ")}`);
  }

  const actualPluginSkillNames = sortedDirectoryNames(pluginSkillsRoot);
  const unexpectedSkillNames = actualPluginSkillNames.filter((name) => !expectedPluginSkillNames.includes(name));
  if (unexpectedSkillNames.length > 0) {
    failures.push(`plugin skills directory has unexpected packages: ${unexpectedSkillNames.join(", ")}`);
  }

  const actualPluginSharedPackageNames = actualPluginSkillNames.filter((name) => expectedAgentNames.includes(name)).sort();
  if (JSON.stringify(actualPluginSharedPackageNames) !== JSON.stringify(expectedAgentNames)) {
    failures.push(`plugin skills directory missing shared packages: expected ${expectedAgentNames.join(", ")}, got ${actualPluginSharedPackageNames.join(", ")}`);
  }

  const actualCanonicalPackageNames = sortedDirectoryNames(canonicalSkillsRoot).filter((name) => expectedAgentNames.includes(name)).sort();
  if (JSON.stringify(actualCanonicalPackageNames) !== JSON.stringify(expectedAgentNames)) {
    failures.push(`canonical .agents/skills directory missing shared packages: expected ${expectedAgentNames.join(", ")}, got ${actualCanonicalPackageNames.join(", ")}`);
  }

  for (const agent of plan.agents ?? []) {
    if (expectedAgentNames.includes(agent.name) && agent.packageRoot !== `.agents/skills/${agent.name}`) {
      failures.push(`${agent.name}: plan packageRoot must be .agents/skills/${agent.name}`);
    }
  }

  for (const template of plan.templates ?? []) {
    if (template.kind === "shared-agent-package" && !template.template?.startsWith(".agents/skills/")) {
      failures.push(`${template.id}: shared-agent package template must source from .agents/skills`);
    }
  }

  for (const name of expectedAgentNames) {
    if (forbiddenPrefixes.some((prefix) => name.startsWith(prefix))) {
      failures.push(`${name}: canonical shared agent name must not use a harness prefix`);
    }

    const packageDir = path.join(canonicalSkillsRoot, name);
    const pluginPackageDir = path.join(pluginSkillsRoot, name);
    if (!isDirectory(packageDir)) {
      failures.push(`${name}: missing canonical package directory`);
      continue;
    }
    if (!isDirectory(pluginPackageDir)) {
      failures.push(`${name}: missing plugin distribution package directory`);
    }

    for (const requiredDir of packageSpec.requiredDirectories ?? []) {
      const dirPath = path.join(packageDir, requiredDir);
      if (!isDirectory(dirPath)) failures.push(`${name}: missing required directory ${requiredDir}`);
      const pluginDirPath = path.join(pluginPackageDir, requiredDir);
      if (!isDirectory(pluginDirPath)) failures.push(`${name}: plugin distribution missing required directory ${requiredDir}`);
    }

    for (const requiredFile of packageSpec.requiredFiles ?? []) {
      const filePath = path.join(packageDir, requiredFile);
      if (!isNonEmptyFile(filePath)) failures.push(`${name}: missing or empty ${requiredFile}`);
      const pluginFilePath = path.join(pluginPackageDir, requiredFile);
      if (!isNonEmptyFile(pluginFilePath)) failures.push(`${name}: plugin distribution missing or empty ${requiredFile}`);
      if (existsSync(filePath) && existsSync(pluginFilePath) && readFileSync(filePath, "utf8") !== readFileSync(pluginFilePath, "utf8")) {
        failures.push(`${name}: plugin distribution ${requiredFile} must match canonical .agents/skills source`);
      }
    }

    const exemplarPath = path.join(packageDir, "exemplars", `pr-${name}.md`);
    const pluginExemplarPath = path.join(pluginPackageDir, "exemplars", `pr-${name}.md`);
    if (!isNonEmptyFile(exemplarPath)) failures.push(`${name}: missing or empty exemplars/pr-${name}.md`);
    if (!isNonEmptyFile(pluginExemplarPath)) failures.push(`${name}: plugin distribution missing or empty exemplars/pr-${name}.md`);
    if (existsSync(exemplarPath) && existsSync(pluginExemplarPath) && readFileSync(exemplarPath, "utf8") !== readFileSync(pluginExemplarPath, "utf8")) {
      failures.push(`${name}: plugin distribution exemplars/pr-${name}.md must match canonical .agents/skills source`);
    }

    const canonicalFiles = listRelativeFiles(packageDir);
    const pluginFiles = listRelativeFiles(pluginPackageDir);
    if (JSON.stringify(pluginFiles) !== JSON.stringify(canonicalFiles)) {
      failures.push(`${name}: plugin distribution file list must match canonical .agents/skills source`);
    }
    for (const relativeFile of canonicalFiles) {
      const filePath = path.join(packageDir, relativeFile);
      const pluginFilePath = path.join(pluginPackageDir, relativeFile);
      if (existsSync(pluginFilePath) && readFileSync(filePath, "utf8") !== readFileSync(pluginFilePath, "utf8")) {
        failures.push(`${name}: plugin distribution ${relativeFile} must match canonical .agents/skills source`);
      }
    }

    const skillPath = path.join(packageDir, "SKILL.md");
    if (existsSync(skillPath)) {
      const skill = readFileSync(skillPath, "utf8");
      const nameField = frontmatterName(skill);
      if (nameField !== name) failures.push(`${name}: SKILL.md frontmatter name must be ${name}, got ${nameField ?? "<missing>"}`);
      if (skill.includes("This package is the canonical repo-local shared-agent package source for LOO-105.")) {
        for (const section of packageSpec.skillMdSections ?? []) {
          if (!hasHeading(skill, 2, section)) failures.push(`${name}: generated SKILL.md missing ## ${section}`);
        }
      }
    }

    const rulesPath = path.join(packageDir, "references", "rules.md");
    if (existsSync(rulesPath)) rulesChecked += validateRuleFile(name, rulesPath, contract, failures);
  }

  const agentsDir = path.join(bridgeDir, "loom-nucleus", "agents");
  if (existsSync(agentsDir)) failures.push("plugin-bridge loom-nucleus/agents directory must not contain active legacy role ports");

  for (const template of plan.templates ?? []) {
    for (const field of ["template", "destination"]) {
      const value = template[field];
      if (typeof value === "string" && hasLegacyRolePortPath(value)) {
        failures.push(`${template.id}: active legacy role-port ${field} ${value}`);
      }
    }
  }

  for (const entry of plan.supersededOmpAgentPorts ?? []) {
    if (entry.decision !== "superseded-by-shared-agent-packages") {
      failures.push(`${entry.name ?? entry.candidate ?? "superseded OMP port"}: superseded port must stay marked superseded-by-shared-agent-packages`);
    }
  }

  return {
    packagesChecked: expectedAgentNames.length,
    rulesChecked,
    deterministicRules: DETERMINISTIC_RULES.length,
    failures,
  };
}

const invokedDirectly = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (invokedDirectly) {
  const result = validateSharedAgentPackages();
  if (result.failures.length) {
    console.error("Shared agent package checks failed:");
    for (const failure of result.failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log(`Shared agent package checks passed: ${result.packagesChecked} packages, ${result.rulesChecked} rule blocks, ${result.deterministicRules} deterministic checks`);
}
