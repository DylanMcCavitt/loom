import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { PROOF_CIRCUIT, validateRecipePlan } from "../scripts/factory-nucleus/schema.mjs";
import { branchForGhost } from "../scripts/factory-nucleus/tracker.mjs";
import { createGithubTracker } from "../scripts/factory-nucleus/tracker-github.mjs";
import { createLinearTracker } from "../scripts/factory-nucleus/tracker-linear.mjs";
import {
  assessWriteScopes,
  GHOST_TO_LAUNCH_STAGE_NAMES,
  permitsAutonomousMerge,
  permitsGithubWrites,
  planGhostToLaunch,
  planMain,
  renderPlanSummary,
  resolveStageWriteScopes,
  savePlan,
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

function walkFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(full));
    else files.push(full);
  }
  return files;
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

test("ghost-to-launch plan stops at launch-ready without implying a merge", () => {
  const tracker = linearTracker();
  const ghost = tracker.getGhost("LOO-2");
  const plan = planGhostToLaunch({ ghost, tracker, generatedAt });

  assert.equal(plan.launchState, "launch-ready");
  assert.ok(plan.plannedActions.filter((a) => a.durable).every((a) => a.id === "branch" || a.id === "pr"), "only branch/pr are durable; no merge write");
  assert.ok(!plan.plannedActions.some((a) => a.id === "merge"), "no action with id merge");
  assert.ok(!plan.plannedActions.some((a) => a.id === "launched"), "no action with id launched");
  assert.equal(validateRecipePlan(plan).ok, true);
});

