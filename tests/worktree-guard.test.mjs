import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const guardScript = path.join(repoRoot, "scripts", "worktree-guard.mjs");

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  assert.equal(result.status, 0, `${command} ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result;
}

function git(cwd, args) {
  return run("git", args, cwd);
}

function commitAll(repo, message = "fixture") {
  git(repo, ["add", "."]);
  git(repo, ["-c", "user.email=fixture@example.invalid", "-c", "user.name=Fixture", "commit", "-q", "-m", message]);
}

function withRepo(callback) {
  const root = mkdtempSync(path.join(tmpdir(), "worktree-guard-"));
  const repo = path.join(root, "repo");
  mkdirSync(repo);
  try {
    git(repo, ["init", "-q", "-b", "main"]);
    writeFileSync(path.join(repo, "README.md"), "fixture\n");
    commitAll(repo, "initial fixture");
    return callback({ root, repo });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runGuard(cwd, args = []) {
  return spawnSync(process.execPath, [guardScript, ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

test("fails in the primary checkout when HEAD is on a non-default branch", () => {
  withRepo(({ repo }) => {
    git(repo, ["checkout", "-q", "-b", "loo-214-primary"]);

    const result = runGuard(repo);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /worktree-guard violation: primary checkout is on non-default branch "loo-214-primary"/u);
    assert.match(result.stderr, /Agents belong in linked worktrees/u);
  });
});

test("fails when the primary checkout is dirty while a linked worktree exists", () => {
  withRepo(({ root, repo }) => {
    const linked = path.join(root, "linked-loo-214");
    git(repo, ["worktree", "add", "-q", "-b", "loo-214-linked", linked, "main"]);
    writeFileSync(path.join(repo, "dirty.txt"), "primary change\n");

    const result = runGuard(linked);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /worktree-guard violation: primary checkout ".*" has 1 dirty path\(s\) while 1 linked worktree\(s\) exist/u);
    assert.match(result.stderr, /Clean, commit, or move primary-checkout changes/u);
  });
});

test("fails when the same branch is checked out in more than one worktree", () => {
  withRepo(({ root, repo }) => {
    git(repo, ["branch", "loo-214-duplicate"]);
    const first = path.join(root, "linked-one");
    const second = path.join(root, "linked-two");
    git(repo, ["worktree", "add", "-q", first, "loo-214-duplicate"]);
    git(repo, ["worktree", "add", "--force", "-q", second, "loo-214-duplicate"]);

    const result = runGuard(first);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /worktree-guard violation: branch "loo-214-duplicate" is checked out in multiple worktrees/u);
    assert.match(result.stderr, /Keep one issue branch in one worktree/u);
  });
});

test("passes inside a linked worktree whose branch carries an issue id", () => {
  withRepo(({ root, repo }) => {
    const linked = path.join(root, "linked-green");
    git(repo, ["worktree", "add", "-q", "-b", "loo-214-green", linked, "main"]);

    const result = runGuard(linked);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /worktree guard ok: linked worktree/u);
    assert.match(result.stdout, /loo-214-green/u);
    assert.equal(result.stderr, "");
  });
});

test("warns but passes when the linked branch does not match the issue pattern", () => {
  withRepo(({ root, repo }) => {
    const linked = path.join(root, "linked-warning");
    git(repo, ["worktree", "add", "-q", "-b", "feature-no-ticket", linked, "main"]);

    const result = runGuard(linked);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /worktree-guard warning: branch "feature-no-ticket" does not match issue pattern/u);
  });
});

test("emits machine-readable json with the distinct violation code", () => {
  withRepo(({ repo }) => {
    git(repo, ["checkout", "-q", "-b", "loo-214-json"]);

    const result = runGuard(repo, ["--json"]);

    assert.equal(result.status, 1);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.code, "primary-non-default");
    assert.match(payload.message, /primary checkout is on non-default branch/u);
    assert.equal(result.stderr, "");
  });
});
