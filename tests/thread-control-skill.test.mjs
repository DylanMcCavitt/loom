import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const skill = readFileSync(new URL("../.agents/skills/thread-control/SKILL.md", import.meta.url), "utf8");

test("thread-control has the required trigger", () => {
  assert.match(
    skill,
    /description: Use when the user asks whether to continue in this chat, switch context, start a new thread, resume a handoff, or make context health visible\./u,
  );
});

test("thread-control delegates handoff writing", () => {
  assert.match(skill, /does not write handoffs/u);
  assert.match(skill, /use the existing `handoff` skill/u);
  assert.match(skill, /owned by `handoff`/u);
});

test("thread-control lists every context-risk signal", () => {
  for (const signal of [
    "Many unrelated touched files",
    "Changed goal",
    "Stale verification",
    "Unresolved decisions",
    "Active subagents with divergent scope",
    "Issue/branch mismatch",
    "Stale file assumptions",
  ]) {
    assert.match(skill, new RegExp(signal, "u"));
  }
});

test("thread-control emits a visible next-thread starter", () => {
  assert.match(skill, /## Next-thread starter/u);
  assert.match(skill, /Use the handoff skill to resume this work/u);
});
