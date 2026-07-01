import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const skill = readFileSync(new URL("../nucleus/skills/radar/SKILL.md", import.meta.url), "utf8");

test("radar frontmatter and trigger are concrete", () => {
  assert.match(skill, /^name: radar$/mu);
  assert.match(skill, /description: Checks Factory Nucleus drift without writing/u);
  assert.match(skill, /Use when the user asks to check drift/u);
});

test("radar is check-only and evidence-grounded", () => {
  assert.match(skill, /check-only/u);
  assert.match(skill, /no tracker writes/u);
  assert.match(skill, /Evidence-grounded/u);
});

test("radar reports the required drift artifact fields", () => {
  for (const field of ["driftClass", "affectedGhosts", "suggestedSyncActions", "suggestedRoute", "evidence"]) {
    assert.ok(skill.includes(field), `${field} missing`);
  }
});

test("radar routes to the core spine", () => {
  for (const route of ["inserter", "roboports", "proof-pass", "rocket-launch"]) {
    assert.ok(skill.includes(`\`${route}\``), `${route} route missing`);
  }
});
