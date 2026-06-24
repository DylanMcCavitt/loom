import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { DRIFT_CLASSES, validateRadarCheck } from "../scripts/factory-nucleus/schema.mjs";
import { buildRadarCheck, classifyDrift } from "../scripts/factory-nucleus/radar.mjs";

const generatedAt = "2026-06-23T00:00:00.000Z";

test("classifyDrift maps signals to a drift class with unknown>material>low-risk>none precedence", () => {
  assert.equal(classifyDrift(), "none");
  assert.equal(classifyDrift({ lowRisk: ["x"] }), "low-risk");
  assert.equal(classifyDrift({ material: ["y"] }), "material");
  assert.equal(classifyDrift({ unknown: ["z"] }), "unknown");
  assert.equal(classifyDrift({ material: ["m"], unknown: ["u"] }), "unknown");
  assert.equal(classifyDrift({ lowRisk: ["l"], material: ["m"] }), "material");
});

test("DRIFT_CLASSES lists the four classes", () => {
  assert.deepEqual([...DRIFT_CLASSES].sort(), ["low-risk", "material", "none", "unknown"]);
});

test("buildRadarCheck emits a valid radar-check artifact for each drift class", () => {
  const cases = [
    { signals: {}, expected: "none", route: "rocket-launch" },
    { signals: { lowRisk: ["a"] }, expected: "low-risk", route: "proof-pass" },
    { signals: { material: ["b"] }, expected: "material", route: "roboports" },
    { signals: { unknown: ["c"] }, expected: "unknown", route: "inserter" },
  ];
  for (const { signals, expected, route } of cases) {
    const c = buildRadarCheck({
      ...signals,
      affectedGhosts: ["LOO-1"],
      suggestedSyncActions: ["resync"],
      evidence: ["scan@HEAD"],
      generatedAt,
    });
    assert.equal(validateRadarCheck(c).ok, true);
    assert.equal(c.kind, "radar-check");
    assert.equal(c.driftClass, expected);
    assert.ok(Array.isArray(c.affectedGhosts));
    assert.ok(Array.isArray(c.suggestedSyncActions));
    assert.ok(Array.isArray(c.evidence));
    assert.equal(c.suggestedRoute, route);
  }
});

test("a radar-check rejects extra fields (no write/rewrite directive can ride along)", () => {
  const c = buildRadarCheck({ generatedAt });
  const result = validateRadarCheck({ ...c, blueprintRewrite: "x" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("blueprintRewrite") && e.includes("unknown property")));
});

test("radar.mjs is structurally pure: no filesystem or child_process access", () => {
  const source = readFileSync(new URL("../scripts/factory-nucleus/radar.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /node:fs/u, "radar must not import node:fs");
  assert.doesNotMatch(source, /node:child_process/u, "radar must not import node:child_process");
});
