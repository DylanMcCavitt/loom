import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const skill = readFileSync(new URL("../.agents/skills/main-bus/SKILL.md", import.meta.url), "utf8");

test("main-bus frontmatter name matches the directory", () => {
  assert.match(skill, /^name: main-bus$/mu);
});

test("main-bus has the required trigger", () => {
  assert.match(
    skill,
    /description: Plans a codebase's shared main bus/u,
  );
  assert.match(
    skill,
    /Use when planning structure or architecture so a codebase can scale without walling itself in — laying shared lanes, deciding seams, or untangling spaghetti before it spreads\./u,
  );
});

test("main-bus plans the bus: shared materials on clear lanes, work routed off it", () => {
  assert.match(skill, /shared materials/u);
  assert.match(skill, /off the bus/u);
  assert.match(skill, /parallel spaghetti/u);
});

test("main-bus plans and advises; routes in-place refactor to quality", () => {
  assert.match(skill, /does not mass-refactor in place/u);
  assert.ok(skill.includes("`quality`"), "must route in-place refactor to quality");
});

test("main-bus cites bus-first for the minimal restructure", () => {
  assert.ok(skill.includes("`bus-first`"), "must cite bus-first");
  assert.match(skill, /minimal restructure/u);
  assert.match(skill, /restructure no more than the scaling need requires/u);
});

test("main-bus proposes seams at the highest point", () => {
  assert.match(skill, /highest point/u);
});

test("main-bus records the decision as an ADR/doc", () => {
  assert.match(skill, /records the decision as an/u);
  assert.ok(skill.includes("ADR/doc"), "must record decisions as an ADR/doc");
});

test("main-bus reads the repo contract and domain glossary", () => {
  assert.match(skill, /repo contract/u);
  assert.match(skill, /domain glossary/u);
});

test("main-bus routes implementation to robots", () => {
  assert.ok(skill.includes("`robots`"), "must route feature implementation to robots");
});

test("main-bus reuses the carried-over architecture guidance", () => {
  assert.ok(skill.includes("[LANGUAGE.md](LANGUAGE.md)"), "architecture vocabulary reference missing");
  assert.ok(skill.includes("[LANES.md](LANES.md)"), "lanes/deepening reference missing");
});
