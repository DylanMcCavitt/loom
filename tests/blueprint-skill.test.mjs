import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const skill = readFileSync(new URL("../nucleus/skills/blueprint/SKILL.md", import.meta.url), "utf8");

test("blueprint has the required trigger", () => {
  assert.match(skill, /description: The shape owner\. Turns current context into a PRD\/spec/u);
  assert.match(
    skill,
    /Use for any shape-mode work - specs, breaking work into issues, planning structure, resolving unknowns, or triaging incoming issues\./u,
  );
});

test("blueprint synthesizes from context and never interviews", () => {
  assert.match(skill, /Synthesize, never interview/u);
  assert.match(skill, /Do not interview the user/u);
});

test("blueprint spec requires acceptance criteria, non-goals, and a proof plan", () => {
  assert.match(skill, /acceptance criteria/iu);
  assert.match(skill, /non-goals/iu);
  assert.match(skill, /proof plan/iu);
});

test("blueprint specs in the repo domain glossary read from the envelope", () => {
  assert.match(skill, /domain glossary/u);
  assert.match(skill, /read the envelope/u);
});

test("blueprint publishes the spec as a Linear document via save_document", () => {
  assert.match(skill, /Linear \*\*document\*\*/u);
  assert.match(skill, /`save_document`/u);
});

test("blueprint owns the four canonical templates", () => {
  for (const tpl of ["prd.md", "linear-project-doc.md", "linear-issue.md", "pull-request.md"]) {
    assert.ok(skill.includes(`templates/${tpl}`), `${tpl} reference missing`);
  }
});

test("blueprint spec-synthesis never creates issues and routes onward", () => {
  assert.match(skill, /The spec-synthesis lens never creates issues/u);
  for (const route of ["prospect", "map-seed", "roboports"]) {
    assert.ok(skill.includes(`\`${route}\``), `${route} route missing`);
  }
  assert.match(skill, /issue-decomposition lens/u);
});
