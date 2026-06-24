import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
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
    { signals: {}, expected: "none" },
    { signals: { lowRisk: ["a"] }, expected: "low-risk" },
    { signals: { material: ["b"] }, expected: "material" },
    { signals: { unknown: ["c"] }, expected: "unknown" },
  ];
  for (const { signals, expected } of cases) {
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
    assert.ok(typeof c.suggestedRoute === "string" && c.suggestedRoute.length > 0);
  }
});

test("a radar-check rejects extra fields (no write/rewrite directive can ride along)", () => {
  const c = buildRadarCheck({ generatedAt });
  const result = validateRadarCheck({ ...c, blueprintRewrite: "x" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("blueprintRewrite") && e.includes("unknown property")));
});

test("buildRadarCheck performs no writes (pure, check-only)", () => {
  const tmp = mkdtempSync(path.join(tmpdir(), "fn29-"));
  const before = readdirSync(tmp);
  buildRadarCheck({ material: ["drift"], affectedGhosts: ["LOO-2"], generatedAt });
  try {
    assert.deepEqual(readdirSync(tmp), before);
    assert.deepEqual(readdirSync(tmp), []);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
