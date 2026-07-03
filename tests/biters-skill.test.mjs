import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const skill = readFileSync(new URL("../nucleus/skills/biters/SKILL.md", import.meta.url), "utf8");

test("biters frontmatter name matches the directory", () => {
  assert.match(skill, /^name: biters$/mu);
});

test("biters has the required adversarial-review trigger", () => {
  assert.match(
    skill,
    /description: Adversarial reviewer that attacks a change before merge/u,
  );
  assert.match(
    skill,
    /Use when the user wants a change reviewed adversarially, risks found before merge, or a lens-focused review pass \(correctness, security, minimal-diff, drift\)\./u,
  );
});

test("biters carries the four review lenses with correctness as default", () => {
  assert.match(skill, /`correctness` \(default\)/u);
  for (const lens of ["lens-correctness.md", "lens-security.md", "lens-minimal-diff.md", "lens-drift.md"]) {
    assert.ok(skill.includes(`references/${lens}`), `${lens} reference missing`);
  }
});

test("biters lenses select guidance only and never widen scope", () => {
  assert.match(skill, /Lenses select guidance only/u);
  assert.match(skill, /never widen packet scope/u);
});

test("biters records the absorbed retired reviewer agents", () => {
  assert.match(skill, /absorbed from the retired `spitters` agent/u);
  assert.match(skill, /absorbed from the retired `bus-first` agent/u);
  assert.match(skill, /absorbed from the retired `radar` agent/u);
});

test("biters reports findings by severity with a smallest fix", () => {
  assert.match(skill, /findings by severity/u);
  assert.match(skill, /smallest fix/u);
  assert.match(skill, /Findings first, ordered by severity/u);
});

test("biters treats a missing guard as a finding", () => {
  assert.match(skill, /A missing guard .* is always a finding/u);
});

test("biters reports only — never edits, weakens guards, or exploits", () => {
  assert.match(skill, /it maps and reports; it never fixes, weakens a guard, or runs live exploits/u);
  assert.match(skill, /Do not edit code/u);
  assert.match(skill, /Do not weaken guards/u);
  assert.match(skill, /exfiltrate/u);
});
