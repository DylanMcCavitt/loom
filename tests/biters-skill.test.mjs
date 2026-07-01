import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const skill = readFileSync(new URL("../nucleus/skills/biters/SKILL.md", import.meta.url), "utf8");

test("biters frontmatter name matches the directory", () => {
  assert.match(skill, /^name: biters$/mu);
});

test("biters has the required adversarial-security trigger", () => {
  assert.match(
    skill,
    /description: Runs an adversarial security pass that plays the attacker/u,
  );
  assert.match(
    skill,
    /Use when the user wants an adversarial security pass: hunt harmful bugs, find where the codebase could be breached, map attack paths, or stress the walls that protect it\./u,
  );
});

test("biters hunts the bug classes that actually bite", () => {
  for (const bug of [
    /[Dd]ata loss/u,
    /[Ii]njection/u,
    /[Aa]uth(?:orization)? bypass|[Aa]uth \/ authorization bypass/u,
    /leakage/u,
    /SSRF/u,
    /[Pp]ath traversal/u,
  ]) {
    assert.match(skill, bug);
  }
});

test("biters maps attack paths and ranks them by severity", () => {
  assert.match(skill, /[Mm]ap attack paths/u);
  assert.match(skill, /[Rr]ank by severity|ranked by .*severity|ranking them by/u);
  assert.match(skill, /entry → .*impact|entry →/u);
});

test("biters reports with reproduction and remediation", () => {
  assert.match(skill, /Reproduction/u);
  assert.match(skill, /Remediation/u);
});

test("biters orchestrates the kept security engines and pr-review", () => {
  for (const engine of [
    "security-threat-model",
    "security-best-practices",
    "security-ownership-map",
    "pr-review",
  ]) {
    assert.ok(skill.includes(`\`${engine}\``), `${engine} citation missing`);
  }
  assert.match(skill, /don't reinvent|rather than reinventing|reinvent/u);
});

test("biters pairs with bus-first and treats a missing guard as a finding", () => {
  assert.ok(skill.includes("`bus-first`"), "bus-first citation missing");
  assert.match(skill, /never on the chopping block/u);
  assert.match(skill, /A missing guard is a finding\./u);
});

test("biters reports only — never weakens guards or exfiltrates", () => {
  assert.match(skill, /review\/triage skill, not an exploit-running tool/u);
  assert.match(skill, /never.*weakens? a guard|never weakens a guard/u);
  assert.match(skill, /exfiltrat/u);
});
