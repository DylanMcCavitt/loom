// Companion test for the end-to-end golden dry-run eval (FN-35).
//
// The eval command itself (scripts/validate-factory-nucleus-dry-run.mjs) is the
// source of truth and runs in `npm run check`; these tests prove it is wired,
// non-vacuous, and that the committed golden matches the live dry-run for BOTH
// tracker fixtures. Plan *behavior* is unit-tested in factory-nucleus-recipe.test.mjs.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  COVERAGE_CHECKS,
  DRY_RUN_FIXTURES,
  checkCoverage,
  dryRunFor,
  normalizePlan,
  runDryRunEval,
} from "../scripts/validate-factory-nucleus-dry-run.mjs";

const script = fileURLToPath(new URL("../scripts/validate-factory-nucleus-dry-run.mjs", import.meta.url));
const golden = JSON.parse(readFileSync(new URL("fixtures/dry-run-ghost-to-launch.golden.json", import.meta.url), "utf8"));

// Every element FN-35's acceptance criteria says the dry-run must cover.
const REQUIRED_ELEMENTS = [
  "ghost/readiness resolution",
  "radar preflight",
  "inserter stage",
  "roboports topology",
  "proof command",
  "launch policy",
  "saved plan / metadata",
  "roles/scopes/objectives",
  "no full prompts",
  "read/write scopes",
  "no implementation run / live smoke",
];

test("dry-run eval command passes for both tracker fixtures", () => {
  const result = spawnSync(process.execPath, [script], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /dry-run eval passed: \d+ checks across 2 tracker fixtures \(linear, github\); plan matches golden/u);
});

test("the coverage map covers every FN-35 acceptance element", () => {
  assert.deepEqual(COVERAGE_CHECKS.map((entry) => entry.element), REQUIRED_ELEMENTS);
});

test("both providers pass every coverage check on their dry-run", () => {
  for (const fixture of DRY_RUN_FIXTURES) {
    const context = dryRunFor(fixture);
    assert.equal(context.ghost.id, fixture.readyGhostId);
    const failures = checkCoverage(fixture.provider, context);
    assert.deepEqual(failures, [], failures.join("\n"));
  }
});

test("linear and github dry-runs normalize to the same committed golden plan", () => {
  const normalized = DRY_RUN_FIXTURES.map((fixture) => {
    const { ghost, plan } = dryRunFor(fixture);
    return normalizePlan(plan, { ghostId: ghost.id });
  });
  // Provider parity: same ready ghost shape -> identical canonical plan.
  assert.deepEqual(normalized[0], normalized[1]);
  // Golden regression: the canonical plan is exactly the checked-in fixture.
  for (const plan of normalized) assert.deepEqual(plan, golden);
});

test("the full eval reports no failures and matches the golden", () => {
  const { failures, providers, canonical } = runDryRunEval();
  assert.deepEqual(failures, [], failures.join("\n"));
  assert.equal(providers, 2);
  assert.deepEqual(canonical, golden);
});

test("the coverage map is non-vacuous: it flags a degraded dry-run", () => {
  // A real dry-run, then deliberately break each pillar and confirm it is caught.
  const good = dryRunFor(DRY_RUN_FIXTURES[0]);
  assert.deepEqual(checkCoverage("good", good), []);

  // launch policy: a launched plan must fail the launch-ready expectation.
  const launched = { ...good, plan: { ...good.plan, launchState: "launched" } };
  assert.ok(
    checkCoverage("bad", launched).some((failure) => failure.includes("launch policy")),
    "expected the launch-policy check to flag launchState=launched",
  );

  // no full prompts: a smuggled prompt body must fail.
  const stages = good.plan.stages.map((stage) =>
    stage.subagents ? { ...stage, subagents: stage.subagents.map((sub) => ({ ...sub, prompt: "you are..." })) } : stage,
  );
  const prompted = { ...good, plan: { ...good.plan, stages } };
  assert.ok(
    checkCoverage("bad", prompted).some((failure) => failure.includes("no full prompts")),
    "expected the no-full-prompts check to flag a prompt-bearing subagent",
  );

  // no implementation run: an extra durable action must fail.
  const executed = {
    ...good,
    plan: {
      ...good.plan,
      plannedActions: [...good.plan.plannedActions, { id: "merge", kind: "merge", target: "x", durable: true }],
    },
  };
  assert.ok(
    checkCoverage("bad", executed).some((failure) => failure.includes("no implementation run")),
    "expected the no-implementation-run check to flag an extra durable action",
  );
});
