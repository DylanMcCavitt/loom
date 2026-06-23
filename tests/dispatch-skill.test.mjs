import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const skill = readFileSync(new URL("../.agents/skills/dispatch/SKILL.md", import.meta.url), "utf8");

test("dispatch frontmatter name matches the directory", () => {
  assert.match(skill, /^name: dispatch$/mu);
});

test("dispatch has the required trigger", () => {
  assert.match(
    skill,
    /description: Routes each incoming Linear issue to the right place/u,
  );
  assert.match(
    skill,
    /Use when sorting incoming Linear issues: classify, prioritize, set state\/labels, decide what is ready to pick up, or route bugs vs features\./u,
  );
});

test("dispatch enforces exactly one category and one state per issue", () => {
  assert.match(skill, /exactly one category role and exactly one state\s+role/u);
});

test("dispatch reads the contract label/state map and never hardcodes strings", () => {
  assert.match(skill, /repo contract/u);
  assert.match(skill, /label\/state map/u);
  assert.match(skill, /[Nn]ever hardcode a label or state string/u);
});

test("dispatch reproduces bugs before promoting them", () => {
  assert.match(skill, /[Rr]eproduce bugs before promoting them/u);
  assert.match(skill, /[Nn]ever promote a bug to `ready-for-agent` on an\s+unreproduced report/u);
});

test("dispatch never implements", () => {
  assert.match(skill, /never implements/u);
});

test("dispatch writes an agent brief when marking ready-for-agent", () => {
  assert.match(skill, /agent brief/u);
  assert.ok(skill.includes("AGENT-BRIEF.md"), "agent brief reference missing");
});

test("dispatch routes to robots and ghosts", () => {
  for (const route of ["robots", "ghosts", "diagnose"]) {
    assert.ok(skill.includes(`\`${route}\``), `${route} route missing`);
  }
});
