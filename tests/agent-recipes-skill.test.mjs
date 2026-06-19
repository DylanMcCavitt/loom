import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const skill = readFileSync(new URL("../.agents/skills/agent-recipes/SKILL.md", import.meta.url), "utf8");

test("agent-recipes has the required trigger", () => {
  assert.match(
    skill,
    /description: Use when the user wants to spawn agents from a short intent such as review, debug, tests, parallel implementation, or issue work\./u,
  );
});

test("agent-recipes tells main to batch independent tasks", () => {
  assert.match(skill, /Always batch independent tasks in one `task` call/u);
});

test("agent-recipes keeps main agent as integrator", () => {
  assert.match(skill, /The main agent owns issue intake, implementation, integration, fixing review findings, final checks, commit, push, and PR/u);
  assert.match(skill, /Do not create separate subagents for "read the issue", "implement", "review findings", and "fix findings"/u);
  assert.match(skill, /Before review fanout, the main agent should prepare a review packet/u);
  assert.match(skill, /Split reviewer scopes by question, not just by title/u);
});

test("each recipe has target change acceptance and no project-wide gates", () => {
  const recipeNames = ["Review", "Debug", "Tests", "Parallel implementation", "Issue work"];
  for (const recipeName of recipeNames) {
    const start = skill.indexOf(`## ${recipeName} recipe`);
    assert.notEqual(start, -1, `${recipeName} recipe missing`);
    const next = skill.indexOf("\n## ", start + 1);
    const block = skill.slice(start, next === -1 ? skill.length : next);
    assert.match(block, /Role: `[^`]+`/u, `${recipeName} role missing`);
    assert.match(block, /# Target/u, `${recipeName} target missing`);
    assert.match(block, /# Change/u, `${recipeName} change missing`);
    assert.match(block, /# Acceptance/u, `${recipeName} acceptance missing`);
    assert.match(block, /Do not run project-wide gates, formatters, build, lint, or tests\./u, `${recipeName} no-gates instruction missing`);
  }
});

test("issue work recipe does not own PR closeout", () => {
  const start = skill.indexOf("## Issue work recipe");
  const block = skill.slice(start);
  assert.match(block, /Do not own final issue integration or PR closeout/u);
  assert.match(block, /scout, isolated implementation, targeted tests, or scoped review/u);
});