test("ghost-to-launch plan includes a proof circuit and a standalone proof-pass stage", () => {
  const tracker = linearTracker();
  const ghost = tracker.getGhost("LOO-2");
  const plan = planGhostToLaunch({ ghost, tracker, generatedAt });

  assert.ok(
    plan.stages.some((stage) => Array.isArray(stage.circuits) && stage.circuits.includes(PROOF_CIRCUIT)),
    "plan has a stage carrying the proof circuit",
  );
  assert.ok(plan.stages.some((stage) => stage.name === "proof-pass"), "plan has a standalone proof-pass stage");
  assert.equal(validateRecipePlan(plan).ok, true, validateRecipePlan(plan).errors.join("\n"));
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

test("plan decomposes the roboports stage into bounded subagents with no prompt bodies", () => {
  const tracker = linearTracker();
  const ghost = tracker.getGhost("LOO-2");
  const plan = planGhostToLaunch({ ghost, tracker, generatedAt });

  const roboports = plan.stages.find((stage) => stage.name === "roboports-implementation");
  assert.ok(Array.isArray(roboports.subagents) && roboports.subagents.length >= 2, "roboports stage carries bounded non-trivial decomposition");
  for (const sub of roboports.subagents) {
    assert.equal(typeof sub.role, "string");
    assert.ok(sub.role.length > 0, "subagent role is non-empty");
    assert.equal(typeof sub.objective, "string");
    assert.ok(sub.objective.length > 0, "subagent objective is non-empty");
    assert.ok(Array.isArray(sub.scope) && sub.scope.length > 0, "subagent scope is a non-empty array");
  }

  const proofPass = plan.stages.find((stage) => stage.name === "proof-pass");
  assert.ok(Array.isArray(proofPass.subagents) && proofPass.subagents.length >= 1, "proof-pass stage carries at least one subagent");

  // No subagent anywhere in the plan exposes a full prompt body.
  const allSubagents = plan.stages.flatMap((stage) => stage.subagents ?? []);
  for (const sub of allSubagents) {
    assert.ok(!("prompt" in sub) && !("body" in sub), "subagent carries role/scope/objective only, no prompt body");
  }

  const check = validateRecipePlan(plan);
  assert.equal(check.ok, true, check.errors.join("\n"));
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

test("plan --no-save skips local state and writes nothing to the working directory", () => {
  const tmp = mkdtempSync(path.join(tmpdir(), "fn18-plan-"));
  const original = process.cwd();
  let code;
  const out = captureStdout(() => {
    process.chdir(tmp);
    try {
      code = planMain(["--provider", "linear", "--tracker", linearFixturePath, "--ghost", "LOO-2", "--no-save"]);
    } finally {
      process.chdir(original);
    }
  });
  try {
    assert.equal(code, 0);
    assert.deepEqual(readdirSync(tmp), [], "plan mode wrote files into the working directory");
    assert.match(out, /Recipe: ghost-to-launch/u);
    assert.match(out, /Local state: not saved \(--no-save\)/u);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("savePlan writes the recipe-plan under local factory state, outside the target repo", () => {
  const home = mkdtempSync(path.join(tmpdir(), "fn19-home-"));
  const repo = mkdtempSync(path.join(tmpdir(), "fn19-repo-"));
  try {
    const tracker = linearTracker();
    const plan = planGhostToLaunch({ ghost: tracker.getGhost("LOO-2"), tracker, generatedAt });
    const { path: planFile } = savePlan(plan, { homeDir: home, root: repo, ghostId: "LOO-2", generatedAt });

    assert.ok(existsSync(planFile), "saved plan file should exist");
    assert.equal(path.basename(planFile), "loo-2.json");
    assert.ok(planFile.startsWith(path.resolve(home)), "plan saved under the home factory state");
    assert.deepEqual(readdirSync(repo), [], "savePlan wrote nothing into the target repo");

    const saved = JSON.parse(readFileSync(planFile, "utf8"));
    assert.equal(saved.kind, "recipe-plan");
    assert.equal(saved.schemaVersion, plan.schemaVersion);
    assert.equal(saved.generatedAt, generatedAt);
    assert.equal(validateRecipePlan(saved).ok, true, validateRecipePlan(saved).errors.join("\n"));
    assert.deepEqual(saved.stages.map((stage) => stage.name), GHOST_TO_LAUNCH_STAGE_NAMES);
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

test("plan CLI saves the plan by default and still prints the summary", () => {
  const home = mkdtempSync(path.join(tmpdir(), "fn19-cli-home-"));
  const repo = mkdtempSync(path.join(tmpdir(), "fn19-cli-repo-"));
  const originalHome = process.env.HOME;
  const originalCwd = process.cwd();
  let code;
  const out = captureStdout(() => {
    process.env.HOME = home;
    process.chdir(repo);
    try {
      code = planMain(["--provider", "linear", "--tracker", linearFixturePath, "--ghost", "LOO-2"]);
    } finally {
      process.chdir(originalCwd);
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
    }
  });
  try {
    assert.equal(code, 0);
    assert.deepEqual(readdirSync(repo), [], "default save wrote nothing into the target repo");
    assert.match(out, /Recipe: ghost-to-launch/u);
    assert.match(out, /Local state: plan saved/u);
    const saved = walkFiles(home).filter((file) => file.endsWith(`${path.sep}plans${path.sep}loo-2.json`));
    assert.equal(saved.length, 1, `expected one saved plan under home, got ${saved.length}`);
    assert.equal(JSON.parse(readFileSync(saved[0], "utf8")).kind, "recipe-plan");
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
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
  assert.match(help, /Usage: .*plan --provider.*--no-save/u);

  // The github fixture path also resolves through the CLI without writes.
  let githubCode;
  captureStdout(() => {
    githubCode = planMain(["--provider", "github", "--tracker", githubFixturePath, "--ghost", "#2", "--no-save"]);
  });
  assert.equal(githubCode, 0);
});

test("default plan keeps disjoint write scopes (no escalation)", () => {
  const tracker = linearTracker();
  const ghost = tracker.getGhost("LOO-2");
  const plan = planGhostToLaunch({ ghost, tracker, generatedAt });

  assert.ok(plan.stages.every((stage) => stage.status === "planned"), "disjoint writes -> every stage planned");
  for (const stage of plan.stages) {
    assert.ok(!(stage.writeConflicts?.length), `stage ${stage.name} has no write conflicts`);
  }

  const roboports = plan.stages.find((stage) => stage.name === "roboports-implementation");
  const implementer = roboports.subagents.find((sub) => sub.role === "implementer");
  assert.deepEqual(implementer.writes, ["src"]);
  assert.deepEqual(implementer.reads, ["acceptance-criteria"]);
  const testAuthor = roboports.subagents.find((sub) => sub.role === "test-author");
  assert.deepEqual(testAuthor.writes, ["tests"]);
});

test("overlapping write scopes escalate the stage (negative fixture)", () => {
  const stage = {
    name: "x",
    status: "planned",
    circuits: ["c"],
    plannedActions: ["a"],
    subagents: [
      { role: "one", scope: ["s"], objective: "o", writes: ["src"] },
      { role: "two", scope: ["s"], objective: "o", writes: ["src"] },
    ],
  };
  const resolved = resolveStageWriteScopes(stage);
  assert.equal(resolved.status, "escalated");
  assert.ok(resolved.writeConflicts.includes("src"));
});

test("assessWriteScopes flags only multi-writer scopes", () => {
  assert.deepEqual(assessWriteScopes([{ writes: ["src"] }, { writes: ["src", "tests"] }]), ["src"]);
  assert.deepEqual(assessWriteScopes([{ writes: ["src"] }, { writes: ["tests"] }]), []);
  assert.deepEqual(assessWriteScopes([{ writes: ["src", "src"] }]), []);
});

test("renderPlanSummary surfaces write conflicts", () => {
  const tracker = linearTracker();
  const ghost = tracker.getGhost("LOO-2");
  const plan = planGhostToLaunch({ ghost, tracker, generatedAt });

  const conflicted = resolveStageWriteScopes({
    name: "roboports-implementation",
    status: "planned",
    circuits: ["branch-isolated"],
    plannedActions: ["branch"],
    subagents: [
      { role: "one", scope: ["s"], objective: "o", writes: ["src"] },
      { role: "two", scope: ["s"], objective: "o", writes: ["src"] },
    ],
  });
  plan.stages = plan.stages.map((stage) => (stage.name === "roboports-implementation" ? conflicted : stage));

  const summary = renderPlanSummary(plan, { ghost });
  assert.match(summary, /write-conflicts: src/u);
});

test("permitsGithubWrites reads the branch circuit", () => {
  assert.equal(permitsGithubWrites(undefined), true);
  assert.equal(permitsGithubWrites({}), true);
  assert.equal(permitsGithubWrites({ circuits: [{ gate: "branch", outcome: "allow" }] }), true);
  assert.equal(permitsGithubWrites({ circuits: [{ gate: "branch", outcome: "block" }] }), false);
  assert.equal(permitsGithubWrites({ circuits: [{ gate: "branch", outcome: "escalate" }] }), false);
  // The merge gate governs merge, not PR writes, so it never blocks GitHub writes here.
  assert.equal(permitsGithubWrites({ circuits: [{ gate: "merge", outcome: "block" }] }), true);
});

test("an allowing envelope keeps the branch/PR durable actions", () => {
  const plan = planGhostToLaunch({
    ghost: linearTracker().getGhost("LOO-2"),
    tracker: linearTracker(),
    generatedAt,
    envelope: { circuits: [{ name: "writes-ok", gate: "branch", outcome: "allow" }] },
  });

  const roboports = plan.stages.find((stage) => stage.name === "roboports-implementation");
  assert.deepEqual(roboports.plannedActions, ["branch", "pr"]);
  assert.equal(roboports.status, "planned");
  assert.equal(validateRecipePlan(plan).ok, true);
});

test("a blocking envelope drops PR writes and escalates, leaving merge separate", () => {
  const plan = planGhostToLaunch({
    ghost: linearTracker().getGhost("LOO-2"),
    tracker: linearTracker(),
    generatedAt,
    envelope: { circuits: [{ name: "no-writes", gate: "branch", outcome: "block" }] },
  });

  const roboports = plan.stages.find((stage) => stage.name === "roboports-implementation");
  assert.deepEqual(roboports.plannedActions, ["request-writes"]);
  assert.equal(roboports.status, "escalated");

  // No branch/PR write survives in the top-level planned actions.
  assert.ok(!plan.plannedActions.some((action) => action.id === "pr"));
  assert.ok(!plan.plannedActions.some((action) => action.id === "branch"));

  // Merge planning is untouched: its stage and check-merge action remain.
  const eligibility = plan.stages.find((stage) => stage.name === "rocket-launch-eligibility");
  assert.ok(eligibility, "rocket-launch-eligibility stage still exists");
  assert.ok(eligibility.plannedActions.includes("check-merge"));

  assert.equal(validateRecipePlan(plan).ok, true);
});

test("no envelope keeps the default branch/PR actions", () => {
  const plan = planGhostToLaunch({
    ghost: linearTracker().getGhost("LOO-2"),
    tracker: linearTracker(),
    generatedAt,
  });

  const roboports = plan.stages.find((stage) => stage.name === "roboports-implementation");
  assert.deepEqual(roboports.plannedActions, ["branch", "pr"]);
});

test("permitsAutonomousMerge requires explicit permission and all quality gates", () => {
  assert.equal(
    permitsAutonomousMerge({ envelope: { delivery: { autoMerge: true } }, ciGreen: true, radarClean: true, proofProven: true }),
    true,
  );

  // Missing permission denies, with or without an envelope.
  assert.equal(
    permitsAutonomousMerge({ envelope: { delivery: { autoMerge: false } }, ciGreen: true, radarClean: true, proofProven: true }),
    false,
  );
  assert.equal(permitsAutonomousMerge({ ciGreen: true, radarClean: true, proofProven: true }), false);

  // Any failing quality gate denies, even with explicit permission.
  assert.equal(
    permitsAutonomousMerge({ envelope: { delivery: { autoMerge: true } }, ciGreen: false, radarClean: true, proofProven: true }),
    false,
  );
  assert.equal(
    permitsAutonomousMerge({ envelope: { delivery: { autoMerge: true } }, ciGreen: true, radarClean: false, proofProven: true }),
    false,
  );
  assert.equal(
    permitsAutonomousMerge({ envelope: { delivery: { autoMerge: true } }, ciGreen: true, radarClean: true, proofProven: false }),
    false,
  );

  // No args at all denies (never enabled by default).
  assert.equal(permitsAutonomousMerge(), false);

  // Truthy-but-not-true signals must NOT arm the safety-critical merge gate.
  assert.equal(
    permitsAutonomousMerge({ envelope: { delivery: { autoMerge: true } }, ciGreen: 1, radarClean: "yes", proofProven: {} }),
    false,
  );
});

test("autonomous merge is not enabled by default (plan stops at launch-ready)", () => {
  const plan = planGhostToLaunch({ ghost: linearTracker().getGhost("LOO-2"), tracker: linearTracker(), generatedAt });

  assert.equal(plan.launchState, "launch-ready");
  assert.equal(validateRecipePlan(plan).ok, true);
});

test("explicit permission + green CI + clean radar + proven proof launches", () => {
  const plan = planGhostToLaunch({
    ghost: linearTracker().getGhost("LOO-2"),
    tracker: linearTracker(),
    generatedAt,
    envelope: { delivery: { autoMerge: true } },
    launch: { ciGreen: true, radarClean: true, proofProven: true },
  });

  assert.equal(plan.launchState, "launched");
  assert.equal(validateRecipePlan(plan).ok, true);
});

test("a failing quality gate keeps the plan at launch-ready", () => {
  const plan = planGhostToLaunch({
    ghost: linearTracker().getGhost("LOO-2"),
    tracker: linearTracker(),
    generatedAt,
    envelope: { delivery: { autoMerge: true } },
    launch: { ciGreen: true, radarClean: true, proofProven: false },
  });

  assert.equal(plan.launchState, "launch-ready");
  assert.equal(validateRecipePlan(plan).ok, true);
});
