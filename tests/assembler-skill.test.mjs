import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const skill = readFileSync(new URL("../nucleus/utilities/assembler/SKILL.md", import.meta.url), "utf8");

test("assembler has the required trigger", () => {
  assert.match(skill, /description: Sets a repository up for the Factorio workflow kit or refreshes its envelope/u);
  assert.match(skill, /Use when setting up a repo for the kit or refreshing/u);
});

test("assembler generates the repo-local envelope bindings", () => {
  assert.match(skill, /\.agents\/envelope\//u);
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
  assert.match(skill, /never overwrites an existing envelope file/u);
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

test("assembler replaces the bootstrap trio", () => {
  assert.match(skill, /replaces the retired bootstrap trio/u);
  for (const trio of ["repo-workflow-bootstrap", "workflow-kit", "setup-matt-pocock-skills"]) {
    assert.ok(skill.includes(`\`${trio}\``), `${trio} not named`);
  }
});

test("assembler wires the agent-skills block into AGENTS/CLAUDE", () => {
  assert.match(skill, /## Agent skills/u);
  assert.match(skill, /AGENTS\.md/u);
  assert.match(skill, /CLAUDE\.md/u);
});

test("assembler scaffolds repo-specific skills and agents", () => {
  assert.match(skill, /Repo-specific skills and agents/u);
  assert.match(skill, /\.agents\/skills\//u);
  assert.match(skill, /\.agents\/agents\//u);
  assert.match(skill, /\(SCAFFOLD\.md\)/u);
});

test("assembler verifies the envelope is complete", () => {
  assert.match(skill, /\*\*Verify\.\*\*/u);
  assert.match(skill, /\(VERIFY\.md\)/u);
});

test("assembler links its reference files", () => {
  assert.match(skill, /\(ENVELOPE\.md\)/u);
  assert.match(skill, /\(SCAFFOLD\.md\)/u);
  assert.match(skill, /\(VERIFY\.md\)/u);
});
