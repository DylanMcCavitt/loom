import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const skill = readFileSync(new URL("../nucleus/skills/thread-control/SKILL.md", import.meta.url), "utf8");

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
    "Duplicate subagents",
    "Subagent findings",
    "Issue/branch mismatch",
    "Stale file assumptions",
    "Side-conversation boundary",
  ]) {
    assert.match(skill, new RegExp(signal, "u"));
  }
});

test("thread-control emits a visible next-thread starter", () => {
  assert.match(skill, /## Next-thread starter/u);
  assert.match(skill, /Use the handoff skill to resume this work/u);
});

test("thread-control names overlapping subagent scope risk", () => {
  assert.match(skill, /Subagent cleanup note/u);
  assert.match(skill, /If two agents were given overlapping scopes/u);
  assert.match(skill, /collapsing future review into one reviewer or splitting lenses/u);
});
