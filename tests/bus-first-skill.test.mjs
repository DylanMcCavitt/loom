import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const skill = readFileSync(new URL("../.agents/skills/bus-first/SKILL.md", import.meta.url), "utf8");

test("bus-first has the required trigger", () => {
  assert.match(skill, /name: bus-first/u);
  assert.match(
    skill,
    /Use when writing or changing code and the change risks/u,
  );
  assert.match(skill, /minimal-diff or tighten pass on a change or PR/u);
});

test("bus-first states all seven rungs in order", () => {
  const rungs = [
    /Does this need to exist at all\?/u,
    /Is it already on the bus\?/u,
    /standard library/u,
    /native platform feature/u,
    /already-installed dependency/u,
    /Is it one line\?/u,
    /minimum that works/u,
  ];
  let cursor = 0;
  for (const rung of rungs) {
    const idx = skill.slice(cursor).search(rung);
    assert.ok(idx !== -1, `rung missing or out of order: ${rung}`);
    cursor += idx + 1;
  }
});

test("bus-first protects the guards that are never cut", () => {
  for (const guard of ["validation", "security", "accessibility"]) {
    assert.ok(skill.includes(guard), `guard missing: ${guard}`);
  }
  assert.match(skill, /never (?:tear down the wall|negligent)/u);
});

test("bus-first keeps the read-first discipline", () => {
  assert.match(skill, /lazy about the\s+solution, never about reading/u);
});

test("bus-first links its reference files", () => {
  assert.match(skill, /\(LADDER\.md\)/u);
  assert.match(skill, /\(REVIEW\.md\)/u);
});
