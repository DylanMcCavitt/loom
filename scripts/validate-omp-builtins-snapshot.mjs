#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const USAGE = "Usage: node scripts/validate-omp-builtins-snapshot.mjs [--snapshot-dir <path>] [--check-live]";
const DEFAULT_SNAPSHOT_DIR = "distributions/snapshots/omp-builtins";
const EXPECTED_AGENTS = ["designer", "explore", "librarian", "oracle", "plan", "quick_task", "reviewer", "task"];
const PORTABILITY_CLASSES = new Set([
  "omp-acp-text-and-tui-runtime",
  "omp-acp-text-runtime",
  "omp-tui-runtime-only",
]);
const MATRIX_PORTABILITY_CLASSES = new Set([
  "document",
  "skill",
  "cli-wrapper",
  "adapter-required",
  "omp-only",
]);
const SECRET_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/u,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/u,
  /\bsk-[A-Za-z0-9_-]{20,}\b/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\b(?:api[_-]?key|token|secret|password)\b\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{16,}["']?/iu,
];

function readArgs(argv) {
  const options = { snapshotDir: DEFAULT_SNAPSHOT_DIR, checkLive: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log(USAGE);
      process.exit(0);
    }
    if (arg === "--check-live") {
      options.checkLive = true;
      continue;
    }
    if (arg !== "--snapshot-dir") {
      throw new Error(`Unknown option: ${arg}`);
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      throw new Error("--snapshot-dir requires a value");
    }
    options.snapshotDir = next;
    index += 1;
  }
  return options;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function assertSafeSnapshotDir(snapshotDir) {
  const resolved = path.resolve(snapshotDir);
  const defaultResolved = path.resolve(DEFAULT_SNAPSHOT_DIR);
  if (resolved !== defaultResolved) {
    throw new Error(`--snapshot-dir only supports the checked-in snapshot directory: ${DEFAULT_SNAPSHOT_DIR}`);
  }
  const normalized = resolved.split(path.sep).join("/");
  if (normalized.endsWith("/.omp") || normalized.endsWith("/.omp/agents") || normalized.endsWith("/.omp/agent")) {
    throw new Error("snapshot validation refuses to target live OMP config directories");
  }
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function walkFiles(root) {
  const result = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...walkFiles(full));
    } else if (entry.isFile()) {
      result.push(full);
    }
  }
  return result.sort();
}

function validateNoPrivateOrSecretText(snapshotDir, errors) {
  for (const filePath of walkFiles(snapshotDir)) {
    const relative = path.relative(snapshotDir, filePath).split(path.sep).join("/");
    const text = readFileSync(filePath, "utf8");
    if (/\/Users\/[^/\s"]+/u.test(text)) {
      errors.push(`${relative}: contains an absolute private home path`);
    }
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(text)) {
        errors.push(`${relative}: contains API-key/token-looking text`);
        break;
      }
    }
    if (/\.(db|sqlite|sqlite3|bin|blob|log)$/iu.test(relative)) {
      errors.push(`${relative}: runtime/blob/log/database file copied into snapshot`);
    }
  }
}

function validateSource(snapshotDir, source, errors) {
  if (source.schemaVersion !== 1) errors.push("source.json: schemaVersion must be 1");
  if (source.generatedForIssue !== 39) errors.push("source.json: generatedForIssue must be 39");
  if (source.source?.packageName !== "@oh-my-pi/pi-coding-agent") {
    errors.push("source.json: source package must be @oh-my-pi/pi-coding-agent");
  }
  if (!/^omp\/\d+\.\d+\.\d+/u.test(source.source?.cliVersion ?? "")) {
    errors.push("source.json: cliVersion must record the OMP version");
  }
  const expected = new Set(EXPECTED_AGENTS);
  const listed = new Set(source.agents?.map(agent => agent.name) ?? []);
  for (const name of expected) {
    if (!listed.has(name)) errors.push(`source.json: missing expected bundled agent ${name}`);
  }
  for (const agent of source.agents ?? []) {
    const filePath = path.join(snapshotDir, agent.file);
    if (!existsSync(filePath)) {
      errors.push(`source.json: missing agent file ${agent.file}`);
      continue;
    }
    const content = readFileSync(filePath, "utf8");
    if (sha256(content) !== agent.sha256) errors.push(`${agent.file}: sha256 does not match source.json`);
    if (!content.startsWith("---\n")) errors.push(`${agent.file}: missing frontmatter`);
  }
}

