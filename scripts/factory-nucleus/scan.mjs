#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveFactoryStatePaths, withArtifactMetadata } from "./schema.mjs";

const USAGE = "Usage: node scripts/factory-nucleus/scan.mjs [--root <path>] [--save] [--content-scan]";
const COMMAND_KINDS = Object.freeze(["build", "test", "lint"]);
const CONTENT_SCAN_IGNORES = new Set([".git", ".github", ".agents", "node_modules", "dist", "build", "coverage", ".loom"]);
const CONTENT_SCAN_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".toml",
  ".txt",
  ".env",
]);
const SECRET_ASSIGNMENT_PATTERN = /\b(api[_-]?key|token|secret|password|credential|private[_-]?key)\b\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{12,}["']?/giu;
const SECRET_VALUE_PATTERNS = Object.freeze([
  /(^|[^A-Za-z0-9])(gh[pousr]_[A-Za-z0-9_]{12,})/gu,
  /(^|[^A-Za-z0-9])(github_pat_[A-Za-z0-9_]{12,})/gu,
  /(^|[^A-Za-z0-9])(sk-[A-Za-z0-9_-]{12,})/gu,
  /(^|[^A-Za-z0-9])(AKIA[0-9A-Z]{8,})/gu,
]);
const POINTER_IDENTITY_KEYS = new Set(["factory", "factoryId", "id"]);


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
  const options = { root: process.cwd(), save: false, content: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--save") {
      options.save = true;
      continue;
    }
    if (arg === "--content-scan") {
      options.content = true;
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

function isInsidePath(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}
function isPointerIdentity(value) {
  return /^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(value);
}

function parsePointerValue(rawValue) {
  const value = rawValue?.trim() ?? "";
  if (!value) return "";
  const first = value.at(0);
  if (first === "\"" || first === "'") {
    return value.at(-1) === first && value.length > 1 ? value.slice(1, -1) : null;
  }
  return value.endsWith("\"") || value.endsWith("'") ? null : value;
}

function parsePointerEntry(line) {
  const match = line.trim().match(/^(?:"([A-Za-z][A-Za-z0-9_-]*)"|'([A-Za-z][A-Za-z0-9_-]*)'|([A-Za-z][A-Za-z0-9_-]*)):(?:\s*(.*))?$/u);
  if (!match) return null;
  const value = parsePointerValue(match[4]);
  if (value === null) return null;
  return { key: match[1] ?? match[2] ?? match[3], value };
}

function hasIndentedContent(lines, startIndex) {
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (line === line.trimStart()) return false;
    return true;
  }
  return false;
}

function hasLeadingIndentedContent(lines) {
  let sawTopLevel = false;
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (line === line.trimStart()) {
      sawTopLevel = true;
      continue;
    }
    if (!sawTopLevel) return true;
  }
  return false;
}

function pointerBlockIdentityKeys(lines) {
  const keys = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trim().startsWith("#") || line !== line.trimStart()) continue;
    const entry = parsePointerEntry(line);
    if (!entry || !POINTER_IDENTITY_KEYS.has(entry.key)) continue;
    if (hasIndentedContent(lines, index)) keys.push(entry.key);
  }
  return keys;
}


