#!/usr/bin/env node
// Keeps operator-facing command docs tied to package.json, rejects active-doc
// claims for pre-ADR-0004 source/output paths, verifies the Factorio kit
// manifest roster names shipped nucleus skills, and keeps README tables aligned
// with surviving scripts and tests.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { skillsRoot } from "./lib/layout.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const DEFAULT_DOC_PATHS = Object.freeze([
  "README.md",
  "docs/architecture",
  "docs/operator",
  "docs/skills/factorio-kit.md",
]);

const COMMAND_DOC_PATHS = Object.freeze([
  "README.md",
  "docs/operator/daily-workflow.md",
]);

const PINNED_IDENTITY_ALIASES = Object.freeze(new Set([
  "loom",
]));

// Internal lib/helper suites omitted from README's Test Suites table.
const DOC_OMITTED_TESTS = Object.freeze([
  "tests/frontmatter.test.mjs",
  "tests/harness-safety-lib.test.mjs",
  "tests/toml-key-scan.test.mjs",
]);

const STALE_ACTIVE_PATHS = Object.freeze([
  {
    label: "old OMP tracked source root",
    pattern: /omp\/\.omp\/agent\//gu,
    replacement: "skills/",
  },
]);

function readText(relativePath, root = repoRoot) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function operatorDocPaths(root = repoRoot) {
  const operatorDir = path.join(root, "docs/operator");
  if (!existsSync(operatorDir)) return ["README.md"];
  const operatorDocs = readdirSync(operatorDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join("docs/operator", entry.name).split(path.sep).join("/"))
    .sort((a, b) => a.localeCompare(b));
  return ["README.md", ...operatorDocs];
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

function isHistoricalAllowed(relativePath) {
  return relativePath.startsWith("docs/decisions/");
}

function lineNumberForIndex(text, index) {
  return text.slice(0, index).split("\n").length;
}

export function validateNoActiveStalePaths({ root = repoRoot, docPaths = DEFAULT_DOC_PATHS } = {}) {
  const failures = [];
  const files = [...new Set(docPaths.flatMap((docPath) => walkMarkdown(docPath, root)))];
  for (const relativePath of files) {
    const content = readText(relativePath, root);
    if (isHistoricalAllowed(relativePath)) continue;
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

  for (const relativePath of docPaths) {
    const content = readText(relativePath, root);
    for (const match of content.matchAll(/npm run ([a-z0-9:_-]+)/giu)) {
      const script = match[1];
      if (!scripts.has(script)) {
        failures.push(`${relativePath}:${lineNumberForIndex(content, match.index ?? 0)}: documents npm script ${script}, but package.json does not define it`);
      }
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

function shippedSkillNames(root = repoRoot, repoSkillsRoot = skillsRoot) {
  const names = new Set();
  const dir = path.join(root, repoSkillsRoot);
  if (!existsSync(dir)) return names;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && existsSync(path.join(dir, entry.name, "SKILL.md"))) names.add(entry.name);
  }
  return names;
}

export function validateFactorioKitRoster({ root = repoRoot, manifestPath = "docs/skills/factorio-kit.md", skillsRoot: repoSkillsRoot = skillsRoot } = {}) {
  const manifest = readText(manifestPath, root);
  const failures = [];
  if (!/build envelope, not an active adapter template/u.test(manifest)) {
    failures.push(`${manifestPath}: must explicitly label factorio-kit.md as a build manifest, not active adapter source`);
  }
  if (!/validated against committed `skills\/` by `npm run check`/u.test(manifest)) {
    failures.push(`${manifestPath}: must document that the roster is validated against committed skills/`);
  }

  const roster = factorioTableSkills(manifest);
  const shipped = shippedSkillNames(root, repoSkillsRoot);
  if (!roster.length) failures.push(`${manifestPath}: could not parse Skill table roster`);
  for (const skill of roster) {
    if (!shipped.has(skill)) failures.push(`${manifestPath}: roster skill ${skill} is not shipped under ${repoSkillsRoot}/${skill}/SKILL.md`);
  }
  return failures;
}

function readmeTestSuiteSection(readmeText) {
  const match = readmeText.match(/### Test Suites\n\n(?<table>[\s\S]*?)(?:\n\n## |\n*$)/u);
  return match?.groups?.table ?? "";
}

function citedTestPaths(text) {
  const paths = new Set();
  for (const match of text.matchAll(/node --test (tests\/[a-zA-Z0-9._/-]+\.test\.mjs)/giu)) {
    paths.add(match[1]);
  }
  return paths;
}

function citedScriptPaths(text) {
  const paths = new Set();
  for (const match of text.matchAll(/node (scripts\/[a-zA-Z0-9._/-]+\.mjs)/giu)) {
    paths.add(match[1]);
  }
  return paths;
}

function diskTestPaths(root = repoRoot) {
  const testsDir = path.join(root, "tests");
  if (!existsSync(testsDir)) return new Set();
  return new Set(
    readdirSync(testsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".test.mjs"))
      .map((entry) => path.posix.join("tests", entry.name)),
  );
}

export function validateTestTableSync({ root = repoRoot } = {}) {
  const failures = [];
  const readme = readText("README.md", root);
  const documented = citedTestPaths(readmeTestSuiteSection(readme));
  const omitted = new Set(DOC_OMITTED_TESTS);
  const onDisk = diskTestPaths(root);

  for (const relativePath of onDisk) {
    if (!documented.has(relativePath) && !omitted.has(relativePath)) {
      failures.push(`README.md: missing Test Suites row for ${relativePath}; document it or add to DOC_OMITTED_TESTS`);
    }
  }
  for (const relativePath of documented) {
    if (!existsSync(path.join(root, relativePath))) {
      failures.push(`README.md: Test Suites table cites missing file ${relativePath}`);
    }
  }
  return failures;
}

export function validateScriptsTableExistence({ root = repoRoot, docPaths = operatorDocPaths(root) } = {}) {
  const failures = [];
  for (const relativePath of docPaths) {
    const content = readText(relativePath, root);
    for (const scriptPath of citedScriptPaths(content)) {
      if (!existsSync(path.join(root, scriptPath))) {
        failures.push(`${relativePath}: cites missing script ${scriptPath}`);
      }
    }
  }
  return failures;
}

export function validateNameAliasPinning({ root = repoRoot } = {}) {
  const failures = [];
  const packageJson = JSON.parse(readText("package.json", root));
  const readme = readText("README.md", root);
  const h1Match = readme.match(/^# (.+)$/m);
  const h1 = h1Match?.[1]?.trim();

  if (!PINNED_IDENTITY_ALIASES.has(packageJson.name)) {
    failures.push(`package.json: name "${packageJson.name}" is not in pinned identity alias set; update PINNED_IDENTITY_ALIASES only during Phase-4 rename`);
  }
  if (!h1 || !PINNED_IDENTITY_ALIASES.has(h1.toLowerCase())) {
    failures.push(`README.md: H1 "${h1 ?? "missing"}" is not in pinned identity alias set; update PINNED_IDENTITY_ALIASES only during Phase-4 rename`);
  }
  return failures;
}

export function evaluateNucleusDocsDrift(options = {}) {
  const failures = [
    ...validateNoActiveStalePaths(options),
    ...validateDocumentedCommands(options),
    ...validateFactorioKitRoster(options),
    ...validateTestTableSync(options),
    ...validateScriptsTableExistence(options),
    ...validateNameAliasPinning(options),
  ];
  return { checks: 6, failures };
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
