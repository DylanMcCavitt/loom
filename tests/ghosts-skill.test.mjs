import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const skill = readFileSync(new URL("../nucleus/skills/ghosts/SKILL.md", import.meta.url), "utf8");

test("ghosts has the required trigger", () => {
  assert.match(skill, /name: ghosts/u);
  assert.match(skill, /description: Splits a plan, spec, or PRD into tracer-bullet vertical slices/u);
  assert.match(
    skill,
    /Use when the user wants to turn a plan, spec, or PRD into tracked issues, create implementation tickets, or break work down\./u,
  );
});

test("ghosts cuts tracer-bullet vertical slices", () => {
  assert.match(skill, /tracer-bullet/u);
  assert.match(skill, /vertical\*\* slices, never horizontal layer-only ones/u);
  assert.match(skill, /cuts through \*\*every layer end-to-end\*\*/u);
  assert.match(skill, /demoable or verifiable on its own/u);
  assert.match(skill, /Prefer many thin slices over few thick ones/u);
});

test("ghosts publishes to Linear in dependency order with blocked-by", () => {
  assert.match(skill, /Linear is the planning system of record/u);
  assert.ok(skill.includes("save_issue"), "save_issue missing");
  assert.match(skill, /Publish with `save_issue`, \*\*blockers first\*\*/u);
  assert.match(skill, /blockedBy/u);
  assert.match(skill, /parent/u);
  assert.ok(skill.includes("repo envelope"), "repo envelope reference missing");
});

test("ghosts does not implement and does not rescope the parent", () => {
  assert.match(skill, /never implements/u);
  assert.match(skill, /never changes the parent idea's scope/u);
  assert.match(skill, /Does not rescope the parent/u);
});

test("ghosts routes execution to roboports", () => {
  assert.ok(skill.includes("`roboports`"), "roboports route missing");
  assert.match(skill, /is `roboports`, not this skill/u);
  assert.ok(skill.includes("`blueprint`"), "blueprint source route missing");
});
