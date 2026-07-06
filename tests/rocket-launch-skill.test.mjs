import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const skill = readFileSync(new URL("../nucleus/skills/rocket-launch/SKILL.md", import.meta.url), "utf8");

test("rocket-launch has the required trigger", () => {
  assert.match(skill, /name: rocket-launch/u);
  assert.match(
    skill,
    /description: Ship a ready change off-planet by enforcing the launch gates, merging the PR, and letting the bridge close its Linear issue\./u,
  );
  assert.match(skill, /Use when a change is ready to ship — merge the PR, run the review gate, and close out the Linear issue/u);
});

test("rocket-launch enforces the full launch gate list", () => {
  assert.match(skill, /ALL gates must be green before merge/u);
  assert.match(skill, /\*\*Tests\*\* — targeted tests for the changed behavior pass/u);
  assert.match(skill, /Use `lab` with the `command-proof`, `smoke-proof`, or `ui-proof` lens as appropriate/u);
  assert.match(skill, /\*\*Review\*\* — at least one `biters` `correctness` lens review is clean, or its findings are fixed/u);
  assert.match(skill, /\*\*Acceptance\*\* — every Linear acceptance criterion is checked/u);
  assert.match(skill, /\*\*CI\*\* — GitHub CI is green/u);
  assert.match(skill, /\*\*Minimal diff\*\* — a `biters` `minimal-diff` lens pass over the diff/u);
});

test("rocket-launch routes proof and review gates through consolidated lenses", () => {
  for (const route of ["lab", "command-proof", "smoke-proof", "ui-proof", "biters", "correctness", "minimal-diff"]) {
    assert.ok(skill.includes(`\`${route}\``), `${route} citation missing`);
  }
  for (const retired of ["proof-pass", "pr-review", "bus-first"]) {
    assert.equal(skill.includes(`\`${retired}\``), false, `${retired} must not be cited as active rocket-launch routing`);
  }
});

test("rocket-launch never merges with a red gate", () => {
  assert.match(skill, /Never merges with a red gate\./u);
  assert.match(skill, /If any gate is red: stop, report which gate failed and why, and route the fix back to `roboports`\. Do not merge\./u);
});

test("rocket-launch closes the issue through the bridge", () => {
  assert.match(skill, /branch name carries the Linear issue id and the PR's magic words auto-close that issue on merge/u);
  assert.match(skill, /Confirm the bridge closed the Linear issue/u);
  assert.match(skill, /merge the PR and verify the bridge closed the issue/u);
});

test("rocket-launch never silently closes the issue", () => {
  assert.match(skill, /Never silently closes the issue/u);
  assert.match(skill, /never close the Linear issue by hand to fake a ship/u);
});

test("rocket-launch posts a Linear status update and leaves a record", () => {
  assert.match(skill, /Post a Linear status update/u);
  assert.match(skill, /human-reviewable record/u);
});

test("rocket-launch resolves side-effect boundary before closeout actions", () => {
  assert.match(skill, /Side-effect boundary: resolve the packet's `context` \(`validation` \| `live`\)/u);
});

test("rocket-launch routes unready work and missing contracts", () => {
  assert.match(skill, /routes back to `roboports`/u);
  assert.match(skill, /route to `assembler` first/u);
});
