import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const skill = readFileSync(new URL("../nucleus/utilities/map-seed/SKILL.md", import.meta.url), "utf8");

test("map-seed name matches its directory", () => {
  assert.match(skill, /^name: map-seed$/mu);
});

test("map-seed has the required trigger", () => {
  assert.match(
    skill,
    /Use when the user wants to prototype or de-risk a design before committing/u,
  );
});

test("map-seed runs the throwaway -> retro -> reroll loop", () => {
  assert.match(skill, /Run a throwaway prototype/u);
  assert.match(skill, /Retro the run/u);
  assert.match(skill, /Reroll the seed — restart fresh carrying the learnings/u);
});

test("map-seed plans around fixed constraints it can't change", () => {
  assert.match(skill, /plan around fixed constraints/u);
  assert.match(skill, /can't change/u);
});

test("map-seed feeds findings into blueprint and never ships to prod", () => {
  assert.ok(skill.includes("`blueprint`"), "must cite blueprint by name");
  assert.match(skill, /never ships to production directly/u);
});

test("map-seed reuses both prototype branches", () => {
  assert.ok(skill.includes("[LOGIC.md](LOGIC.md)"), "logic branch reference missing");
  assert.ok(skill.includes("[UI.md](UI.md)"), "UI branch reference missing");
});