function discoverPointer(root) {
  const pointerPath = path.join(root, ".loom.yml");
  let stat;
  try {
    stat = lstatSync(pointerPath);
  } catch (error) {
    if (error?.code === "ENOENT") return { present: false };
    return { present: true, status: "unreadable" };
  }
  if (!stat.isFile()) return { present: true, status: "unreadable" };
  let text;
  try {
    const realRoot = realpathSync(root);
    const realPointer = realpathSync(pointerPath);
    if (!isInsidePath(realRoot, realPointer)) return { present: true, status: "unreadable" };
    text = readFileSync(realPointer, "utf8");
  } catch {
    return { present: true, status: "unreadable" };
  }
  const lines = text.split(/\r?\n/u);
  const topLevelLines = lines
    .filter((line) => line.trim() && !line.trim().startsWith("#") && line === line.trimStart());
  const parsedEntries = topLevelLines.map(parsePointerEntry);
  const entries = parsedEntries.filter(Boolean);
  const malformedTopLevelCount = parsedEntries.filter((match) => !match).length + (hasLeadingIndentedContent(lines) ? 1 : 0);
  const blockIdentityKeys = pointerBlockIdentityKeys(lines);
  const identityEntries = entries.filter((entry) => POINTER_IDENTITY_KEYS.has(entry.key) && entry.value.trim());
  const invalidIdentityKeys = identityEntries
    .filter((entry) => !isPointerIdentity(entry.value.trim()))
    .map((entry) => entry.key);
  const policyKeys = entries
    .map((entry) => entry.key)
    .filter((key) => !POINTER_IDENTITY_KEYS.has(key));
  const ignoredKeys = [...new Set([
    ...policyKeys,
    ...invalidIdentityKeys,
    ...blockIdentityKeys,
    ...(malformedTopLevelCount > 0 ? ["unparsed"] : []),
  ])];
  if (ignoredKeys.length > 0) {
    return {
      present: true,
      status: "ignored-policy",
      ignoredKeys: ignoredKeys.map(redactSecrets),
    };
  }
  const identity = identityEntries[0]?.value.trim();
  if (!identity) return { present: true, status: "missing-identity" };
  return {
    present: true,
    status: "valid",
    identity: redactSecrets(identity),
  };
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

function computeScience({ stack, commands, dirty, protectedSurfaces, root, pointer }) {
  const missingUnlocks = [];
  const hasEnvelope = directoryHasFiles(root, ".agents/envelope");
  if (stack.every((entry) => entry.name === "unknown")) missingUnlocks.push("stack detection");
  for (const kind of COMMAND_KINDS) {
    if (commands[kind].status === "absent") missingUnlocks.push(`${kind} command`);
  }
  if (!directoryHasFiles(root, ".github/workflows")) missingUnlocks.push("ci workflow");
  if (!hasEnvelope && pointer?.status !== "valid") missingUnlocks.push("factory envelope");
  if (!hasEnvelope) missingUnlocks.push("tracker bind");
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
  if (level === "logistic" && hasEnvelope) level = "chemical";

  return { level, missingUnlocks };
}

function isContentScanFile(filePath) {
  const name = path.basename(filePath);
  if (name.startsWith(".env")) return true;
  return CONTENT_SCAN_EXTENSIONS.has(path.extname(name));
}

function collectContentScanFiles(root) {
  const result = git(root, ["ls-files", "-z"]);
  if (result.status !== 0) return [];
  return result.stdout
    .split("\0")
    .filter(Boolean)
    .filter((relativePath) => !relativePath.split("/").some((segment) => CONTENT_SCAN_IGNORES.has(segment)))
    .filter(isContentScanFile)
    .map((relativePath) => path.join(root, relativePath));
}



function scanContentSignals(root) {
  const realRoot = realpathSync(root);
  const signals = [];
  let scannedFiles = 0;
  let skippedFiles = 0;
  for (const filePath of collectContentScanFiles(root).sort()) {
    const relativePath = path.relative(root, filePath);
    let stat;
    let realFilePath;
    try {
      stat = lstatSync(filePath);
      realFilePath = realpathSync(filePath);
    } catch {
      skippedFiles += 1;
      continue;
    }
    if (!stat.isFile() || stat.size > 128 * 1024 || !isInsidePath(realRoot, realFilePath)) {
      skippedFiles += 1;
      continue;
    }
    scannedFiles += 1;
    const content = readFileSync(realFilePath, "utf8");
    if (redactSecrets(content) !== content) {
      signals.push({
        kind: "secret-like-content",
        path: redactSecrets(relativePath),
        redacted: true,
      });
    }
  }
  return {
    enabled: true,
    scannedFiles,
    skippedFiles,
    redactedSignals: signals,
  };
}


export function redactSecrets(value) {
  let text = String(value);
  text = text.replace(SECRET_ASSIGNMENT_PATTERN, (_, key) => `${key}=[REDACTED]`);
  for (const pattern of SECRET_VALUE_PATTERNS) {
    text = text.replace(pattern, (_, prefix) => `${prefix}[REDACTED]`);
  }
  return text;
}

function redactScanArtifact(value) {
  if (typeof value === "string") return redactSecrets(value);
  if (Array.isArray(value)) return value.map((item) => redactScanArtifact(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, redactScanArtifact(nested)]));
  }
  return value;
}


