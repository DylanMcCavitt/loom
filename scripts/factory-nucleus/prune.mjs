// Local factory state pruning for Factory Nucleus.
//
// Prunes the accumulating local-state artifacts (one file per ghost/run under
// `plans/` and `runs/`) down to a retention policy, while NEVER touching the
// durable envelope or the self-rotating `scan`/`radar` latest pointers, and
// NEVER reaching outside the local state root. `resolveFactoryStatePaths` keeps
// that root outside the target repo, so target-repo files are out of scope by
// construction. Transcript management is a separate, explicit concern: the
// `transcripts/` tree is left untouched.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { redactSecrets } from "./scan.mjs";
import { resolveFactoryStatePaths } from "./schema.mjs";

// Local-state kinds that accumulate one file per ghost/run and are eligible for
// retention pruning. `envelope`, `scan`, and `radar` are deliberately excluded:
// the envelope is durable policy and the scan/radar `latest.json` pointers are
// already single-latest (self-rotating).
const PRUNABLE_KINDS = Object.freeze(["plans", "runs"]);

function gitToplevel(root) {
  const result = spawnSync("git", ["-C", root, "rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function retainKey(name) {
  return name.replace(/\.json$/u, "");
}

// Prune accumulating local-state artifacts to a retention policy.
// - keep: number of most-recent artifacts retained per kind (>= 0). The single
//   most-recent artifact per kind is always retained (the "latest" guarantee),
//   even when keep is 0.
// - retain: artifact names (with or without the .json suffix) always retained,
//   regardless of age.
// Returns a report of state-relative paths: { root, retained, pruned }.
export function pruneFactoryState({
  homeDir = process.env.HOME || os.homedir(),
  root = process.cwd(),
  keep = 10,
  retain = [],
  generatedAt,
} = {}) {
  if (!Number.isInteger(keep) || keep < 0) throw new Error("keep must be a non-negative integer");
  const requestedRoot = path.resolve(root);
  const repoRoot = path.resolve(gitToplevel(requestedRoot) || requestedRoot);
  const state = resolveFactoryStatePaths({
    homeDir,
    targetRepoPath: repoRoot,
    factoryId: redactSecrets(path.basename(repoRoot)),
    generatedAt,
  });
  const retainSet = new Set(retain.map(retainKey));
  const keepCount = Math.max(keep, 1); // the latest is always retained
  const report = { root: state.root, retained: [], pruned: [] };

  for (const kind of PRUNABLE_KINDS) {
    const dir = state[kind];
    if (!existsSync(dir)) continue;
    const entries = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const file = path.join(dir, entry.name);
        return { name: entry.name, file, mtimeMs: statSync(file).mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs || a.name.localeCompare(b.name)); // newest first, name tiebreak
    entries.forEach((entry, index) => {
      const rel = path.relative(state.root, entry.file);
      if (index < keepCount || retainSet.has(retainKey(entry.name))) {
        report.retained.push(rel);
        return;
      }
      // Defensive: only ever delete inside the local state root.
      if (rel.startsWith("..") || path.isAbsolute(rel)) {
        throw new Error(`refusing to prune outside state root: ${entry.file}`);
      }
      rmSync(entry.file);
      report.pruned.push(rel);
    });
  }
  return report;
}
