import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { resourceManifestPath } from "../scripts/lib/layout.mjs";

const manifestPath = new URL(`../${resourceManifestPath}`, import.meta.url).pathname;
const validator = new URL("../scripts/validate-harness-manifest.mjs", import.meta.url).pathname;
const dryRun = new URL("../scripts/dry-run-harness-inventory.mjs", import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

function runNode(script, args = []) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
}

test("harness manifest validator accepts the checked-in manifest", () => {
  const result = runNode(validator);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Harness manifest validation passed: \d+ resources checked/u);
});

test("manifest covers required harness resource categories", () => {
  const byId = new Map(manifest.resources.map((resource) => [resource.id, resource]));
  for (const id of [
    "omp-built-in-runtime-resources",
    "omp-user-project-resources",
    "codex-config-profiles",
    "codex-agents-skills",
    "claude-agents-skills-settings",
    "duplicate-skill-roots"
  ]) {
    assert.ok(byId.has(id), `${id} missing`);
  }
});

test("runtime-only categories are explicitly local-only", () => {
  const runtimeResources = manifest.resources.filter((resource) => (
    /runtime|auth\/cache|plugin cache|private history|database|blobs|terminal/u.test(resource.resourceCategory)
  ));
  assert.ok(runtimeResources.length >= 3, "expected runtime resources for multiple harnesses");
  for (const resource of runtimeResources) {
    assert.equal(resource.disposition, "local-only", `${resource.id} should be local-only`);
    assert.equal(resource.intendedRepoTarget, "none", `${resource.id} should not target repo files`);
  }
});

test("repo-prefixed current paths exist in this checkout", () => {
  for (const resource of manifest.resources) {
    for (const livePath of resource.currentLivePath) {
      if (!livePath.startsWith("repo:")) continue;
      assert.ok(
        existsSync(path.resolve(livePath.slice("repo:".length))),
        `${resource.id} references missing repo currentLivePath ${livePath}`,
      );
    }
  }
});

test("manifest does not contain secret-looking values or absolute private home paths", () => {
  const text = readFileSync(manifestPath, "utf8");
  assert.doesNotMatch(text, /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/u);
  assert.doesNotMatch(text, /\bgithub_pat_[A-Za-z0-9_]{20,}\b/u);
  assert.doesNotMatch(text, /\bsk-[A-Za-z0-9_-]{20,}\b/u);
  assert.doesNotMatch(text, /\b(?:api[_-]?key|token|secret|password)\b\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{16,}["']?/iu);
  assert.doesNotMatch(text, /\/Users\/[^/\s"]+/u);
});

test("dry-run inventory prints planned classifications without mutation", () => {
  const result = runNode(dryRun);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Harness resource inventory dry run/u);
  assert.match(result.stdout, /Mutation: disabled/u);
  assert.match(result.stdout, /\[local-only\]/u);
  assert.match(result.stdout, /codex-runtime-state/u);
});
