import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const validator = new URL("../scripts/validate-skills.mjs", import.meta.url).pathname;
const fixtures = new URL("fixtures/skills/", import.meta.url).pathname;
const repoRoot = new URL("../", import.meta.url).pathname;
const repoSkillsDir = new URL("../skills", import.meta.url).pathname;

function runValidation(fixture, extraArgs = []) {
  return spawnSync(process.execPath, [
    validator,
    "--skills-dir",
    `${fixtures}${fixture}/.agents/skills`,
    "--global-skills-dir",
    `${fixtures}global/.agents/skills`,
    ...extraArgs,
  ], { encoding: "utf8" });
}

function runRepoValidation(globalSkillsDir) {
  return spawnSync(process.execPath, [
    validator,
    "--skills-dir",
    repoSkillsDir,
    "--global-skills-dir",
    globalSkillsDir,
  ], { cwd: repoRoot, encoding: "utf8" });
}

function withSymlinkedGlobalSkillsRoot(target, callback) {
  const scratch = mkdtempSync(path.join(tmpdir(), "validate-skills-global-"));
  try {
    const globalSkillsDir = path.join(scratch, "skills");
    symlinkSync(target, globalSkillsDir, "dir");
    return callback(globalSkillsDir);
  } finally {
    rmSync(scratch, { force: true, recursive: true });
  }
}

test("accepts valid one-level skills with concrete triggers", () => {
  const result = runValidation("good");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Skill validation passed: 1 skill checked/u);
});

test("rejects missing and invalid skill metadata versions", () => {
  const result = runValidation("bad-version");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing metadata\.version/u);
  assert.match(result.stderr, /metadata\.version must be valid semver/u);
  assert.match(result.stderr, /bad-leading-zero-prerelease\/SKILL\.md: metadata\.version must be valid semver/u);
  assert.match(result.stderr, /bad-leading-zero-dotted-prerelease\/SKILL\.md: metadata\.version must be valid semver/u);
});

test("accepts valid semver prerelease identifiers", () => {
  const result = runValidation("good-prerelease");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Skill validation passed: 3 skills checked/u);
});

test("rejects missing frontmatter", () => {
  const result = runValidation("bad-missing-frontmatter");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing frontmatter block/u);
});

test("rejects duplicate skill names", () => {
  const result = runValidation("bad-duplicate-name");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /duplicate skill name 'duplicate-skill'/u);
});

test("rejects names colliding with global skills", () => {
  const result = runValidation("bad-global-collision");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /collides with an existing global skill/u);
});

test("ignores global skills dir that resolves to this repo's canonical skills root", () => {
  withSymlinkedGlobalSkillsRoot(repoSkillsDir, (globalSkillsDir) => {
    const result = runRepoValidation(globalSkillsDir);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Skill validation passed: \d+ skills checked/u);
  });
});

test("rejects API-key and token looking text", () => {
  const result = runValidation("bad-secret");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /API-key\/token-looking text/u);
});

test("rejects fine-grained GitHub PAT looking text", () => {
  const result = runValidation("bad-fine-grained-pat");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /API-key\/token-looking text/u);
});

test("rejects nested SKILL.md files", () => {
  const result = runValidation("bad-nested-skill");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /exactly one level/u);
});

// --- roster-contract guard (unit; requireCanonical off to run against temp trees) ---

const { validateRosterContract } = await import("../scripts/validate-skills.mjs");

function makeRosterFixture({ contract, packages }) {
  const root = mkdtempSync(path.join(tmpdir(), "roster-guard-"));
  const skillsDir = path.join(root, "skills");
  for (const [name, files] of Object.entries(packages)) {
    mkdirSync(path.join(skillsDir, name), { recursive: true });
    for (const file of files) {
      writeFileSync(path.join(skillsDir, name, file), `# ${name} ${file}\n`);
    }
  }
  const contractPath = path.join(root, "agent-contract.md");
  if (contract !== null) writeFileSync(contractPath, contract);
  return { root, skillsDir, contractPath };
}

const ROSTER_TABLE = "# Contract\n\n## Roster\n\n| `blueprint` | shape |\n| `belt` | handoffs |\n";

test("roster guard fails when the shared agent contract is missing", () => {
  const { root, skillsDir, contractPath } = makeRosterFixture({ contract: null, packages: { blueprint: ["SKILL.md", "AGENTS.md"] } });
  try {
    const errors = [];
    validateRosterContract(skillsDir, errors, { contractPath, requireCanonical: false });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /missing — the canonical skills root requires the shared agent contract/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("roster guard fails when a shipped agent package is absent from the roster table", () => {
  const { root, skillsDir, contractPath } = makeRosterFixture({
    contract: "# Contract\n\n## Roster\n\n| `blueprint` | shape |\n",
    packages: { blueprint: ["SKILL.md", "AGENTS.md"], belt: ["SKILL.md", "AGENTS.md"] },
  });
  try {
    const errors = [];
    validateRosterContract(skillsDir, errors, { contractPath, requireCanonical: false });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /belt: agent package \(ships AGENTS\.md\) is missing from the .* roster table/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("roster guard fails when a roster agent ships no package, passes when aligned", () => {
  const { root, skillsDir, contractPath } = makeRosterFixture({
    contract: ROSTER_TABLE,
    packages: { blueprint: ["SKILL.md", "AGENTS.md"], belt: ["SKILL.md", "AGENTS.md"], "map-seed": ["SKILL.md"] },
  });
  try {
    const errors = [];
    validateRosterContract(skillsDir, errors, { contractPath, requireCanonical: false });
    assert.deepEqual(errors, []);
    rmSync(path.join(skillsDir, "belt", "SKILL.md"));
    const errors2 = [];
    validateRosterContract(skillsDir, errors2, { contractPath, requireCanonical: false });
    assert.equal(errors2.length, 1);
    assert.match(errors2[0], /roster agent belt is not shipped under skills\/belt\/SKILL\.md/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
