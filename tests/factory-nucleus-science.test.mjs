import assert from "node:assert/strict";
import { test } from "node:test";

import { SCIENCE_LEVELS, computeScienceLevel } from "../scripts/factory-nucleus/science.mjs";

// Cumulative evidence for each rung: each level adds its own unlocks on top of
// every lower rung's, so spreading the previous fixture and adding the next
// unlocks mirrors the ladder exactly.
const base = {};
const red = { ...base, stackDetected: true };
const green = { ...red, buildCommand: true, testCommand: true, lintCommand: true, ciWorkflow: true, cleanWorktree: true };
const blue = { ...green, envelope: true };
const purple = { ...blue, trackerBound: true };
const yellow = { ...purple, proofConfigured: true, ciGreen: true };
const space = { ...yellow, ownership: true, release: true };

test("science level is derived from evidence across the full ladder", () => {
  assert.deepEqual(SCIENCE_LEVELS, ["base", "red", "green", "blue", "purple", "yellow", "space"]);
  const matrix = [
    ["base", base],
    ["red", red],
    ["green", green],
    ["blue", blue],
    ["purple", purple],
    ["yellow", yellow],
    ["space", space],
  ];
  for (const [expected, evidence] of matrix) {
    const result = computeScienceLevel(evidence);
    assert.equal(result.level, expected, `expected ${expected}, got ${result.level}`);
    const expectedUnlocked = SCIENCE_LEVELS.slice(0, SCIENCE_LEVELS.indexOf(expected) + 1);
    assert.deepEqual(result.unlocked, expectedUnlocked);
  }
});

test("missing unlocks report what blocks the next rung", () => {
  const baseResult = computeScienceLevel(base);
  assert.ok(baseResult.missingUnlocks.includes("stack detection"), baseResult.missingUnlocks.join(", "));
  assert.equal(baseResult.missingUnlocks.includes("ownership"), true);

  const greenResult = computeScienceLevel(green);
  assert.equal(greenResult.level, "green");
  assert.ok(greenResult.missingUnlocks.includes("factory envelope"), greenResult.missingUnlocks.join(", "));
  assert.equal(greenResult.missingUnlocks.includes("ci workflow"), false, "met unlocks are not reported missing");

  const spaceResult = computeScienceLevel(space);
  assert.deepEqual(spaceResult.missingUnlocks, []);
});

test("a single missing unlock caps the level even when higher unlocks are present", () => {
  // Everything for blue+ is present, but the worktree is dirty, so green is unreachable and the level caps at red.
  const dirtyButOtherwiseAdvanced = { ...space, cleanWorktree: false };
  const result = computeScienceLevel(dirtyButOtherwiseAdvanced);
  assert.equal(result.level, "red");
  assert.deepEqual(result.unlocked, ["base", "red"]);
  assert.ok(result.missingUnlocks.includes("clean worktree"));
  assert.equal(result.missingUnlocks.includes("factory envelope"), false, "envelope is satisfied, just unreachable");
});

test("subagent count is not treated as a science level", () => {
  const withSubagents = { ...base, maxSubagents: 99, subagents: 99, agents: 99 };
  assert.equal(computeScienceLevel(withSubagents).level, "base");

  const spaceWithCap = { ...space, maxSubagents: 0 };
  assert.equal(computeScienceLevel(spaceWithCap).level, "space");
  assert.deepEqual(computeScienceLevel(spaceWithCap), computeScienceLevel(space));
});
