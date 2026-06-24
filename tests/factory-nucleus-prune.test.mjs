import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { pruneFactoryState } from "../scripts/factory-nucleus/prune.mjs";
import { resolveFactoryStatePaths } from "../scripts/factory-nucleus/schema.mjs";

// Resolve the same local-state root pruneFactoryState will compute for `root`
// (no git: gitToplevel returns null, so the factory id is the repo basename).
function stateFor(homeDir, root) {
  return resolveFactoryStatePaths({ homeDir, targetRepoPath: root, factoryId: path.basename(root) });
}

// Seed accumulating artifacts with explicit, increasing mtimes so "newest" is
// deterministic. `files` maps kind -> { name: mtimeSeconds }.
function seed(state, files) {
  for (const [kind, entries] of Object.entries(files)) {
    mkdirSync(state[kind], { recursive: true });
    for (const [name, mtime] of Object.entries(entries)) {
      const file = path.join(state[kind], name);
      writeFileSync(file, "{}\n");
      utimesSync(file, mtime, mtime);
    }
  }
}

function names(dir) {
  return existsSync(dir) ? readdirSync(dir).sort() : [];
}

function withTemp(callback) {
  const root = mkdtempSync(path.join(tmpdir(), "factory-prune-repo-"));
  const home = mkdtempSync(path.join(tmpdir(), "factory-prune-home-"));
  try {
    callback({ root, home });
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
}

test("prune keeps the newest `keep` artifacts plus explicitly retained, deletes the rest", () => {
  withTemp(({ root, home }) => {
    const state = stateFor(home, root);
    seed(state, {
      plans: { "p1.json": 1000, "p2.json": 2000, "p3.json": 3000, "p4.json": 4000, "p5.json": 5000 },
      runs: { "r1.json": 1000, "r2.json": 2000 },
    });

    const report = pruneFactoryState({ homeDir: home, root, keep: 2, retain: ["p1"] });

    // Newest 2 (p5,p4) + retained p1 survive; p2,p3 are pruned.
    assert.deepEqual(names(state.plans), ["p1.json", "p4.json", "p5.json"]);
    // Both runs fit within keep=2.
    assert.deepEqual(names(state.runs), ["r1.json", "r2.json"]);
    assert.deepEqual(report.pruned.sort(), [path.join("plans", "p2.json"), path.join("plans", "p3.json")]);
    assert.ok(report.retained.includes(path.join("plans", "p1.json")));
  });
});

test("prune always preserves the single latest even at keep=0", () => {
  withTemp(({ root, home }) => {
    const state = stateFor(home, root);
    seed(state, { plans: { "old.json": 1000, "new.json": 2000 } });

    pruneFactoryState({ homeDir: home, root, keep: 0 });

    assert.deepEqual(names(state.plans), ["new.json"]);
  });
});

test("prune never deletes the envelope, scan/radar latest, or target-repo files", () => {
  withTemp(({ root, home }) => {
    const state = stateFor(home, root);
    seed(state, { plans: { "p1.json": 1000, "p2.json": 2000 } });

    // Durable policy + self-rotating latest pointers that must survive.
    for (const file of [state.envelope, state.scan, state.radar]) {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, "{}\n");
    }
    // A target-repo file that must never be touched.
    const repoFile = path.join(root, "important.txt");
    writeFileSync(repoFile, "keep me\n");

    pruneFactoryState({ homeDir: home, root, keep: 1 });

    // Only the older plan is pruned.
    assert.deepEqual(names(state.plans), ["p2.json"]);
    assert.ok(existsSync(state.envelope), "envelope preserved");
    assert.ok(existsSync(state.scan), "scan latest preserved");
    assert.ok(existsSync(state.radar), "radar latest preserved");
    assert.equal(existsSync(repoFile), true, "target-repo file untouched");

    // The real safety net: a state root that would land inside the repo is refused.
    assert.throws(
      () => pruneFactoryState({ homeDir: path.join(root, "nested"), root, keep: 1 }),
      /outside the target repo/u,
    );
  });
});

test("prune matches explicit retain by name with or without the .json suffix", () => {
  withTemp(({ root, home }) => {
    const state = stateFor(home, root);
    seed(state, { plans: { "a.json": 1000, "b.json": 2000, "c.json": 3000 } });

    // keep=1 keeps newest (c); retain keeps a (via ".json") and b (via bare name).
    pruneFactoryState({ homeDir: home, root, keep: 1, retain: ["a.json", "b"] });

    assert.deepEqual(names(state.plans), ["a.json", "b.json", "c.json"]);
  });
});

test("prune rejects a negative or non-integer keep", () => {
  withTemp(({ root, home }) => {
    assert.throws(() => pruneFactoryState({ homeDir: home, root, keep: -1 }), /non-negative integer/u);
    assert.throws(() => pruneFactoryState({ homeDir: home, root, keep: 1.5 }), /non-negative integer/u);
  });
});

test("prune is a no-op when there is nothing to prune", () => {
  withTemp(({ root, home }) => {
    const state = stateFor(home, root);
    seed(state, { plans: { "only.json": 1000 } });

    const report = pruneFactoryState({ homeDir: home, root, keep: 5 });

    assert.deepEqual(report.pruned, []);
    assert.deepEqual(names(state.plans), ["only.json"]);
  });
});