export function scanFactory({ root = process.cwd(), generatedAt, content = false } = {}) {
  const requestedRoot = path.resolve(root);
  const repoRoot = path.resolve(gitOutput(requestedRoot, ["rev-parse", "--show-toplevel"]) || requestedRoot);
  const packageJson = safeJsonFile(path.join(repoRoot, "package.json"));
  const stack = detectStack(repoRoot, packageJson);
  const commands = discoverCommands(repoRoot, packageJson);
  const branch = currentBranch(repoRoot);
  const dirty = dirtyState(repoRoot);
  const protectedSurfaces = detectProtectedSurfaces(repoRoot);
  const pointer = discoverPointer(repoRoot);
  const science = computeScience({ stack, commands, dirty, protectedSurfaces, root: repoRoot, pointer });

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
    pointer,
    protectedSurfaces,
    science,
    localState: {
      writes: false,
    },
    remoteApis: {
      called: false,
    },
    content: content ? scanContentSignals(repoRoot) : { enabled: false },
  }, generatedAt);
}

export function saveScanState(scan, { homeDir = process.env.HOME || os.homedir(), root = process.cwd(), generatedAt } = {}) {
  const requestedRoot = path.resolve(root);
  const repoRoot = path.resolve(gitOutput(requestedRoot, ["rev-parse", "--show-toplevel"]) || requestedRoot);
  const state = resolveFactoryStatePaths({
    homeDir,
    targetRepoPath: repoRoot,
    factoryId: redactSecrets(scan.target.name),
    generatedAt,
  });
  const savedScan = redactScanArtifact({
    ...scan,
    mode: "scan-save",
    localState: {
      writes: true,
      scan: state.scan,
    },
  });
  mkdirSync(path.dirname(state.scan), { recursive: true });
  writeFileSync(state.scan, `${JSON.stringify(savedScan, null, 2)}\n`);
  return savedScan;
}

function formatCommand(command) {
  if (command.status === "absent") return "absent";
  return `${command.command} (${command.source})`;
}

function formatPointer(pointer) {
  if (!pointer?.present) return "Pointer: absent";
  if (pointer.status === "valid") return `Pointer: ${pointer.identity}`;
  if (pointer.status === "ignored-policy") return `Pointer: ignored policy-bearing .loom.yml (${pointer.ignoredKeys.join(", ")})`;
  if (pointer.status === "missing-identity") return "Pointer: missing identity";
  return "Pointer: unreadable";
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
  const modeLine = scan.localState.writes
    ? "Mode: scan-save (writes local scan state only; no target-repo writes)"
    : "Mode: zero-footprint (no target-repo or local-state writes)";
  const contentLines = scan.content?.enabled
    ? [
      "Content signals:",
      `  scanned files: ${scan.content.scannedFiles}`,
      `  redacted secret-like signals: ${scan.content.redactedSignals.length}`,
      ...scan.content.redactedSignals.map((signal) => `  - ${signal.path}: ${signal.kind} redacted`),
    ]
    : [];

  return redactSecrets([
    "Factory scan",
    modeLine,
    "Remote APIs: none",
    `Repo: ${scan.target.name}`,
    `Branch: ${scan.git.currentBranch} (default: ${scan.git.defaultBranch})`,
    formatPointer(scan.pointer),
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
    ...contentLines,
    "",
  ].join("\n"));
}

export function main(argv = process.argv.slice(2)) {
  const options = readArgs(argv);
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  let scan = scanFactory({ root: options.root, content: options.content });
  if (options.save) scan = saveScanState(scan, { root: options.root });
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
