import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const benchmark = new URL("../scripts/automation-workflow-benchmark.mjs", import.meta.url).pathname;

test("automation workflow benchmark hard checks pass and metrics are finite", () => {
  const result = spawnSync(process.execPath, [benchmark], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const output = result.stdout.trim().split("\n");
  assert.ok(output.includes("CHECK duplicate_skill_overlap_count=0 ok"));
  assert.ok(output.includes("CHECK unsafe_autonomy_violations=0 ok"));
  assert.ok(output.includes("CHECK new_thread_reuses_handoff_skill=1 ok"));

  const metrics = new Map();
  for (const line of output) {
    const match = line.match(/^METRIC ([a-z_]+)=([0-9.]+)$/u);
    if (match) metrics.set(match[1], Number(match[2]));
  }

  for (const metric of [
    "automation_workflow_friction",
    "automation_command_count",
    "route_accuracy_score",
    "duplicate_skill_overlap_count",
    "context_visibility_score",
    "new_thread_reuses_handoff_skill",
    "unsafe_autonomy_violations",
    "spawn_recipe_count",
    "commands_to_start_issue",
    "commands_to_safe_handoff",
  ]) {
    assert.ok(metrics.has(metric), `${metric} missing`);
    assert.ok(Number.isFinite(metrics.get(metric)), `${metric} is not finite`);
  }

  assert.equal(metrics.get("duplicate_skill_overlap_count"), 0);
  assert.equal(metrics.get("unsafe_autonomy_violations"), 0);
  assert.equal(metrics.get("new_thread_reuses_handoff_skill"), 1);
});
