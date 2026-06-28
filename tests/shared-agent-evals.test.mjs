import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import {
  ACCEPTANCE_GROUPS,
  FIXTURES,
  checkFixture,
  runSharedAgentEvals,
} from "../scripts/validate-shared-agent-evals.mjs";

const script = new URL("../scripts/validate-shared-agent-evals.mjs", import.meta.url).pathname;
const contract = JSON.parse(readFileSync(new URL("../docs/harness/shared-nucleus-agents.json", import.meta.url), "utf8"));

test("shared agent eval command passes for checked-in fixtures", () => {
  const result = spawnSync(process.execPath, [script], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Shared agent evals passed: \d+ fixtures across \d+ acceptance groups/u);
});

test("fixtures cover every shared-agent acceptance group", () => {
  for (const group of ACCEPTANCE_GROUPS) {
    assert.ok(FIXTURES.some((fixture) => fixture.group === group), `${group} is missing a fixture`);
  }
});

test("retrieval failures are separate from rule-application failures", () => {
  const retrieval = FIXTURES.find((fixture) => fixture.id === "missing-repair-reference-retrieval");
  const application = FIXTURES.find((fixture) => fixture.id === "rule-loaded-but-violated-forbidden-action");

  assert.equal(checkFixture(retrieval).kind, "retrieval");
  assert.equal(checkFixture(application).kind, "application");
});

test("judge and holdout fixtures are non-vacuous", () => {
  assert.ok(FIXTURES.some((fixture) => fixture.holdout), "expected at least one holdout fixture");

  const { checked, failures } = runSharedAgentEvals();
  assert.equal(failures.length, 0, failures.join("\n"));
  assert.equal(checked, FIXTURES.length);

  const wrongExpectation = checkFixture({
    ...FIXTURES.find((fixture) => fixture.id === "cross-harness-portability"),
    expect: "pass",
    errorIncludes: undefined,
  });
  assert.equal(wrongExpectation.ok, false, "judge should catch a harness-prefixed or superseded canonical name");
});

test("holdout expected edits are not copied into guidance", () => {
  for (const fixture of FIXTURES.filter((candidate) => candidate.holdout)) {
    assert.ok(fixture.expectedEdit, `${fixture.id} must define the hidden expected edit`);
    assert.ok(fixture.guidanceExcerpt, `${fixture.id} must define guidance`);
    assert.equal(
      fixture.guidanceExcerpt.includes(fixture.expectedEdit),
      false,
      `${fixture.id} copies the expected edit into guidance`,
    );
  }
});

test("evidence intake eval rejects missing packets, judge automation, and mismatched destinations", () => {
  const fixture = FIXTURES.find((candidate) => candidate.id === "evidence-intake-decision-log");

  const missingPacket = structuredClone(fixture);
  delete missingPacket.candidate.evidenceIntake;
  assert.match(checkFixture(missingPacket).message, /evidence intake packet missing/u);

  const judgeAutomation = structuredClone(fixture);
  judgeAutomation.candidate.evidenceIntake.judge.actions = ["apply changes"];
  assert.match(checkFixture(judgeAutomation).message, /judge performed forbidden action/u);

  const wrongDestination = structuredClone(fixture);
  wrongDestination.candidate.evidenceIntake.humanReview.choice = "rule";
  wrongDestination.candidate.evidenceIntake.humanReview.destination = "coverageGap";
  assert.match(checkFixture(wrongDestination).message, /human review destination mismatch/u);
});

test("eval groups align with the checked-in shared nucleus contract", () => {
  assert.ok(contract.automationPolicy.evals.includes("trigger loading"));
  assert.ok(contract.automationPolicy.evals.includes("rule application"));
  assert.ok(contract.automationPolicy.evals.some((entry) => /holdout/u.test(entry)));
  assert.equal(contract.delegationPolicy.maxDepth, 3);
  assert.deepEqual(contract.repairPack.delegation.allowedChildren, ["lab"]);
});
