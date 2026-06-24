// CLI --json output contract for structured Factory Nucleus commands (FN-41).
//
// Every structured command (scan, init-envelope, bind-tracker, plan, radar)
// supports --json: stdout is a single parseable artifact carrying required
// metadata (schemaVersion/kind/generatedAt) and NOTHING else -- no human-readable
// prose mixed in. Default (no --json) mode stays human-readable and is NOT JSON.
// This is FN-41's "CLI tests parse JSON for each command mode" proof.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  validateArtifactMetadata,
  validateRadarCheck,
  validateRecipePlan,
} from "../scripts/factory-nucleus/schema.mjs";

const factory = fileURLToPath(new URL("../scripts/factory-nucleus/factory.mjs", import.meta.url));
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

// A throwaway HOME so init-envelope/bind-tracker write their local state into a
// temp dir, never the real ~/.loom. Read-only commands tolerate it too.
function freshHome() {
  return mkdtempSync(path.join(os.tmpdir(), "loo74-json-"));
}

function run(args, { home = freshHome() } = {}) {
  return spawnSync(process.execPath, [factory, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, HOME: home },
  });
}

// Assert stdout is exactly one JSON document with required artifact metadata and
// no prose banner mixed in (proves "JSON mode is not mixed with prose").
function assertPureJson(result, { banner }) {
  assert.equal(result.status, 0, result.stderr);
  let parsed;
  assert.doesNotThrow(() => { parsed = JSON.parse(result.stdout); }, `stdout must be parseable JSON:\n${result.stdout}`);
  assert.equal(typeof parsed.schemaVersion, "number");
  assert.equal(typeof parsed.kind, "string");
  assert.equal(typeof parsed.generatedAt, "string");
  assert.ok(!Number.isNaN(Date.parse(parsed.generatedAt)), "generatedAt must be a date-time");
  assert.ok(!result.stdout.includes(banner), `JSON stdout must not include prose banner "${banner}"`);
  return parsed;
}

const PLAN_ARGS = ["plan", "--provider", "linear", "--tracker", "tests/fixtures/adapter-linear.json", "--ghost", "LOO-2", "--no-save"];

test("scan --json emits one parseable factory-scan artifact, no prose", () => {
  const parsed = assertPureJson(run(["scan", "--json"]), { banner: "Factory scan" });
  assert.equal(parsed.kind, "factory-scan");
  assert.equal(validateArtifactMetadata(parsed, "factory-scan").ok, true);
});

test("init-envelope --json emits one parseable envelope artifact, no prose", () => {
  const parsed = assertPureJson(run(["init-envelope", "--json"]), { banner: "Factory envelope" });
  assert.equal(parsed.kind, "envelope");
  assert.equal(validateArtifactMetadata(parsed, "envelope").ok, true);
});

test("bind-tracker --json emits the bound envelope artifact, no prose", () => {
  const home = freshHome();
  assert.equal(run(["init-envelope"], { home }).status, 0);
  const parsed = assertPureJson(
    run(["bind-tracker", "--provider", "github", "--repo", "DylanMcCavitt/loom", "--json"], { home }),
    { banner: "Factory tracker bind" },
  );
  assert.equal(parsed.kind, "envelope");
  assert.equal(parsed.tracker.provider, "github");
  assert.equal(validateArtifactMetadata(parsed, "envelope").ok, true);
});

test("plan --json emits a schema-valid recipe-plan; the save note stays on stderr", () => {
  const result = run([...PLAN_ARGS, "--json"]);
  const parsed = assertPureJson(result, { banner: "Factory recipe plan" });
  assert.equal(parsed.kind, "recipe-plan");
  assert.equal(validateRecipePlan(parsed).ok, true);
  assert.ok(!result.stdout.includes("Local state"), "save note must not pollute JSON stdout");
  assert.ok(result.stderr.includes("Local state"), "save note belongs on stderr");
});

test("radar --json emits a schema-valid radar-check with the computed drift class", () => {
  const parsed = assertPureJson(
    run(["radar", "--material", "LOO-1", "--evidence", "scan@HEAD", "--json"]),
    { banner: "Factory radar check" },
  );
  assert.equal(parsed.kind, "radar-check");
  assert.equal(parsed.driftClass, "material");
  assert.equal(validateRadarCheck(parsed).ok, true);
});

test("default (no --json) mode stays human-readable and is not JSON", () => {
  const cases = [
    { args: ["scan"], banner: "Factory scan" },
    { args: ["init-envelope"], banner: "Factory envelope" },
    { args: PLAN_ARGS, banner: "Factory recipe plan" },
    { args: ["radar", "--material", "LOO-1"], banner: "Factory radar check" },
  ];
  for (const { args, banner } of cases) {
    const result = run(args);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes(banner), `prose mode should print "${banner}"`);
    assert.throws(() => JSON.parse(result.stdout), `prose mode for "${args[0]}" must not be valid JSON`);
  }
});
