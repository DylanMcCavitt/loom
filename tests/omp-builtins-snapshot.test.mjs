import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { EXPECTED_AGENTS, discoverPackageRoot } from "../scripts/lib/omp-package-contract.mjs";

const snapshotDir = new URL("../distributions/snapshots/omp-builtins/", import.meta.url).pathname;
const sourcePath = new URL("../distributions/snapshots/omp-builtins/source.json", import.meta.url).pathname;
const commandsPath = new URL("../distributions/snapshots/omp-builtins/commands.json", import.meta.url).pathname;
const portabilityMatrixPath = new URL("../distributions/snapshots/omp-builtins/portability-matrix.json", import.meta.url).pathname;
const resourceIndexPath = new URL("../distributions/snapshots/omp-builtins/resource-index.json", import.meta.url).pathname;
const validator = new URL("../scripts/validate-omp-builtins-snapshot.mjs", import.meta.url).pathname;
const refresh = new URL("../scripts/refresh-omp-builtins-snapshot.mjs", import.meta.url).pathname;

const source = JSON.parse(readFileSync(sourcePath, "utf8"));
const commands = JSON.parse(readFileSync(commandsPath, "utf8"));
const portabilityMatrix = JSON.parse(readFileSync(portabilityMatrixPath, "utf8"));
const resourceIndex = JSON.parse(readFileSync(resourceIndexPath, "utf8"));
const hasOmp = spawnSync("which", ["omp"]).status === 0;
const hasRefreshableOmpPackage = Boolean(findRefreshableOmpPackageRoot());

// Mirror the refresh script's discovery exactly (shared module), then additionally require the
// discovered package version to match the checked-in snapshot: the "no drift" assertion is only
// meaningful when the refreshable source is the same version the snapshot was captured from.
function findRefreshableOmpPackageRoot() {
  const which = spawnSync("which", ["omp"], { encoding: "utf8" });
  if (which.status !== 0) return null;
  const version = spawnSync("omp", ["--version"], { encoding: "utf8" });
  if (version.status !== 0) return null;
  const realpath = spawnSync("realpath", [which.stdout.trim()], { encoding: "utf8" });
  const ompPath = (realpath.status === 0 ? realpath.stdout : which.stdout).trim();
  let root;
  try {
    root = discoverPackageRoot({ ompBinaryPath: ompPath, cliVersionText: version.stdout.trim() });
  } catch {
    return null;
  }
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  if (pkg.version !== source.source.packageVersion) return null;
  return root;
}

function runNode(script, args = []) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
}

test("OMP built-ins snapshot validator accepts the checked-in files", () => {
  const result = runNode(validator);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /OMP built-ins snapshot validation passed/u);
});

test("bundled OMP task agents are snapshotted with source metadata", () => {
  assert.equal(source.source.packageName, "@oh-my-pi/pi-coding-agent");
  assert.match(source.source.cliVersion, /^omp\/\d+\.\d+\.\d+/u);
  assert.deepEqual(source.expectedBundledAgents, EXPECTED_AGENTS);
  assert.deepEqual(source.agents.map(agent => agent.name), EXPECTED_AGENTS);
  for (const agent of source.agents) {
    assert.ok(existsSync(path.join(snapshotDir, agent.file)), `${agent.file} missing`);
    assert.match(agent.sha256, /^[a-f0-9]{64}$/u);
  }
});

test("built-in command registry distinguishes portable indexes from OMP runtime commands", () => {
  assert.ok(commands.commands.length >= 40, "expected source registry, not terminal autocomplete subset");
  assert.ok(commands.commands.some(command => command.portabilityClass === "omp-acp-text-and-tui-runtime"));
  assert.ok(commands.commands.some(command => command.portabilityClass === "omp-tui-runtime-only"));
  for (const command of commands.commands) {
    assert.equal(command.sourceType, "builtin-slash-command");
    assert.ok(Array.isArray(command.aliases), `${command.name} aliases should be an array`);
  }
});

test("built-in command registry preserves representative aliases, subcommands, and portability", () => {
  const byName = new Map(commands.commands.map(command => [command.name, command]));
  assert.deepEqual(byName.get("model")?.aliases, ["models"]);
  assert.equal(byName.get("model")?.portabilityClass, "omp-acp-text-and-tui-runtime");
  assert.equal(byName.get("model")?.advertisedInAcp, true);
  assert.equal(byName.get("settings")?.portabilityClass, "omp-tui-runtime-only");
  assert.equal(byName.get("settings")?.advertisedInAcp, false);
  assert.deepEqual(byName.get("force")?.aliases, ["force:"]);
  assert.equal(byName.get("force")?.allowsArgs, true);
  assert.equal(byName.get("force")?.inputHint, "<tool-name> [prompt]");
  assert.ok(byName.get("mcp")?.subcommands.includes("resources"));
  assert.ok(byName.get("mcp")?.subcommands.includes("prompts"));
});

