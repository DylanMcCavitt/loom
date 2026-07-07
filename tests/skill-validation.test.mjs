import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const validator = new URL("../scripts/validate-skills.mjs", import.meta.url).pathname;
const fixtures = new URL("fixtures/skills/", import.meta.url).pathname;
const repoRoot = new URL("../", import.meta.url).pathname;
const repoSkillsDir = new URL("../nucleus/skills", import.meta.url).pathname;
const repoCompatSkillsDir = new URL("../.agents/skills", import.meta.url).pathname;

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

for (const { name, target } of [
  { name: "canonical skills root", target: repoSkillsDir },
  { name: "compatibility skills root", target: repoCompatSkillsDir },
]) {
  test(`ignores global skills dir that resolves to this repo's ${name}`, () => {
    withSymlinkedGlobalSkillsRoot(target, (globalSkillsDir) => {
      const result = runRepoValidation(globalSkillsDir);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Skill validation passed: \d+ skills checked/u);
    });
  });
}

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
