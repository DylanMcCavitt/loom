#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_ISSUE_PATTERN = "[a-z]+-\\d+";

function usage() {
  return [
    "Usage: node scripts/worktree-guard.mjs [--json] [--issue-pattern <regex>] [--cwd <path>]",
    "Checks that agent work is running in one linked worktree per issue branch.",
  ].join("\n");
}

function parseArgs(argv) {
  const options = { json: false, issuePattern: DEFAULT_ISSUE_PATTERN, cwd: process.cwd(), help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--issue-pattern") {
      const value = argv[index + 1];
      if (!value) throw new Error("--issue-pattern requires a regex value");
      options.issuePattern = value;
      index += 1;
    } else if (arg.startsWith("--issue-pattern=")) {
      options.issuePattern = arg.slice("--issue-pattern=".length);
    } else if (arg === "--cwd") {
      const value = argv[index + 1];
      if (!value) throw new Error("--cwd requires a path value");
      options.cwd = value;
      index += 1;
    } else if (arg.startsWith("--cwd=")) {
      options.cwd = arg.slice("--cwd=".length);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function runGit(cwd, args) {
  return spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function requireGit(cwd, args) {
  const result = runGit(cwd, args);
  if (result.status !== 0) {
    const detail = `${result.stderr}${result.stdout}`.trim();
    throw new Error(detail || `git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

function normalizePath(value) {
  const absolute = path.resolve(value);
  if (!existsSync(absolute)) return absolute;
  return realpathSync.native(absolute);
}

function displayPath(value) {
  const normalized = normalizePath(value);
  const home = normalizePath(os.homedir());
  if (normalized === home) return "~";
  if (normalized.startsWith(`${home}${path.sep}`)) return `~${normalized.slice(home.length)}`;
  return normalized;
}

function shortBranch(ref) {
  return ref?.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref || null;
}

function parseWorktreeList(output) {
  const entries = [];
  let current = null;
  function pushCurrent() {
    if (current) entries.push(current);
    current = null;
  }

  for (const line of output.split("\n")) {
    if (line === "") {
      pushCurrent();
      continue;
    }
    const space = line.indexOf(" ");
    const key = space === -1 ? line : line.slice(0, space);
    const value = space === -1 ? "" : line.slice(space + 1);
    if (key === "worktree") {
      pushCurrent();
      current = { path: value, normalizedPath: normalizePath(value), branch: null, head: null, detached: false };
    } else if (current && key === "branch") {
      current.branch = shortBranch(value);
    } else if (current && key === "HEAD") {
      current.head = value;
    } else if (current && key === "detached") {
      current.detached = true;
    }
  }
  pushCurrent();
  return entries;
}

function existingBranch(cwd, name) {
  return runGit(cwd, ["show-ref", "--verify", "--quiet", `refs/heads/${name}`]).status === 0;
}

function defaultBranch(cwd, primary) {
  const originHead = runGit(cwd, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
  if (originHead.status === 0) return originHead.stdout.trim().replace(/^origin\//u, "");
  for (const candidate of ["main", "master"]) {
    if (existingBranch(cwd, candidate)) return candidate;
  }
  return primary?.branch || "main";
}

function primaryStatus(primaryPath) {
  const status = runGit(primaryPath, ["status", "--porcelain", "--untracked-files=all"]);
  if (status.status !== 0) {
    const detail = `${status.stderr}${status.stdout}`.trim();
    throw new Error(detail || "git status failed for the primary checkout");
  }
  return status.stdout.trim().split("\n").filter(Boolean);
}

function groupBranches(entries) {
  const branches = new Map();
  for (const entry of entries) {
    if (!entry.branch) continue;
    const paths = branches.get(entry.branch) || [];
    paths.push(entry.path);
    branches.set(entry.branch, paths);
  }
  return branches;
}

function violation(code, message, details = {}) {
  return { ok: false, code, message, details, warnings: [] };
}

export function inspectWorktree(options = {}) {
  const cwd = normalizePath(options.cwd || process.cwd());
  const issuePatternSource = options.issuePattern || DEFAULT_ISSUE_PATTERN;
  let issuePattern;
  try {
    issuePattern = new RegExp(issuePatternSource, "iu");
  } catch (error) {
    throw new Error(`Invalid --issue-pattern regex: ${error.message}`);
  }

  const gitDir = requireGit(cwd, ["rev-parse", "--path-format=absolute", "--git-dir"]);
  const gitCommonDir = requireGit(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const topLevel = normalizePath(requireGit(cwd, ["rev-parse", "--show-toplevel"]));
  const entries = parseWorktreeList(requireGit(cwd, ["worktree", "list", "--porcelain"]));
  if (entries.length === 0) throw new Error("git worktree list returned no worktrees");

  const primary = entries[0];
  const linked = entries.slice(1);
  const current = entries.find((entry) => entry.normalizedPath === topLevel) || null;
  const branchResult = runGit(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  const currentBranch = branchResult.status === 0 ? branchResult.stdout.trim() : current?.branch || null;
  const defaultName = defaultBranch(cwd, primary);
  const isPrimary = primary.normalizedPath === topLevel;

  if (isPrimary && currentBranch && currentBranch !== defaultName) {
    return violation(
      "primary-non-default",
      `primary checkout is on non-default branch "${currentBranch}" (default "${defaultName}"). Agents belong in linked worktrees; create one with git worktree add <path> -b <issue-branch> origin/${defaultName} and run the guard there.`,
      { cwd, branch: currentBranch, defaultBranch: defaultName, primary: primary.path },
    );
  }

  const dirtyPrimaryPaths = linked.length > 0 ? primaryStatus(primary.path) : [];
  if (dirtyPrimaryPaths.length > 0) {
    return violation(
      "primary-dirty-with-linked-worktree",
      `primary checkout "${displayPath(primary.path)}" has ${dirtyPrimaryPaths.length} dirty path(s) while ${linked.length} linked worktree(s) exist. Clean, commit, or move primary-checkout changes before agent work continues.`,
      { primary: primary.path, linkedWorktrees: linked.map((entry) => entry.path), dirtyPaths: dirtyPrimaryPaths },
    );
  }

  for (const [branch, paths] of groupBranches(entries)) {
    if (paths.length > 1) {
      return violation(
        "duplicate-branch-worktrees",
        `branch "${branch}" is checked out in multiple worktrees: ${paths.map(displayPath).join(", ")}. Keep one issue branch in one worktree; remove duplicate worktree(s) or switch one checkout to a different branch.`,
        { branch, paths },
      );
    }
  }

  const warnings = [];
  if (!isPrimary && !currentBranch) {
    warnings.push(`current worktree "${displayPath(topLevel)}" is detached; no branch was available to match issue pattern /${issuePatternSource}/iu.`);
  } else if (!isPrimary && !issuePattern.test(currentBranch)) {
    warnings.push(`branch "${currentBranch}" does not match issue pattern /${issuePatternSource}/iu; continuing because this guard only warns on missing issue ids.`);
  }

  return {
    ok: true,
    code: "ok",
    message: isPrimary
      ? `worktree guard ok: primary checkout "${displayPath(primary.path)}" is on default branch "${defaultName}" with no dirty primary conflict.`
      : `worktree guard ok: linked worktree "${displayPath(topLevel)}" is on branch "${currentBranch || "(detached)"}".`,
    details: {
      cwd,
      gitDir,
      gitCommonDir,
      primary: primary.path,
      currentWorktree: topLevel,
      branch: currentBranch,
      defaultBranch: defaultName,
      linkedWorktrees: linked.map((entry) => entry.path),
    },
    warnings,
  };
}

function printResult(result, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (result.ok) {
    process.stdout.write(`${result.message}\n`);
    for (const warning of result.warnings) process.stderr.write(`worktree-guard warning: ${warning}\n`);
  } else {
    process.stderr.write(`worktree-guard violation: ${result.message}\n`);
  }
}

export function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
    if (options.help) {
      process.stdout.write(`${usage()}\n`);
      return 0;
    }
    const result = inspectWorktree(options);
    printResult(result, options.json);
    return result.ok ? 0 : 1;
  } catch (error) {
    const json = options?.json || argv.includes("--json");
    const result = { ok: false, code: "guard-error", message: error.message, details: {}, warnings: [] };
    if (json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      process.stderr.write(`worktree-guard error: ${error.message}\n`);
      process.stderr.write(`${usage()}\n`);
    }
    return 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main();
}
