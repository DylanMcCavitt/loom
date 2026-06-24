import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { validateRecipePlan } from "../scripts/factory-nucleus/schema.mjs";
import { branchForGhost } from "../scripts/factory-nucleus/tracker.mjs";
import { createGithubTracker } from "../scripts/factory-nucleus/tracker-github.mjs";
import { createLinearTracker } from "../scripts/factory-nucleus/tracker-linear.mjs";
import {
  GHOST_TO_LAUNCH_STAGE_NAMES,
  planGhostToLaunch,
  planMain,
  renderPlanSummary,
} from "../scripts/factory-nucleus/recipe.mjs";

const generatedAt = "2026-06-23T00:00:00.000Z";

const linearFixtureUrl = new URL("fixtures/adapter-linear.json", import.meta.url);
const githubFixtureUrl = new URL("fixtures/adapter-github.json", import.meta.url);
const linearFixturePath = fileURLToPath(linearFixtureUrl);
const githubFixturePath = fileURLToPath(githubFixtureUrl);

function linearTracker() {
  return createLinearTracker(JSON.parse(readFileSync(linearFixtureUrl, "utf8")), { generatedAt });
}
function githubTracker() {
  return createGithubTracker(JSON.parse(readFileSync(githubFixtureUrl, "utf8")), { generatedAt });
}

function captureStdout(fn) {
  const original = process.stdout.write;
  let buffer = "";
  process.stdout.write = (chunk) => {
    buffer += chunk;
    return true;
  };
  try {
    fn();
  } finally {
    process.stdout.write = original;
  }
  return buffer;
}

test("a ready ghost produces a valid ghost-to-launch plan with all stages in order", () => {
  const tracker = linearTracker();
  const ghost = tracker.getGhost("LOO-2");
  const plan = planGhostToLaunch({ ghost, tracker, generatedAt });

  const check = validateRecipePlan(plan);
  assert.equal(check.ok, true, check.errors.join("\n"));
  assert.equal(plan.kind, "recipe-plan");
  assert.equal(plan.recipe, "ghost-to-launch");
  assert.equal(plan.mode, "plan");

  // All required stages are present, in order.
  assert.deepEqual(plan.stages.map((stage) => stage.name), GHOST_TO_LAUNCH_STAGE_NAMES);
  assert.deepEqual(GHOST_TO_LAUNCH_STAGE_NAMES, [
    "radar-preflight",
    "inserter-readiness",
    "roboports-implementation",
    "radar-drift-check",
    "proof-pass",
    "rocket-launch-eligibility",
    "radar-post-launch-sync",
  ]);
  assert.ok(plan.stages.every((stage) => stage.status === "planned"), "ready ghost -> every stage planned");

  // Every stage action resolves to a declared top-level planned action.
  const ids = new Set(plan.plannedActions.map((action) => action.id));
  for (const stage of plan.stages) {
    for (const id of stage.plannedActions) assert.ok(ids.has(id), `unresolved action ${id}`);
  }
});

test("the roboports stage carries the id-bridge branch and PR as the only durable actions", () => {
  const tracker = linearTracker();
  const ghost = tracker.getGhost("LOO-2");
  const plan = planGhostToLaunch({ ghost, tracker, generatedAt });

  const roboports = plan.stages.find((stage) => stage.name === "roboports-implementation");
  assert.deepEqual(roboports.plannedActions, ["branch", "pr"]);

  const branchAction = plan.plannedActions.find((action) => action.id === "branch");
  assert.equal(branchAction.kind, "branch");
  assert.equal(branchAction.durable, true);
  assert.equal(branchAction.target, branchForGhost({ ghostId: "LOO-2", title: "Tracker bind", branchPrefix: "factory" }));

  const prAction = plan.plannedActions.find((action) => action.id === "pr");
  assert.equal(prAction.kind, "pr");
  assert.equal(prAction.durable, true);
  assert.equal(prAction.target, "LOO-2");

  // Plan mode represents writes but executes none: branch + pr are the only durable actions.
  assert.deepEqual(plan.plannedActions.filter((action) => action.durable).map((action) => action.id), ["branch", "pr"]);
});

test("an optional blueprint adds a read-blueprint action to radar preflight", () => {
  const tracker = linearTracker();
  const ghost = tracker.getGhost("LOO-2");

  const withBlueprint = planGhostToLaunch({ ghost, tracker, blueprint: "spec-fn-18", generatedAt });
  assert.equal(validateRecipePlan(withBlueprint).ok, true);
  const preflight = withBlueprint.stages.find((stage) => stage.name === "radar-preflight");
  assert.ok(preflight.plannedActions.includes("read-blueprint"), preflight.plannedActions.join(", "));
  const blueprintAction = withBlueprint.plannedActions.find((action) => action.id === "read-blueprint");
  assert.deepEqual(blueprintAction, { id: "read-blueprint", kind: "read", target: "spec-fn-18", durable: false });

  // Without a blueprint, no read-blueprint action appears anywhere.
  const noBlueprint = planGhostToLaunch({ ghost, tracker, generatedAt });
  assert.ok(!noBlueprint.plannedActions.some((action) => action.id === "read-blueprint"));
  assert.ok(!noBlueprint.stages.some((stage) => stage.plannedActions.includes("read-blueprint")));
});

