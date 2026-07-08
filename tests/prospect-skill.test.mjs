import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const skill = readFileSync(new URL("../skills/prospect/SKILL.md", import.meta.url), "utf8");

test("prospect has the required trigger", () => {
  assert.match(
    skill,
    /Use when the user is starting a new idea, feature, or initiative from scratch and wants it captured as planning work before a spec or issues exist\./u,
  );
});

test("prospect never implements and never creates issues", () => {
  assert.match(skill, /Never starts implementation/u);
  assert.match(skill, /Never creates issues or sub-issues/u);
});

test("prospect creates the tracker home plus a brief", () => {
  assert.match(skill, /save_initiative/u);
  assert.match(skill, /save_project/u);
  assert.match(skill, /save_document/u);
});

test("prospect reads the assembler envelope and never hardcodes the team", () => {
  assert.match(skill, /read the repo envelope/iu);
  assert.match(skill, /never hardcodes a team/u);
});

test("prospect cites the downstream kit routes", () => {
  assert.ok(skill.includes("`blueprint`"), "blueprint route missing");
  assert.match(skill, /research-spike lens/u);
  assert.match(skill, /issue-decomposition lens/u);
});

test("prospect routes split-into-issues to blueprint's issue-decomposition lens", () => {
  assert.match(skill, /split into issues \/ make tickets\*\* -> that is `blueprint`\n\s+\(issue-decomposition lens\)/u);
});
