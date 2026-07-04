#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "./lib/frontmatter.mjs";
import {
  factoryDroidsRoot,
  sharedAgentContractMarkdownPath,
  sharedAgentContractPath,
} from "./lib/layout.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const DEFAULTS = Object.freeze({
  contract: sharedAgentContractPath,
  droidsDir: factoryDroidsRoot,
  maxBodyChars: 3500,
});

function repoPath(relativeOrAbsolute) {
  return path.isAbsolute(relativeOrAbsolute) ? relativeOrAbsolute : path.join(repoRoot, relativeOrAbsolute);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function sortedDroidEntries(droidsDir) {
  if (!existsSync(droidsDir) || !statSync(droidsDir).isDirectory()) return [];
  return readdirSync(droidsDir, { withFileTypes: true })
    .map((entry) => ({ name: entry.name, isFile: entry.isFile() }))
    .sort((left, right) => compareText(left.name, right.name));
}

function includesBodyReference(body, reference) {
  return body.includes(reference);
}

export function validateFactoryDroids(options = {}) {
  const contractPath = repoPath(options.contract ?? DEFAULTS.contract);
  const droidsDir = repoPath(options.droidsDir ?? DEFAULTS.droidsDir);
  const maxBodyChars = options.maxBodyChars ?? DEFAULTS.maxBodyChars;
  const contract = readJson(contractPath);
  const failures = [];

  const expectedAgentNames = contract.agents.map((agent) => agent.name).sort(compareText);
  const expectedFileNames = expectedAgentNames.map((agentName) => `${agentName}.md`).sort(compareText);
  const entries = sortedDroidEntries(droidsDir);
  const actualFileNames = entries.filter((entry) => entry.isFile).map((entry) => entry.name).sort(compareText);
  const actualEntryNames = entries.map((entry) => entry.name).sort(compareText);

  if (!existsSync(droidsDir) || !statSync(droidsDir).isDirectory()) {
    failures.push(`factory droids directory missing: ${factoryDroidsRoot}`);
  }

  for (const expectedFileName of expectedFileNames) {
    if (!actualFileNames.includes(expectedFileName)) {
      failures.push(`missing factory droid ${expectedFileName}`);
    }
  }

  for (const entryName of actualEntryNames) {
    if (!expectedFileNames.includes(entryName)) {
      failures.push(`unexpected factory droid entry ${entryName}`);
    }
  }

  for (const entry of entries) {
    if (expectedFileNames.includes(entry.name) && !entry.isFile) {
      failures.push(`${entry.name}: expected factory droid entry to be a file`);
    }
  }

  for (const agent of contract.agents) {
    const agentName = agent.name;
    const fileName = `${agentName}.md`;
    const droidPath = path.join(droidsDir, fileName);
    if (!existsSync(droidPath) || !statSync(droidPath).isFile()) continue;

    const content = readFileSync(droidPath, "utf8");
    const parsed = parseFrontmatter(content);
    if (!parsed) {
      failures.push(`${fileName}: missing YAML frontmatter`);
      continue;
    }
    for (const invalidLine of parsed.invalidLines) {
      failures.push(`${fileName}: invalid frontmatter line ${invalidLine.line}: ${invalidLine.text}`);
    }

    if (parsed.data.name !== agentName) {
      failures.push(`${fileName}: frontmatter name must be ${agentName}, got ${parsed.data.name ?? "<missing>"}`);
    }

    if (typeof parsed.data.description !== "string" || !parsed.data.description.includes("Modes:")) {
      failures.push(`${fileName}: frontmatter description must mention Modes:`);
    }

    if (parsed.body.length >= maxBodyChars) {
      failures.push(`${fileName}: body must stay under ${maxBodyChars} chars, got ${parsed.body.length}`);
    }

    const skillPath = `nucleus/skills/${agentName}/SKILL.md`;
    if (!includesBodyReference(parsed.body, skillPath)) {
      failures.push(`${fileName}: body must reference ${skillPath}`);
    }

    const agentsPath = `nucleus/skills/${agentName}/AGENTS.md`;
    const referencesPath = `nucleus/skills/${agentName}/references/`;
    if (!includesBodyReference(parsed.body, agentsPath) && !includesBodyReference(parsed.body, referencesPath)) {
      failures.push(`${fileName}: body must reference ${agentsPath} or ${referencesPath}`);
    }

    if (!includesBodyReference(parsed.body, sharedAgentContractMarkdownPath)) {
      failures.push(`${fileName}: body must reference ${sharedAgentContractMarkdownPath}`);
    }

    // Model policy is intentionally not checked here; GH-174 owns the model allowlist.
  }

  return {
    droidsChecked: expectedAgentNames.length,
    maxBodyChars,
    failures,
  };
}

const invokedDirectly = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (invokedDirectly) {
  const result = validateFactoryDroids();
  if (result.failures.length) {
    console.error("Factory droid checks failed:");
    for (const failure of result.failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log(`Factory droid checks passed: ${result.droidsChecked} droids, max body ${result.maxBodyChars} chars`);
}