test("a non-ready ghost is refused by state", () => {
  const tracker = linearTracker();
  const inReview = tracker.getGhost("LOO-3");
  assert.equal(inReview.state, "in-review");
  assert.throws(() => planGhostToLaunch({ ghost: inReview, tracker, generatedAt }), /is not ready \(state: in-review\)/u);
});

test("a ready-state ghost with an undone dependency is refused by tracker readiness", () => {
  // RDY-1 is in a ready state but blocked by DEP-1, which is not done.
  const tracker = createLinearTracker({
    projects: [{ id: "PRJ", name: "Project" }],
    issues: [
      { id: "DEP-1", title: "Dependency", projectId: "PRJ", status: "Todo", statusType: "unstarted" },
      { id: "RDY-1", title: "Blocked ready", projectId: "PRJ", status: "Todo", statusType: "unstarted", blockedBy: ["DEP-1"] },
    ],
  }, { generatedAt });
  const ghost = tracker.getGhost("RDY-1");
  assert.equal(ghost.state, "ready");
  assert.throws(() => planGhostToLaunch({ ghost, tracker, generatedAt }), /is not ready: blocked by DEP-1 \(ready\)/u);
});

test("github and linear ready ghosts produce the same ordered plan (provider parity)", () => {
  const tracker = githubTracker();
  const ghost = tracker.getGhost("#2");
  const plan = planGhostToLaunch({ ghost, tracker, generatedAt });

  assert.equal(validateRecipePlan(plan).ok, true);
  assert.deepEqual(plan.stages.map((stage) => stage.name), GHOST_TO_LAUNCH_STAGE_NAMES);

  const branchAction = plan.plannedActions.find((action) => action.id === "branch");
  assert.equal(branchAction.target, branchForGhost({ ghostId: "#2", title: "Tracker bind", branchPrefix: "factory" }));
  const prAction = plan.plannedActions.find((action) => action.id === "pr");
  assert.equal(prAction.target, "#2");
});

test("renderPlanSummary lists ordered stages and marks durable actions as represented not executed", () => {
  const tracker = linearTracker();
  const ghost = tracker.getGhost("LOO-2");
  const plan = planGhostToLaunch({ ghost, tracker, generatedAt });

  const summary = renderPlanSummary(plan, { ghost });
  assert.match(summary, /Mode: plan \(no implementation writes; no target-repo writes\)/u);
  assert.match(summary, /Recipe: ghost-to-launch/u);
  for (const name of GHOST_TO_LAUNCH_STAGE_NAMES) assert.ok(summary.includes(name), name);
  assert.match(summary, /Durable actions \(represented, not executed\): branch, pr/u);
  assert.match(summary, /Remote APIs: none/u);
});

test("plan mode performs no implementation writes in the working directory", () => {
  const tmp = mkdtempSync(path.join(tmpdir(), "fn18-plan-"));
  const original = process.cwd();
  let code;
  const out = captureStdout(() => {
    process.chdir(tmp);
    try {
      code = planMain(["--provider", "linear", "--tracker", linearFixturePath, "--ghost", "LOO-2"]);
    } finally {
      process.chdir(original);
    }
  });
  try {
    assert.equal(code, 0);
    assert.deepEqual(readdirSync(tmp), [], "plan mode wrote files into the working directory");
    assert.match(out, /Recipe: ghost-to-launch/u);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("plan CLI validates its required flags and provider", () => {
  assert.throws(() => planMain([]), /requires --provider/u);
  assert.throws(() => planMain(["--provider", "linear", "--tracker", linearFixturePath]), /requires --ghost/u);
  assert.throws(() => planMain(["--provider", "jira", "--tracker", linearFixturePath, "--ghost", "LOO-2"]), /Unknown tracker provider/u);
  assert.throws(() => planMain(["--bogus"]), /Unknown option/u);
  assert.throws(() => planMain(["--provider", "linear", "--tracker", linearFixturePath, "--ghost", "LOO-404"]), /ghost not found/u);

  let helpCode;
  const help = captureStdout(() => {
    helpCode = planMain(["--help"]);
  });
  assert.equal(helpCode, 0);
  assert.match(help, /Usage: .*plan --provider/u);

  // The github fixture path also resolves through the CLI without writes.
  let githubCode;
  captureStdout(() => {
    githubCode = planMain(["--provider", "github", "--tracker", githubFixturePath, "--ghost", "#2"]);
  });
  assert.equal(githubCode, 0);
});
