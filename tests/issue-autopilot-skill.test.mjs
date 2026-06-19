import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const skill = readFileSync(new URL("../.agents/skills/issue-autopilot/SKILL.md", import.meta.url), "utf8");

test("issue-autopilot has the required trigger", () => {
  assert.match(
    skill,
    /description: Use when the user asks to start, continue, or ship one tracked issue end-to-end\./u,
  );
});

test("issue-autopilot preserves one issue one worktree one PR", () => {
  assert.match(skill, /one issue\/task to one branch\/worktree to one PR/u);
});

test("issue-autopilot requires repo-local docs", () => {
  assert.match(skill, /repo-local `.omp\/AGENTS\.md`/u);
  assert.match(skill, /docs\/agents\/issue-tracker\.md/u);
  assert.match(skill, /docs\/agents\/triage-labels\.md/u);
  assert.match(skill, /other `docs\/agents\/\*` files/u);
});

test("issue-autopilot routes to specialized skills", () => {
  for (const route of ["triage", "diagnose", "tdd", "handoff"]) {
    assert.ok(skill.includes(`Use \`${route}\``), `${route} route missing`);
  }
});

test("issue-autopilot does not create branches during validation", () => {
  assert.match(skill, /does not create branches, worktrees, issues, or PRs while being validated/u);
});

test("issue-autopilot uses efficient reviewer fanout", () => {
  assert.match(skill, /The main agent owns issue intake, implementation, integration, fixing review findings, final verification, commit, push, and PR/u);
  assert.match(skill, /Main agent runs focused checks and prepares a review packet/u);
  assert.match(skill, /Do not spawn separate subagents for "read issue", "implement", "review findings", and "fix findings" by default/u);
  assert.match(skill, /acceptance\/spec versus safety\/privacy\/maintainability/u);
});
