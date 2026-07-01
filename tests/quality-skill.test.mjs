import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const skill = readFileSync(new URL("../nucleus/skills/quality/SKILL.md", import.meta.url), "utf8");

test("quality frontmatter name matches the directory", () => {
  assert.match(skill, /^name: quality$/mu);
});

test("quality has the required trigger", () => {
  assert.match(skill, /description: Refactors existing code in place without changing behavior/u);
  assert.ok(
    skill.includes(
      "Use when improving existing code in place without changing behavior: refactor for clarity/maintainability, raise a module's quality tier, or delete or salvage dead or duplicated code.",
    ),
    "concrete Use when trigger missing",
  );
});

test("quality is behavior-preserving with no feature change", () => {
  assert.match(skill, /behavior-preserving/u);
  assert.match(skill, /tests stay green; no feature change/u);
});

test("quality carries the tier (upgrade) and recycler (delete/salvage) moves", () => {
  assert.match(skill, /upgrade in place/u);
  assert.match(skill, /[Rr]ecycler/u);
  for (const word of ["delete", "salvage", "vertical", "horizontal"]) {
    assert.ok(skill.includes(word), `${word} move missing`);
  }
});

test("quality cites bus-first: reuse before rewrite", () => {
  assert.ok(skill.includes("`bus-first`"), "bus-first citation missing");
  assert.match(skill, /reuse before rewrite/u);
});

test("quality never deletes load-bearing guards", () => {
  assert.match(skill, /[Nn]ever delete[s]? load-bearing guards/u);
  for (const guard of ["validation", "security", "accessibility"]) {
    assert.ok(skill.includes(guard), `${guard} guard missing`);
  }
});

test("quality routes perf to modules and structure to main-bus", () => {
  assert.ok(skill.includes("`modules`"), "modules route missing");
  assert.ok(skill.includes("`main-bus`"), "main-bus route missing");
  assert.match(skill, /[Dd]istinct from `modules`/u);
});
