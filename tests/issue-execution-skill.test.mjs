import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const skill = readFileSync(new URL("../.agents/skills/issue-execution/SKILL.md", import.meta.url), "utf8");

test("issue-execution has the required trigger", () => {
  assert.match(skill, /description: Use when the user asks to start, continue, or ship one tracked issue end-to-end/u);
});

test("issue-execution preserves one issue one worktree one PR", () => {
  assert.match(skill, /one issue\/task to one branch\/worktree to one PR/u);
});

test("issue-execution requires repo-local docs", () => {
  assert.match(skill, /AGENTS\.md/u);
  assert.match(skill, /docs\/agents\/issue-tracker\.md/u);
  assert.match(skill, /docs\/agents\/triage-labels\.md/u);
});

test("issue-execution routes to specialized skills", () => {
  for (const route of ["triage", "diagnose", "tdd", "handoff"]) {
    assert.ok(skill.includes(`\`${route}\``), `${route} route missing`);
  }
});

test("issue-execution does not create branches during validation", () => {
  assert.match(skill, /does not create branches, worktrees, issues, or PRs while being validated/u);
});

test("issue-execution keeps closeout with the main agent", () => {
  assert.match(skill, /prepares a review packet/u);
  assert.match(skill, /Do not spawn separate subagents/u);
  assert.match(skill, /they do not own issue closeout/u);
});
