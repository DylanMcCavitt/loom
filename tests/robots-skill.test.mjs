import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const skill = readFileSync(new URL("../.agents/skills/robots/SKILL.md", import.meta.url), "utf8");

test("robots frontmatter name matches the directory", () => {
  assert.match(skill, /^name: robots$/mu);
});

test("robots has the required trigger", () => {
  assert.match(
    skill,
    /description: Runs one tracked Linear issue end-to-end as code/u,
  );
  assert.match(
    skill,
    /Use when the user asks to start, continue, or ship one tracked Linear issue end-to-end \(implement, test, and open or update the PR\)\./u,
  );
});

test("robots preserves one issue one branch one PR with the bridge", () => {
  assert.match(skill, /one issue to one branch\/worktree to one PR/u);
  assert.match(skill, /branch name carries the Linear issue id/u);
});

test("robots keeps the localized-fanout discipline", () => {
  assert.match(skill, /[Ll]ocalized roboport discipline/u);
  assert.match(skill, /disjoint write scope/u);
  assert.match(skill, /never a universal backbone/u);
});

test("robots cites bus-first and routes to specialists", () => {
  for (const route of ["bus-first", "tdd", "diagnose", "dispatch", "rocket-launch"]) {
    assert.ok(skill.includes(`\`${route}\``), `${route} citation missing`);
  }
});

test("robots implements only the acceptance criteria", () => {
  assert.match(skill, /Implements only the acceptance criteria/u);
});

test("robots reads the repo contract instead of hardcoding commands", () => {
  assert.match(skill, /repo contract/u);
  assert.match(skill, /[Nn]ever hardcode commands/u);
});

test("robots does not own closeout and never silently closes", () => {
  assert.match(skill, /does not own closeout/u);
  assert.match(skill, /never silently closes the issue/u);
});

test("robots does not create branches or PRs while being validated", () => {
  assert.match(skill, /does not create branches, worktrees, or PRs while being validated/u);
});
