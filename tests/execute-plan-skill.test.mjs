import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const skill = readFileSync(new URL("../nucleus/skills/execute-plan/SKILL.md", import.meta.url), "utf8");

test("execute-plan has the required trigger", () => {
  assert.match(
    skill,
    /description: Use when the user says go, execute, proceed, ship the current plan, or stop discussing and implement\./u,
  );
});

test("execute-plan requires todos for explicit checklists", () => {
  assert.match(skill, /Convert any explicit user checklist, numbered list, phase list, or specification acceptance list into todos before work starts/u);
});

test("execute-plan requires delegation and verification", () => {
  assert.match(skill, /Delegate only when it is efficient/u);
  assert.match(skill, /disjoint implementation write scopes/u);
  assert.match(skill, /Verify the affected behavior before yielding/u);
});

test("execute-plan keeps main as integrator", () => {
  assert.match(skill, /The main agent remains the integrator/u);
  assert.match(skill, /Main agent implements the first pass/u);
  assert.match(skill, /One or two reviewers inspect distinct scopes/u);
  assert.match(skill, /avoid separate "review issue", "implement", "review findings", and "fix findings" agents/u);
});

test("execute-plan asks only for missing external decisions", () => {
  assert.match(skill, /Ask only for missing external decisions/u);
  assert.match(skill, /tools, repository context, docs, or issue state cannot answer/u);
});

test("execute-plan does not own issue closeout", () => {
  assert.match(skill, /not an issue closeout workflow/u);
  assert.match(skill, /route to `roboports`/u);
});
