#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { withArtifactMetadata } from "./schema.mjs";

const USAGE = "Usage: node scripts/factory-nucleus/scan.mjs [--root <path>]";
const COMMAND_KINDS = Object.freeze(["build", "test", "lint"]);
const SECRET_ASSIGNMENT_PATTERN = /\b(api[_-]?key|token|secret|password|credential|private[_-]?key)\b\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{12,}["']?/giu;
const SECRET_VALUE_PATTERNS = Object.freeze([
  /(^|[^A-Za-z0-9])(gh[pousr]_[A-Za-z0-9_]{12,})/gu,
  /(^|[^A-Za-z0-9])(github_pat_[A-Za-z0-9_]{12,})/gu,
  /(^|[^A-Za-z0-9])(sk-[A-Za-z0-9_-]{12,})/gu,
  /(^|[^A-Za-z0-9])(AKIA[0-9A-Z]{8,})/gu,
]);

const PROTECTED_SURFACES = Object.freeze([
  {
    path: ".github/workflows",
    name: "GitHub Actions workflows",
    suggestion: "route CI changes through proof and launch review",
  },
  {
    path: ".agents/skills",
    name: "Agent skills",
    suggestion: "pair skill changes with routing/eval proof",
  },
  {
    path: ".agents/envelope",
    name: "Factory envelope",
    suggestion: "keep durable policy separate from scan observations",
  },
  {
    path: ".loom.yml",
    name: "Factory pointer",
    suggestion: "treat pointer changes as explicit setup intent",
  },
  {
    path: "docs/decisions",
    name: "Architecture decisions",
    suggestion: "route ADR changes through maintainer review",
  },
  {
    path: "package.json",
    name: "Package command contract",
    suggestion: "proof command changes affect agent verification",
  },
]);

function git(root, args) {
  return spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function gitOutput(root, args) {
  const result = git(root, args);
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function readArgs(argv) {
  const options = { root: process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg !== "--root") {
      throw new Error(`Unknown option: ${arg}`);
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      throw new Error("--root requires a value");
    }
    options.root = next;
    index += 1;
  }
  return options;
}

function safeJsonFile(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function hasPath(root, relativePath) {
  return existsSync(path.join(root, relativePath));
}

function listEvidence(root, candidates) {
  return candidates.filter((candidate) => hasPath(root, candidate));
}

function detectPackageManager(root) {
  if (hasPath(root, "pnpm-lock.yaml")) return "pnpm";
  if (hasPath(root, "yarn.lock")) return "yarn";
  if (hasPath(root, "bun.lockb") || hasPath(root, "bun.lock")) return "bun";
  if (hasPath(root, "package-lock.json")) return "npm";
  if (hasPath(root, "package.json")) return "npm";
  return null;
}

function detectStack(root, packageJson) {
  const stack = [];
  if (packageJson) {
    stack.push({ name: "node", evidence: ["package.json"], packageManager: detectPackageManager(root) });
  }
  const otherStacks = [
    { name: "python", evidence: listEvidence(root, ["pyproject.toml", "requirements.txt", "setup.py"]) },
    { name: "rust", evidence: listEvidence(root, ["Cargo.toml"]) },
    { name: "go", evidence: listEvidence(root, ["go.mod"]) },
    { name: "ruby", evidence: listEvidence(root, ["Gemfile"]) },
  ];
  for (const candidate of otherStacks) {
    if (candidate.evidence.length > 0) stack.push(candidate);
  }
  return stack.length > 0 ? stack : [{ name: "unknown", evidence: [] }];
}

function npmCommandFor(kind) {
  if (kind === "test") return "npm test";
  return `npm run ${kind}`;
}

function makefileHasTarget(root, target) {
  const makefile = ["Makefile", "makefile"].find((candidate) => hasPath(root, candidate));
  if (!makefile) return false;
  const text = readFileSync(path.join(root, makefile), "utf8");
  return new RegExp(`^${target}:`, "mu").test(text);
}

function discoverCommands(root, packageJson) {
  const scripts = packageJson && typeof packageJson.scripts === "object" && packageJson.scripts
    ? packageJson.scripts
    : {};
  return Object.fromEntries(COMMAND_KINDS.map((kind) => {
    if (typeof scripts[kind] === "string" && scripts[kind].trim()) {
      return [kind, { status: "found", command: npmCommandFor(kind), source: "package.json" }];
    }
    if (makefileHasTarget(root, kind)) {
      return [kind, { status: "found", command: `make ${kind}`, source: "Makefile" }];
    }
    return [kind, { status: "absent", command: null, source: null }];
  }));
}

function currentBranch(root) {
  const branch = gitOutput(root, ["branch", "--show-current"]);
  if (branch) return branch;
  const sha = gitOutput(root, ["rev-parse", "--short", "HEAD"]);
  return sha ? `detached:${sha}` : "unknown";
}

function defaultBranch(root, fallbackBranch) {
  const remoteHead = gitOutput(root, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
  if (remoteHead?.startsWith("origin/")) return remoteHead.slice("origin/".length);
  if (hasPath(root, ".github/workflows") && fallbackBranch !== "unknown") return fallbackBranch;
  return fallbackBranch || "unknown";
}

function dirtyState(root) {
  const status = gitOutput(root, ["status", "--short", "--untracked-files=all"]);
  const entries = status ? status.split("\n").filter(Boolean) : [];
  return {
    isDirty: entries.length > 0,
    count: entries.length,
    entries: entries.slice(0, 20).map((entry) => ({
      status: entry.slice(0, 2).trim() || "?",
      path: redactSecrets(entry.slice(3).trim()),
    })),
  };
}

function detectProtectedSurfaces(root) {
  return PROTECTED_SURFACES
    .filter((surface) => hasPath(root, surface.path))
    .map((surface) => ({ ...surface }));
}

function directoryHasFiles(root, relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!existsSync(fullPath)) return false;
  const stat = statSync(fullPath);
  if (!stat.isDirectory()) return true;
  return readdirSync(fullPath).length > 0;
}

function computeScience({ stack, commands, dirty, protectedSurfaces, root }) {
  const missingUnlocks = [];
  if (stack.every((entry) => entry.name === "unknown")) missingUnlocks.push("stack detection");
  for (const kind of COMMAND_KINDS) {
    if (commands[kind].status === "absent") missingUnlocks.push(`${kind} command`);
  }
  if (!directoryHasFiles(root, ".github/workflows")) missingUnlocks.push("ci workflow");
  if (!directoryHasFiles(root, ".agents/envelope") && !hasPath(root, ".loom.yml")) missingUnlocks.push("factory envelope");
  if (!directoryHasFiles(root, ".agents/envelope")) missingUnlocks.push("tracker bind");
  if (dirty.isDirty) missingUnlocks.push("clean worktree");

  let level = "pre-automation";
  if (stack.some((entry) => entry.name !== "unknown")) level = "automation";
  if (
    COMMAND_KINDS.every((kind) => commands[kind].status === "found")
    && protectedSurfaces.some((surface) => surface.path === ".github/workflows")
    && !dirty.isDirty
  ) {
    level = "logistic";
  }
  if (level === "logistic" && directoryHasFiles(root, ".agents/envelope")) level = "chemical";

  return { level, missingUnlocks };
}

export function redactSecrets(value) {
  let text = String(value);
  text = text.replace(SECRET_ASSIGNMENT_PATTERN, (_, key) => `${key}=[REDACTED]`);
  for (const pattern of SECRET_VALUE_PATTERNS) {
    text = text.replace(pattern, (_, prefix) => `${prefix}[REDACTED]`);
  }
  return text;
}

export function scanFactory({ root = process.cwd(), generatedAt } = {}) {
  const requestedRoot = path.resolve(root);
  const repoRoot = path.resolve(gitOutput(requestedRoot, ["rev-parse", "--show-toplevel"]) || requestedRoot);
  const packageJson = safeJsonFile(path.join(repoRoot, "package.json"));
  const stack = detectStack(repoRoot, packageJson);
  const commands = discoverCommands(repoRoot, packageJson);
  const branch = currentBranch(repoRoot);
  const dirty = dirtyState(repoRoot);
  const protectedSurfaces = detectProtectedSurfaces(repoRoot);
  const science = computeScience({ stack, commands, dirty, protectedSurfaces, root: repoRoot });

  return withArtifactMetadata("factory-scan", {
    mode: "zero-footprint",
    target: {
      name: path.basename(repoRoot),
    },
    git: {
      currentBranch: branch,
      defaultBranch: defaultBranch(repoRoot, branch),
      dirty,
    },
    stack,
    commands,
    protectedSurfaces,
    science,
    localState: {
      writes: false,
    },
    remoteApis: {
      called: false,
    },
  }, generatedAt);
}

function formatCommand(command) {
  if (command.status === "absent") return "absent";
  return `${command.command} (${command.source})`;
}

export function formatScanSummary(scan) {
  const stack = scan.stack
    .map((entry) => (entry.packageManager ? `${entry.name}/${entry.packageManager}` : entry.name))
    .join(", ");
  const protectedSurfaceLines = scan.protectedSurfaces.length > 0
    ? scan.protectedSurfaces.map((surface) => `  - ${surface.path}: ${surface.suggestion}`)
    : ["  - none detected"];
  const missingUnlockLines = scan.science.missingUnlocks.length > 0
    ? scan.science.missingUnlocks.map((unlock) => `  - ${unlock}`)
    : ["  - none"];

  return redactSecrets([
    "Factory scan",
    "Mode: zero-footprint (no target-repo or local-state writes)",
    "Remote APIs: none",
    `Repo: ${scan.target.name}`,
    `Branch: ${scan.git.currentBranch} (default: ${scan.git.defaultBranch})`,
    `Dirty state: ${scan.git.dirty.isDirty ? `dirty (${scan.git.dirty.count} paths)` : "clean"}`,
    `Stack: ${stack}`,
    "Commands:",
    `  build: ${formatCommand(scan.commands.build)}`,
    `  test: ${formatCommand(scan.commands.test)}`,
    `  lint: ${formatCommand(scan.commands.lint)}`,
    "Protected surface suggestions:",
    ...protectedSurfaceLines,
    `Science level: ${scan.science.level}`,
    "Missing unlocks:",
    ...missingUnlockLines,
    "",
  ].join("\n"));
}

export function main(argv = process.argv.slice(2)) {
  const options = readArgs(argv);
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  const scan = scanFactory({ root: options.root });
  process.stdout.write(formatScanSummary(scan));
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
