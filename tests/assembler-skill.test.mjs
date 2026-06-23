import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const skill = readFileSync(new URL("../.agents/skills/assembler/SKILL.md", import.meta.url), "utf8");

test("assembler has the required trigger", () => {
  assert.match(skill, /description: Sets a repository up for the Factorio workflow kit or refreshes its contract/u);
  assert.match(skill, /Use when setting up a repo for the kit or refreshing/u);
});

test("assembler generates the repo-local contract bindings", () => {
  assert.match(skill, /\.agents\/contract\//u);
  for (const binding of ["linear-map.md", "domain.md", "commands.md", "templates/"]) {
    assert.ok(skill.includes(binding), `${binding} binding missing`);
  }
});

test("assembler stamps templates from blueprint and carries the bridge", () => {
  assert.match(skill, /stamped from `blueprint`'s/u);
  assert.match(skill, /branch carries the Linear issue id/u);
  assert.match(skill, /auto-closes the issue on merge/u);
});

test("assembler holds the create-missing-only and no-secrets invariants", () => {
  assert.match(skill, /create-missing-only/iu);
  assert.match(skill, /never overwrites an existing contract file/u);
  assert.match(skill, /Never writes secrets/u);
  assert.match(skill, /never its value/u);
});

test("assembler is the single binding point other skills read", () => {
  assert.match(skill, /single binding point/u);
  assert.match(skill, /Every kit skill reads it/u);
});

test("assembler routes issue creation and spec content elsewhere", () => {
  assert.match(skill, /→ `ghosts`/u);
  for (const route of ["ghosts", "blueprint", "prospect", "bus-first"]) {
    assert.ok(skill.includes(`\`${route}\``), `${route} route missing`);
  }
});
