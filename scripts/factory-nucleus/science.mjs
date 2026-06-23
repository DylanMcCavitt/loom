// Diagnostic science level for a factory.
//
// Science is OBSERVED from evidence, never declared. The ladder follows the
// Factorio science packs: base -> red -> green -> blue -> purple -> yellow ->
// space. Each rung needs its own unlocks plus every lower rung's, so a single
// missing unlock caps the level. Evidence is a flat bag of booleans gathered
// from scan, envelope, tracker, proof/CI, ownership, and release sources; a
// caller passes whatever it can observe and unobserved unlocks read as missing.
// Subagent caps are deliberately not evidence: capacity is not maturity.

export const SCIENCE_LEVELS = Object.freeze(["base", "red", "green", "blue", "purple", "yellow", "space"]);

// Ordered unlock -> human label. The order is the order missing unlocks report in.
const UNLOCKS = Object.freeze([
  ["stackDetected", "stack detection"],
  ["buildCommand", "build command"],
  ["testCommand", "test command"],
  ["lintCommand", "lint command"],
  ["ciWorkflow", "ci workflow"],
  ["cleanWorktree", "clean worktree"],
  ["envelope", "factory envelope"],
  ["trackerBound", "tracker bind"],
  ["proofConfigured", "proof commands"],
  ["ciGreen", "ci green"],
  ["ownership", "ownership"],
  ["release", "release"],
]);

// Each rung lists only the NEW unlocks it adds on top of the rungs below it.
const SCIENCE_LADDER = Object.freeze([
  { level: "red", requires: ["stackDetected"] },
  { level: "green", requires: ["buildCommand", "testCommand", "lintCommand", "ciWorkflow", "cleanWorktree"] },
  { level: "blue", requires: ["envelope"] },
  { level: "purple", requires: ["trackerBound"] },
  { level: "yellow", requires: ["proofConfigured", "ciGreen"] },
  { level: "space", requires: ["ownership", "release"] },
]);

export function computeScienceLevel(evidence = {}) {
  const has = (key) => evidence[key] === true;
  let level = "base";
  const unlocked = ["base"];
  let capped = false;
  for (const rung of SCIENCE_LADDER) {
    if (!capped && rung.requires.every(has)) {
      level = rung.level;
      unlocked.push(rung.level);
    } else {
      capped = true;
    }
  }
  const missingUnlocks = UNLOCKS.filter(([key]) => !has(key)).map(([, label]) => label);
  return { level, unlocked, missingUnlocks };
}