function validateCommands(commands, errors) {
  if (commands.schemaVersion !== 1) errors.push("commands.json: schemaVersion must be 1");
  if (!Array.isArray(commands.commands) || commands.commands.length === 0) {
    errors.push("commands.json: commands must be a non-empty array");
    return;
  }
  const seen = new Set();
  let hasAcp = false;
  let hasTuiOnly = false;
  for (const command of commands.commands) {
    if (!command.name || typeof command.name !== "string") errors.push("commands.json: command missing name");
    if (seen.has(command.name)) errors.push(`commands.json: duplicate command ${command.name}`);
    seen.add(command.name);
    if (!Array.isArray(command.aliases)) errors.push(`${command.name}: aliases must be an array`);
    if (command.sourceType !== "builtin-slash-command") {
      errors.push(`${command.name}: sourceType must be builtin-slash-command`);
    }
    if (!PORTABILITY_CLASSES.has(command.portabilityClass)) {
      errors.push(`${command.name}: invalid portabilityClass ${command.portabilityClass}`);
    }
    if (command.advertisedInAcp) hasAcp = true;
    if (command.tuiRuntimeOnly) hasTuiOnly = true;
  }
  if (!hasAcp) errors.push("commands.json: expected at least one ACP/text-compatible builtin command");
  if (!hasTuiOnly) errors.push("commands.json: expected at least one TUI-runtime-only builtin command");
  for (const sourceType of ["builtin-slash-command", "skill", "extension", "custom", "mcp_prompt", "file"]) {
    if (!commands.commandSourceTypes?.some(item => item.sourceType === sourceType)) {
      errors.push(`commands.json: missing command source type ${sourceType}`);
    }
  }
}

function validatePortabilityMatrix(commands, matrix, errors) {
  if (matrix.schemaVersion !== 1) errors.push("portability-matrix.json: schemaVersion must be 1");
  if (matrix.generatedForIssue !== 40) errors.push("portability-matrix.json: generatedForIssue must be 40");
  if (matrix.sourceSnapshot !== "distributions/snapshots/omp-builtins/commands.json") {
    errors.push("portability-matrix.json: sourceSnapshot must point to distributions/snapshots/omp-builtins/commands.json");
  }
  for (const className of MATRIX_PORTABILITY_CLASSES) {
    if (typeof matrix.portabilityClasses?.[className] !== "string") {
      errors.push(`portability-matrix.json: missing portability class definition ${className}`);
    }
  }
  if (!Array.isArray(matrix.commands) || matrix.commands.length === 0) {
    errors.push("portability-matrix.json: commands must be a non-empty array");
    return;
  }

  const snapshotByName = new Map((commands.commands ?? []).map(command => [command.name, command]));
  const matrixByName = new Map();
  const classCounts = new Map([...MATRIX_PORTABILITY_CLASSES].map(className => [className, 0]));
  let cliWrapperCount = 0;
  let adapterRuntimeCount = 0;

  for (const row of matrix.commands) {
    if (!row.name || typeof row.name !== "string") {
      errors.push("portability-matrix.json: row missing command name");
      continue;
    }
    if (matrixByName.has(row.name)) errors.push(`portability-matrix.json: duplicate command ${row.name}`);
    matrixByName.set(row.name, row);
    const snapshot = snapshotByName.get(row.name);
    if (!snapshot) errors.push(`portability-matrix.json: unknown command ${row.name}`);
    if (!MATRIX_PORTABILITY_CLASSES.has(row.portabilityClass)) {
      errors.push(`${row.name}: invalid matrix portabilityClass ${row.portabilityClass}`);
    } else {
      classCounts.set(row.portabilityClass, classCounts.get(row.portabilityClass) + 1);
    }
    for (const field of ["codexTarget", "claudeTarget", "ompTarget", "rationale"]) {
      if (!row[field] || typeof row[field] !== "string") {
        errors.push(`${row.name}: missing ${field}`);
      }
    }
    if (typeof row.runtimeSessionCommand !== "boolean") {
      errors.push(`${row.name}: runtimeSessionCommand must be boolean`);
    }
    if (row.portabilityClass === "cli-wrapper") {
      cliWrapperCount += 1;
      if (!row.stableCli || typeof row.stableCli !== "string" || !row.stableCli.startsWith("omp")) {
        errors.push(`${row.name}: cli-wrapper rows must name a stable OMP CLI invocation`);
      }
    } else if (row.stableCli !== null) {
      errors.push(`${row.name}: stableCli must be null unless portabilityClass is cli-wrapper`);
    }
    if (row.portabilityClass === "adapter-required") {
      if (!/adapter/u.test(`${row.codexTarget} ${row.claudeTarget}`)) {
        errors.push(`${row.name}: adapter-required rows must recommend an adapter target`);
      }
      if (row.runtimeSessionCommand) adapterRuntimeCount += 1;
    }
    if (row.portabilityClass === "skill" && row.runtimeSessionCommand && !/\bnot\b/u.test(row.rationale)) {
      errors.push(`${row.name}: runtime-backed skill rows must explicitly say what the skill does not provide`);
    }
    if (snapshot?.tuiRuntimeOnly && row.portabilityClass === "document") {
      errors.push(`${row.name}: TUI-runtime-only commands must not be reduced to document-only`);
    }
    if (snapshot?.tuiRuntimeOnly && row.runtimeSessionCommand !== true) {
      errors.push(`${row.name}: TUI-runtime-only commands must be marked runtimeSessionCommand`);
    }
    if (
      row.runtimeSessionCommand !== true &&
      (
        row.ompTarget === "in-session slash command" ||
        /\bslash handlers?\b/u.test(row.rationale) ||
        /\brunning OMP process\b/u.test(row.rationale)
      )
    ) {
      errors.push(`${row.name}: in-session/runtime handler must be marked runtimeSessionCommand`);
    }
  }

  for (const commandName of snapshotByName.keys()) {
    if (!matrixByName.has(commandName)) {
      errors.push(`portability-matrix.json: missing command ${commandName}`);
    }
  }
  for (const [className, count] of classCounts.entries()) {
    if (count === 0) errors.push(`portability-matrix.json: missing rows for class ${className}`);
  }
  if (cliWrapperCount < 5) errors.push("portability-matrix.json: expected multiple stable CLI-backed commands");
  if (adapterRuntimeCount < 10) errors.push("portability-matrix.json: expected active runtime commands to require adapters");
  if (!Array.isArray(matrix.openProductDecisions) || matrix.openProductDecisions.length < 5) {
    errors.push("portability-matrix.json: open product decisions must be listed");
  }
  for (const decision of matrix.openProductDecisions ?? []) {
    if (!decision.decision || !decision.question) {
      errors.push("portability-matrix.json: malformed open product decision");
    }
  }
}

