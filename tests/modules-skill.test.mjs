import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const skill = readFileSync(new URL("../.agents/skills/modules/SKILL.md", import.meta.url), "utf8");

test("modules name matches the directory", () => {
  assert.match(skill, /^name: modules$/mu);
});

test("modules has the required trigger", () => {
  assert.match(skill, /Use when optimizing for performance or efficiency/u);
});

test("modules measures before and after", () => {
  assert.match(skill, /Measure before and after — no unverified performance claims/u);
});

test("modules finds the proven bottleneck via diagnose", () => {
  assert.match(skill, /[Bb]ottleneck first/u);
  assert.match(skill, /reuse `diagnose`/u);
  assert.match(skill, /Optimize the proven bottleneck, not a guess/u);
});

test("modules respects diminishing returns", () => {
  assert.match(skill, /[Dd]iminishing returns/u);
  assert.match(skill, /Stop when the next gain costs more than it returns/u);
});

test("modules cites bus-first and never trades a guard for speed", () => {
  assert.match(skill, /`bus-first`/u);
  assert.match(skill, /Never trade correctness or a guard for speed/u);
});

test("modules routes readability refactors to quality", () => {
  assert.match(skill, /is `quality`/u);
});