test("portability matrix classifies every indexed OMP built-in command", () => {
  const commandNames = commands.commands.map(command => command.name).sort();
  const matrixNames = portabilityMatrix.commands.map(command => command.name).sort();
  assert.deepEqual(matrixNames, commandNames);
  assert.equal(portabilityMatrix.generatedForIssue, 40);
  assert.deepEqual(Object.keys(portabilityMatrix.portabilityClasses).sort(), [
    "adapter-required",
    "cli-wrapper",
    "document",
    "omp-only",
    "skill",
  ]);
  assert.ok(portabilityMatrix.openProductDecisions.length >= 5);
});

test("portability matrix spot-checks each issue 40 portability class", () => {
  const byName = new Map(portabilityMatrix.commands.map(command => [command.name, command]));
  assert.equal(byName.get("tools")?.portabilityClass, "document");
  assert.match(byName.get("tools")?.rationale ?? "", /reference/u);
  assert.equal(byName.get("handoff")?.portabilityClass, "skill");
  assert.match(byName.get("handoff")?.codexTarget ?? "", /skill/u);
  assert.equal(byName.get("usage")?.portabilityClass, "cli-wrapper");
  assert.match(byName.get("usage")?.stableCli ?? "", /^omp usage/u);
  assert.equal(byName.get("compact")?.portabilityClass, "adapter-required");
  assert.equal(byName.get("compact")?.runtimeSessionCommand, true);
  assert.equal(byName.get("copy")?.portabilityClass, "omp-only");
  assert.equal(byName.get("copy")?.codexTarget, "none");
});

test("portability matrix separates stable CLI wrappers from in-session command handlers", () => {
  const byName = new Map(portabilityMatrix.commands.map(command => [command.name, command]));
  for (const name of ["agents", "export", "join", "marketplace", "model", "plugins", "resume", "settings", "setup", "ssh", "stats", "usage"]) {
    assert.equal(byName.get(name)?.portabilityClass, "cli-wrapper", `${name} should be CLI-backed`);
    assert.match(byName.get(name)?.stableCli ?? "", /^omp/u);
  }
  for (const name of ["advisor", "branch", "compact", "debug", "goal", "mcp", "memory", "plan-review", "retry", "session", "share", "switch"]) {
    assert.equal(byName.get(name)?.portabilityClass, "adapter-required", `${name} should require adapter control`);
    assert.equal(byName.get(name)?.stableCli, null);
  }
  for (const name of ["mcp", "memory", "reload-plugins", "todo"]) {
    assert.equal(byName.get(name)?.runtimeSessionCommand, true, `${name} should be marked as a runtime handler`);
  }
});

test("runtime-session skill candidates do not claim to be direct OMP runtime ports", () => {
  for (const command of portabilityMatrix.commands.filter(row => row.portabilityClass === "skill")) {
    assert.match(command.codexTarget, /skill/u);
    assert.match(command.claudeTarget, /skill/u);
    if (command.runtimeSessionCommand) {
      assert.match(command.rationale, /\bnot\b/u, `${command.name} should call out the runtime gap`);
    }
  }
});

test("built-in prompt and rule indexes contain path-level drift metadata only", () => {
  assert.ok(resourceIndex.portableResources.promptCategories.some(category => category.category === "agents"));
  assert.ok(resourceIndex.portableResources.builtInRules.length >= 10);
  for (const category of resourceIndex.portableResources.promptCategories) {
    assert.match(category.combinedSha256, /^[a-f0-9]{64}$/u);
    for (const file of category.files) {
      assert.match(file.path, /^src\/prompts\//u);
      assert.match(file.sha256, /^[a-f0-9]{64}$/u);
    }
  }
  assert.ok(resourceIndex.runtimeOnlySurfaces.some(surface => surface.portabilityClass === "omp-tui-runtime-only"));
  assert.ok(resourceIndex.excludedRuntimeState.some(item => item.includes("terminal-sessions")));
});

test("snapshot refresh dry run reports no drift when refreshable OMP package source is available", { skip: !hasRefreshableOmpPackage }, () => {
  const result = runNode(refresh);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Mutation: disabled/u);
  assert.match(result.stdout, /Drift: none/u);
});

test("snapshot refresh write mode refuses custom live-like targets", { skip: !hasOmp }, () => {
  const result = runNode(refresh, ["--write", "--snapshot-dir", ".omp"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--snapshot-dir only supports the checked-in snapshot directory/u);
});

test("snapshot validator refuses custom live-like targets before walking files", () => {
  const result = runNode(validator, ["--snapshot-dir", ".omp"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--snapshot-dir only supports the checked-in snapshot directory/u);
});