function validateResourceIndex(resources, errors) {
  if (resources.schemaVersion !== 1) errors.push("resource-index.json: schemaVersion must be 1");
  const prompts = resources.portableResources?.promptCategories;
  if (!Array.isArray(prompts) || prompts.length === 0) {
    errors.push("resource-index.json: missing prompt category index");
  }
  const rules = resources.portableResources?.builtInRules;
  if (!Array.isArray(rules) || rules.length === 0) {
    errors.push("resource-index.json: missing built-in rules index");
  }
  for (const category of prompts ?? []) {
    if (!category.category || !Array.isArray(category.files) || !category.combinedSha256) {
      errors.push(`resource-index.json: malformed prompt category ${category.category ?? "(missing)"}`);
    }
  }
  for (const rule of rules ?? []) {
    if (!rule.name || !rule.path || !rule.sha256 || rule.sourceType !== "builtin-default-rule") {
      errors.push(`resource-index.json: malformed built-in rule ${rule.name ?? "(missing)"}`);
    }
  }
  const runtimeClasses = new Set((resources.runtimeOnlySurfaces ?? []).map(surface => surface.portabilityClass));
  if (!runtimeClasses.has("omp-tui-runtime-only") || !runtimeClasses.has("mcp-runtime-only")) {
    errors.push("resource-index.json: runtime-only command surfaces are not distinguished");
  }
  const excluded = resources.excludedRuntimeState ?? [];
  for (const marker of ["sessions", "terminal-sessions", "blobs", "cache"]) {
    if (!excluded.some(item => item.includes(marker))) {
      errors.push(`resource-index.json: missing excluded runtime state marker ${marker}`);
    }
  }
}

function runLiveDriftCheck(errors) {
  const result = spawnSync(process.execPath, ["scripts/refresh-omp-builtins-snapshot.mjs"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    errors.push(`live refresh dry run reported drift or failed:\n${result.stdout}${result.stderr}`);
  }
}

try {
  const options = readArgs(process.argv.slice(2));
  const snapshotDir = path.resolve(options.snapshotDir);
  assertSafeSnapshotDir(snapshotDir);
  const errors = [];
  const source = readJson(path.join(snapshotDir, "source.json"));
  const commands = readJson(path.join(snapshotDir, "commands.json"));
  const resources = readJson(path.join(snapshotDir, "resource-index.json"));
  const portabilityMatrix = readJson(path.join(snapshotDir, "portability-matrix.json"));

  validateSource(snapshotDir, source, errors);
  validateCommands(commands, errors);
  validatePortabilityMatrix(commands, portabilityMatrix, errors);
  validateResourceIndex(resources, errors);
  validateNoPrivateOrSecretText(snapshotDir, errors);
  if (options.checkLive) runLiveDriftCheck(errors);

  if (errors.length > 0) {
    console.error("OMP built-ins snapshot validation failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(
    `OMP built-ins snapshot validation passed: ${source.agents.length} agents, ${commands.commands.length} commands, ${portabilityMatrix.commands.length} portability rows, ${resources.portableResources.builtInRules.length} built-in rules`,
  );
} catch (error) {
  console.error(error.message);
  console.error(USAGE);
  process.exit(2);
}
