import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import { validateCircuit } from "../scripts/factory-nucleus/schema.mjs";
import {
  EVAL_CASES,
  SHAPES,
  checkCase,
  runSchemaEvals,
} from "../scripts/validate-factory-nucleus-schemas.mjs";

const script = new URL("../scripts/validate-factory-nucleus-schemas.mjs", import.meta.url).pathname;

test("schema eval command passes for the checked-in fixtures", () => {
  const result = spawnSync(process.execPath, [script], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Factory Nucleus schema evals passed: \d+ cases across \d+ shapes/u);
});

test("every listed artifact shape has a valid and an invalid eval case", () => {
  for (const shape of SHAPES) {
    const cases = EVAL_CASES.filter((evalCase) => evalCase.shape === shape);
    assert.ok(cases.some((evalCase) => evalCase.expect === "valid"), `${shape} is missing a valid case`);
    assert.ok(cases.some((evalCase) => evalCase.expect === "invalid"), `${shape} is missing an invalid case`);
  }
  for (const evalCase of EVAL_CASES) {
    assert.ok(SHAPES.includes(evalCase.shape), `unexpected shape ${evalCase.shape}`);
  }
});

test("the full eval suite reports no failures", () => {
  const { checked, failures } = runSchemaEvals();
  assert.equal(failures.length, 0, failures.join("\n"));
  assert.equal(checked, EVAL_CASES.length);
});

test("the eval harness is non-vacuous: it catches a mis-expected case", () => {
  // An invalid artifact asserted as valid must be reported as a failure.
  const wrongExpectation = checkCase({
    shape: "circuit",
    label: "deliberately-mis-expected",
    expect: "valid",
    run: () => validateCircuit({}),
  });
  assert.ok(wrongExpectation, "checkCase should flag a valid expectation on invalid output");

  // An errorIncludes that never matches must also be reported as a failure.
  const wrongSubstring = checkCase({
    shape: "circuit",
    label: "wrong-substring",
    expect: "invalid",
    errorIncludes: "this substring never appears in any error",
    run: () => validateCircuit({}),
  });
  assert.ok(wrongSubstring, "checkCase should flag an errorIncludes that never matches");
});
