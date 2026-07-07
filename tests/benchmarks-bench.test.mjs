import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { ROBO_PORTS_SCENARIOS, materialize, scoreRun } from "../scripts/bench.mjs";

const repoRoot = new URL("..", import.meta.url).pathname;
const benchScript = new URL("../scripts/bench.mjs", import.meta.url).pathname;

function makeTempRun() {
  return path.join(
    tmpdir(),
    `loom-bench-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    "run",
  );
}

function cleanupRun(runDir) {
  rmSync(path.dirname(runDir), { recursive: true, force: true });
}

test("bench --list enumerates the fixed roboports scenarios offline", () => {
  const result = spawnSync(process.execPath, [benchScript, "--list"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^roboports benchmark scenarios:/u);
  for (const scenario of ROBO_PORTS_SCENARIOS) {
    assert.match(result.stdout, new RegExp(`${scenario.id} ${scenario.name}`, "u"));
  }
  assert.equal(result.stdout.trim().split("\n").length, 1 + ROBO_PORTS_SCENARIOS.length);
});

test("bench materialize creates a throwaway repo with tasks, checks, and green anchors", () => {
  const runDir = makeTempRun();
  try {
    const result = spawnSync(process.execPath, [benchScript, "--materialize", runDir], {
      cwd: repoRoot,
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /materialized:/u);
    assert.match(result.stdout, /baseline commit: [0-9a-f]{40}/u);
    assert.ok(existsSync(path.join(runDir, ".git")));
    assert.ok(existsSync(path.join(runDir, "src", "inventory.js")));
    assert.ok(existsSync(path.join(runDir, ".bench", "baseline.txt")));
    assert.equal(readdirSync(path.join(runDir, ".bench", "tasks")).filter((file) => file.endsWith(".md")).length, 6);
    assert.equal(readdirSync(path.join(runDir, ".bench", "checks")).filter((file) => /^task-\d+\.mjs$/u.test(file)).length, 6);

    const baseline = readFileSync(path.join(runDir, ".bench", "baseline.txt"), "utf8").trim();
    const revParse = spawnSync("git", ["rev-parse", "HEAD"], { cwd: runDir, encoding: "utf8" });
    assert.equal(revParse.status, 0, revParse.stderr);
    assert.equal(revParse.stdout.trim(), baseline);
    const status = spawnSync("git", ["status", "--short"], { cwd: runDir, encoding: "utf8" });
    assert.equal(status.status, 0, status.stderr);
    assert.equal(status.stdout, "");

    const anchors = spawnSync("npm", ["test"], { cwd: runDir, encoding: "utf8" });
    assert.equal(anchors.status, 0, anchors.stderr);
  } finally {
    cleanupRun(runDir);
  }
});

test("bench scoring is deterministic for a materialized baseline run", () => {
  const runDir = makeTempRun();
  try {
    materialize(runDir);

    const first = scoreRun(runDir);
    const second = scoreRun(runDir);

    assert.deepEqual(second, first);
    assert.equal(first.benchmark, "roboports");
    assert.equal(first.anchors_passed, true);
    assert.equal(first.scenarios.length, 6);
    for (const scenario of first.scenarios) {
      assert.equal(scenario.correct, false, `${scenario.id} should be unfixed at baseline`);
      assert.equal(scenario.score.loc, 0);
      assert.equal(scenario.score.new_deps, 0);
      assert.equal(scenario.score.scope, 0);
      assert.deepEqual(scenario.score.files, []);
    }

    writeFileSync(path.join(runDir, "src", "inventory.js"), "\n// simulated task change\n", { flag: "a" });
    const add = spawnSync("git", ["add", "-A"], { cwd: runDir, encoding: "utf8" });
    assert.equal(add.status, 0, add.stderr);
    const commit = spawnSync(
      "git",
      [
        "-c",
        "user.name=bench",
        "-c",
        "user.email=bench@localhost",
        "commit",
        "--quiet",
        "--no-gpg-sign",
        "-m",
        "task: simulate add all",
      ],
      { cwd: runDir, encoding: "utf8" },
    );
    assert.equal(commit.status, 0, commit.stderr);

    const scored = spawnSync(
      process.execPath,
      [".bench/checks/score.mjs", "--task", "01", "--base", first.baseline],
      { cwd: runDir, encoding: "utf8" },
    );
    assert.equal(scored.status, 0, scored.stderr);
    const task01Score = JSON.parse(scored.stdout);
    assert.equal(task01Score.scope, 0);
    assert.deepEqual(task01Score.files, ["src/inventory.js"]);
  } finally {
    cleanupRun(runDir);
  }
});
