#!/usr/bin/env node
// Drift guard for LOO-112 docs/manifests cleanup.
//
// Keeps operator-facing command docs tied to package.json, rejects active-doc
// claims for pre-ADR-0004 source/output paths, verifies the Factorio kit
// manifest roster names shipped nucleus skills, and keeps OMP ownership docs
// aligned to the harness resource manifest.

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

const OMP_OWNERSHIP_DOC_PATH = "docs/harness/omp-ownership.md";

// Phase-4 rename complete: package.json name and README H1 must both resolve to "loom".
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

function isHistoricalAllowed(relativePath, content) {
  if (relativePath.startsWith("docs/decisions/")) return true;
  if (relativePath.startsWith("docs/archive/")) return true;
  return relativePath === "docs/archive/live-nucleus-inventory-2026-06-25.md"
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

function parseOwnershipRows(docText) {
  const rows = new Map();
  for (const line of docText.split("\n")) {
    const match = line.match(/^\| `([^`]+)` \| `([^`]+)` \| `([^`]+)` \| `([^`]+)` \|$/u);
    if (!match) continue;
    rows.set(match[1], {
      state: match[2],
      target: match[3],
      localOnly: match[4],
    });
  }
  return rows;
}

export function validateOmpOwnershipMatrix({
  root = repoRoot,
  resourceManifestPath = "docs/harness/resource-manifest.json",
  ownershipPath = OMP_OWNERSHIP_DOC_PATH,
} = {}) {
  const failures = [];
  const manifest = JSON.parse(readText(resourceManifestPath, root));
  const rows = parseOwnershipRows(readText(ownershipPath, root));
  const ompResources = (manifest.resources ?? []).filter((resource) => resource.sourceHarness === "omp");

  for (const resource of ompResources) {
    const row = rows.get(resource.id);
    if (!row) {
      failures.push(`${ownershipPath}: missing ownership state matrix row for OMP manifest resource ${resource.id}`);
      continue;
    }
    if (row.state !== resource.disposition) {
      failures.push(`${ownershipPath}: ${resource.id} ownership state matrix row uses ${row.state}, but manifest disposition is ${resource.disposition}`);
    }
    if (row.target !== resource.intendedRepoTarget) {
      failures.push(`${ownershipPath}: ${resource.id} ownership state matrix row targets ${row.target}, but manifest target is ${resource.intendedRepoTarget}`);
    }
    const expectedLocalOnly = resource.disposition === "local-only" ? "yes" : "no";
    if (row.localOnly !== expectedLocalOnly) {
      failures.push(`${ownershipPath}: ${resource.id} ownership state matrix row local-only marker is ${row.localOnly}, but manifest disposition requires ${expectedLocalOnly}`);
    }
    if (resource.disposition === "local-only" && (row.state !== "local-only" || row.target !== "none" || row.localOnly !== "yes")) {
      failures.push(`${ownershipPath}: ${resource.id} is local-only in the manifest and must not be documented as repo-owned or trackable`);
    }
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
    ...validateOmpOwnershipMatrix(options),
    ...validateTestTableSync(options),
    ...validateScriptsTableExistence(options),
    ...validateNameAliasPinning(options),
  ];
  return { checks: 7, failures };
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
