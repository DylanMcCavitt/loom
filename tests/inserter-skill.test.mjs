import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const skill = readFileSync(new URL("../nucleus/skills/inserter/SKILL.md", import.meta.url), "utf8");

test("inserter frontmatter name matches the directory", () => {
  assert.match(skill, /^name: inserter$/mu);
});

test("inserter has the required trigger", () => {
  assert.match(
    skill,
    /description: Routes each incoming Linear issue to the right place/u,
  );
  assert.match(
    skill,
    /Use when sorting incoming Linear issues: classify, prioritize, set state\/labels, decide what is ready to pick up, or route bugs vs features\./u,
  );
});

test("inserter enforces exactly one category and one state per issue", () => {
  assert.match(skill, /exactly one category role and exactly one state\s+role/u);
});

test("inserter reads the envelope label/state map and never hardcodes strings", () => {
  assert.match(skill, /repo envelope/u);
  assert.match(skill, /label\/state map/u);
  assert.match(skill, /[Nn]ever hardcode a label or state string/u);
});

test("inserter reproduces bugs before promoting them", () => {
  assert.match(skill, /[Rr]eproduce bugs before promoting them/u);
  assert.match(skill, /[Nn]ever promote a bug to `ready-for-agent` on an\s+unreproduced report/u);
});

test("inserter never implements", () => {
  assert.match(skill, /never implements/u);
});

test("inserter writes an agent brief when marking ready-for-agent", () => {
  assert.match(skill, /agent brief/u);
  assert.ok(skill.includes("AGENT-BRIEF.md"), "agent brief reference missing");
});

test("inserter routes to roboports and ghosts", () => {
  for (const route of ["roboports", "ghosts", "diagnose"]) {
    assert.ok(skill.includes(`\`${route}\``), `${route} route missing`);
  }
});

test("inserter documents hard rename without keeping old canonical path", () => {
  assert.match(skill, /former canonical name/u);
  assert.match(skill, /steady state is `inserter` only/u);
});
