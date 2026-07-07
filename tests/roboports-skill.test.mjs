import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const skill = readFileSync(new URL("../skills/roboports/SKILL.md", import.meta.url), "utf8");

test("roboports frontmatter name matches the directory", () => {
  assert.match(skill, /^name: roboports$/mu);
});

test("roboports has the required trigger", () => {
  assert.match(
    skill,
    /description: The implement coordinator\. Runs one tracked Linear issue end-to-end as code/u,
  );
  assert.match(
    skill,
    /Use when the user asks to start, continue, or ship one tracked issue, refactor without changing behavior, or optimize a proven bottleneck\./u,
  );
});

test("roboports preserves one issue one branch one PR with the bridge", () => {
  assert.match(skill, /one issue to one branch\/worktree to one PR/u);
  assert.match(skill, /branch name carries the Linear issue id/u);
});

test("roboports keeps the localized-fanout discipline", () => {
  assert.match(skill, /[Ll]ocalized roboport discipline/u);
  assert.match(skill, /disjoint write scope/u);
  assert.match(skill, /never a universal backbone/u);
});

test("roboports cites the minimal-diff doctrine and routes to specialists", () => {
  for (const route of ["tdd", "lab", "rocket-launch"]) {
    assert.ok(skill.includes(`\`${route}\``), `${route} citation missing`);
  }
  assert.match(skill, /debug-tools/u);
  assert.match(skill, /biters\s+minimal-diff lens/u);
  assert.match(skill, /biters drift lens/u);
  assert.match(skill, /blueprint's triage lens/u);
});

test("roboports implements only the acceptance criteria", () => {
  assert.match(skill, /Implement only the acceptance criteria/u);
});

test("roboports reads the repo envelope instead of hardcoding commands", () => {
  assert.match(skill, /repo envelope/u);
  assert.match(skill, /[Nn]ever hardcode commands/u);
});

test("roboports does not own closeout and never silently closes", () => {
  assert.match(skill, /does not own closeout/u);
  assert.match(skill, /never silently closes the issue/u);
});

test("roboports resolves side-effect boundary before tracker or PR actions", () => {
  assert.match(skill, /Side-effect boundary: resolve the packet's `context` \(`validation` \| `live`\)/u);
});

test("roboports documents hard rename without keeping old canonical path", () => {
  assert.match(skill, /former canonical name/u);
  assert.match(skill, /steady state is `roboports` only/u);
});
