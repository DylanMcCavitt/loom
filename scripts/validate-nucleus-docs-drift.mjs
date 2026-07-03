#!/usr/bin/env node
// Drift guard for LOO-112 docs/manifests cleanup.
//
// Keeps operator-facing command docs tied to package.json, rejects active-doc
// claims for pre-ADR-0004 source/output paths, and verifies the Factorio kit
// manifest roster names shipped nucleus skills.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nucleusSkillsRoot, nucleusUtilitiesRoot } from "./lib/layout.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const DEFAULT_DOC_PATHS = Object.freeze([
  "README.md",
  "docs/architecture",
  "docs/harness",
  "docs/operator",
  "docs/skills/factorio-kit.md",
]);

const COMMAND_DOC_PATHS = Object.freeze([
  "README.md",
  "docs/operator/daily-workflow.md",
  "docs/operator/install-update.md",
]);

const STALE_ACTIVE_PATHS = Object.freeze([
  {
    label: "old OMP tracked source root",
    pattern: /omp\/\.omp\/agent\//gu,
    replacement: "adapters/omp/source/",
  },
  {
    label: "old docs-hosted OMP built-ins snapshot root",
    pattern: /docs\/harness\/omp-builtins\//gu,
    replacement: "distributions/snapshots/omp-builtins/",
  },
  {
    label: "old docs-hosted plugin bridge output root",
    pattern: /docs\/harness\/plugin-bridge\/loom-nucleus\//gu,
    replacement: "adapters/plugin-bridge/ or distributions/loom-nucleus/",
  },
]);

function readText(relativePath, root = repoRoot) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function walkMarkdown(relativePath, root = repoRoot, files = []) {
  const fullPath = path.join(root, relativePath);
  if (!existsSync(fullPath)) return files;
  const stat = statSync(fullPath);
  if (stat.isDirectory()) {
    for (const entry of readdirSync(fullPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === ".DS_Store") continue;
      walkMarkdown(path.join(relativePath, entry.name), root, files);
    }
  } else if (stat.isFile() && relativePath.endsWith(".md")) {
    files.push(relativePath.split(path.sep).join("/"));
  }
  return files;
}

function isHistoricalAllowed(relativePath, content) {
  if (relativePath.startsWith("docs/decisions/")) return true;
  return relativePath === "docs/harness/live-nucleus-inventory-2026-06-25.md"
    && /Superseded historical snapshot/u.test(content)
    && /Old paths below are preserved only as 2026-06-25 evidence/u.test(content);
}

function lineNumberForIndex(text, index) {
  return text.slice(0, index).split("\n").length;
}

export function validateNoActiveStalePaths({ root = repoRoot, docPaths = DEFAULT_DOC_PATHS } = {}) {
  const failures = [];
  const files = [...new Set(docPaths.flatMap((docPath) => walkMarkdown(docPath, root)))];
  for (const relativePath of files) {
    const content = readText(relativePath, root);
    if (isHistoricalAllowed(relativePath, content)) continue;
    for (const stale of STALE_ACTIVE_PATHS) {
      for (const match of content.matchAll(stale.pattern)) {
        failures.push(`${relativePath}:${lineNumberForIndex(content, match.index ?? 0)}: ${stale.label} is active-doc stale; use ${stale.replacement}`);
      }
    }
  }
  return failures;
}

function packageScriptNames(pkg) {
  return new Set(Object.keys(pkg.scripts ?? {}));
}

export function validateDocumentedCommands({ pkg, root = repoRoot, docPaths = COMMAND_DOC_PATHS } = {}) {
  const packageJson = pkg ?? JSON.parse(readText("package.json", root));
  const scripts = packageScriptNames(packageJson);
  const failures = [];

  for (const required of ["render-nucleus", "install-nucleus", "check"]) {
    if (!scripts.has(required)) failures.push(`package.json: missing required script ${required}`);
  }

  for (const relativePath of docPaths) {
    const content = readText(relativePath, root);
    for (const match of content.matchAll(/npm run ([a-z0-9:_-]+)/giu)) {
      const script = match[1];
      if (!scripts.has(script)) {
        failures.push(`${relativePath}:${lineNumberForIndex(content, match.index ?? 0)}: documents npm script ${script}, but package.json does not define it`);
      }
    }
    if (/install-nucleus`?\s+is\s+`?node scripts\/render-harness-nucleus\.mjs --write/u.test(content)) {
      failures.push(`${relativePath}: install-nucleus description disagrees with package.json (${packageJson.scripts?.["install-nucleus"] ?? "missing"})`);
    }
    if (/render-harness-nucleus\.mjs --write/u.test(content) && /npm run install-nucleus/u.test(content)) {
      failures.push(`${relativePath}: install flow still points at render-harness-nucleus.mjs instead of package.json install-nucleus`);
    }
  }

  return failures;
}

function factorioTableSkills(manifest) {
  const table = manifest.match(/## Skill table\n\n(?<table>[\s\S]*?)\n\n## MVP skill contracts/u)?.groups?.table ?? "";
  const skills = [];
  for (const line of table.split("\n")) {
    const match = line.match(/^\| `([^`]+)` \|/u);
    if (match) skills.push(match[1]);
  }
  return skills;
}

function shippedSkillNames(root = repoRoot, skillsRoot = nucleusSkillsRoot) {
  const names = new Set();
  for (const candidateRoot of [skillsRoot, nucleusUtilitiesRoot]) {
    const dir = path.join(root, candidateRoot);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(path.join(dir, entry.name, "SKILL.md"))) names.add(entry.name);
    }
  }
  return names;
}

export function validateFactorioKitRoster({ root = repoRoot, manifestPath = "docs/skills/factorio-kit.md", skillsRoot = nucleusSkillsRoot } = {}) {
  const manifest = readText(manifestPath, root);
  const failures = [];
  if (!/build envelope, not an active adapter template/u.test(manifest)) {
    failures.push(`${manifestPath}: must explicitly label factorio-kit.md as a build manifest, not active adapter source`);
  }
  if (!/validated against committed `nucleus\/skills\/` by `npm run check`/u.test(manifest)) {
    failures.push(`${manifestPath}: must document that the roster is validated against committed nucleus/skills`);
  }

  const roster = factorioTableSkills(manifest);
  const shipped = shippedSkillNames(root, skillsRoot);
  if (!roster.length) failures.push(`${manifestPath}: could not parse Skill table roster`);
  for (const skill of roster) {
    if (!shipped.has(skill)) failures.push(`${manifestPath}: roster skill ${skill} is not shipped under ${skillsRoot}/${skill}/SKILL.md`);
  }
  return failures;
}

export function evaluateNucleusDocsDrift(options = {}) {
  const failures = [
    ...validateNoActiveStalePaths(options),
    ...validateDocumentedCommands(options),
    ...validateFactorioKitRoster(options),
  ];
  return { checks: 3, failures };
}

const invokedDirectly = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (invokedDirectly) {
  try {
    const { checks, failures } = evaluateNucleusDocsDrift();
    if (failures.length) {
      console.error("Nucleus docs drift check failed:");
      for (const failure of failures) console.error(`- ${failure}`);
      process.exit(1);
    }
    console.log(`Nucleus docs drift check passed: ${checks} check groups`);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}
