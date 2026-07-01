import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const skillPath = new URL("../nucleus/skills/proof-pass/SKILL.md", import.meta.url);
const evalsPath = new URL("../nucleus/skills/proof-pass/evals/evals.json", import.meta.url);
const skill = readFileSync(skillPath, "utf8");

test("proof-pass frontmatter and trigger are concrete", () => {
  assert.match(skill, /^name: proof-pass$/mu);
  assert.match(skill, /description: Run proof-only validation/u);
  assert.match(skill, /Use when the user asks to prove, verify, smoke test/u);
});

test("proof-pass stays proof-only", () => {
  assert.match(skill, /Do not add features/u);
  assert.match(skill, /Do not expand scope/u);
  assert.match(skill, /Separate "code\/checks pass" from "operational proof passed\."/u);
});

test("proof-pass has routing eval coverage", () => {
  assert.ok(existsSync(evalsPath), "proof-pass evals missing");
  const evals = JSON.parse(readFileSync(evalsPath, "utf8"));
  assert.equal(evals.skill_name, "proof-pass");
  assert.ok(evals.evals.some((entry) => /Does NOT activate proof-pass/u.test(entry.expected_output)));
});
