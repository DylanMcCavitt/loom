import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const skill = readFileSync(new URL("../skills/space-age/SKILL.md", import.meta.url), "utf8");

test("space-age frontmatter name matches the directory", () => {
  assert.match(skill, /^name: space-age$/mu);
});

test("space-age has the required trigger", () => {
  assert.match(
    skill,
    /description: Promotes an artifact planet by planet through CI\/CD environments/u,
  );
  assert.match(
    skill,
    /Use when work crosses one repo or one environment: CI\/CD pipelines, releasing\/promoting through staging then prod, or rolling a change across multiple service repos\./u,
  );
});

test("space-age maps planets to environments and the platform to the pipeline", () => {
  assert.match(skill, /environment or repo is a \*\*planet\*\*/u);
  assert.match(skill, /CI\/CD pipeline is the \*\*space platform\*\*/u);
});

test("space-age applies the rocket-launch gates per environment and never promotes past a red gate", () => {
  assert.ok(skill.includes("`rocket-launch` gates apply per environment"));
  assert.match(skill, /per-environment gates/u);
  assert.match(skill, /[Nn]ever promotes? past a red gate/u);
});

test("space-age reuses rocket-launch per hop rather than reinventing gates", () => {
  assert.ok(skill.includes("`rocket-launch` per hop"));
  assert.match(skill, /rather than reinventing merge\/gate logic/u);
});

test("space-age orders cross-repo changes by dependency", () => {
  assert.match(skill, /cross-repo changes are dependency-ordered/u);
  assert.match(skill, /dependents land after/u);
});

test("space-age reads the repo envelope for environments and never hardcodes them", () => {
  assert.match(skill, /repo envelope/u);
  assert.match(skill, /[Nn]ever hardcode/u);
});

test("space-age routes single-PR ships and feature work elsewhere", () => {
  for (const route of ["rocket-launch", "roboports"]) {
    assert.ok(skill.includes(`\`${route}\``), `${route} route missing`);
  }
});

test("space-age does not promote or merge across repos while being validated", () => {
  assert.match(
    skill,
    /does not deploy, promote artifacts, trigger pipelines, or merge across repos while being validated/u,
  );
});
