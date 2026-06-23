import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const skill = readFileSync(new URL("../.agents/skills/research/SKILL.md", import.meta.url), "utf8");

test("research name matches the directory", () => {
  assert.match(skill, /^name: research$/mu);
});

test("research has the required trigger", () => {
  assert.match(skill, /Use when there is an open unknown to resolve before building/u);
});

test("research is time-boxed and ties findings to a decision", () => {
  assert.match(skill, /[Tt]ime-boxed/u);
  assert.match(skill, /the decision it unblocks/u);
  assert.match(skill, /Every finding names the decision it unblocks/u);
});

test("research uses tiered science packs", () => {
  assert.match(skill, /Science packs/u);
  assert.match(skill, /Red — local spike/u);
  assert.match(skill, /Green — integration\/contract/u);
});

test("research records findings as a Linear document", () => {
  assert.match(skill, /Linear document/u);
  assert.match(skill, /save_document/u);
});

test("research never implements and routes onward", () => {
  assert.match(skill, /that is `robots`/u);
  assert.match(skill, /`blueprint`/u);
  assert.match(skill, /`map-seed`/u);
});
