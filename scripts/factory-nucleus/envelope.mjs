#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { scanFactory, redactSecrets } from "./scan.mjs";
import { parseYaml, resolveFactoryStatePaths, validateEnvelopeYaml, withArtifactMetadata } from "./schema.mjs";

const USAGE = "Usage: node scripts/factory-nucleus/envelope.mjs [--root <path>]";

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

function factoryIdFromName(name) {
  const redacted = redactSecrets(name).replace(/\[REDACTED\]/gu, "redacted");
  const id = redacted.toLowerCase().replace(/[^a-z0-9-]+/gu, "-").replace(/^-+|-+$/gu, "");
  return id || "factory";
}

function explicitDefaultBranch(root) {
  const remoteHead = gitOutput(root, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
  if (remoteHead?.startsWith("origin/")) return remoteHead.slice("origin/".length);
  return "main";
}

function yamlString(value) {
  return JSON.stringify(String(value));
}

function renderEnvelopeYaml(envelope) {
  const proofCommands = envelope.proof.commands.map((command) => `    - ${yamlString(command)}`).join("\n");
  const circuits = envelope.circuits.map((circuit) => [
    `  - name: ${yamlString(circuit.name)}`,
    `    gate: ${circuit.gate}`,
    `    outcome: ${circuit.outcome}`,
    `    enforcement: ${circuit.enforcement}`,
    `    reason: ${yamlString(circuit.reason)}`,
  ].join("\n")).join("\n");
  const trackerLines = ["tracker:", `  provider: ${envelope.tracker.provider}`];
  if (envelope.tracker.team !== undefined) trackerLines.push(`  team: ${yamlString(envelope.tracker.team)}`);
  if (envelope.tracker.project !== undefined) trackerLines.push(`  project: ${yamlString(envelope.tracker.project)}`);
  if (envelope.tracker.repo !== undefined) trackerLines.push(`  repo: ${yamlString(envelope.tracker.repo)}`);
  return `${[
    `schemaVersion: ${envelope.schemaVersion}`,
    `kind: ${envelope.kind}`,
    `generatedAt: ${yamlString(envelope.generatedAt)}`,
    "factory:",
    `  id: ${envelope.factory.id}`,
    "  repo:",
    `    name: ${yamlString(envelope.factory.repo.name)}`,
    `    root: ${yamlString(envelope.factory.repo.root)}`,
    ...trackerLines,
    "delivery:",
    `  defaultBranch: ${yamlString(envelope.delivery.defaultBranch)}`,
    `  branchPrefix: ${yamlString(envelope.delivery.branchPrefix)}`,
    `  autoMerge: ${envelope.delivery.autoMerge}`,
    "proof:",
    "  commands:",
    proofCommands,
    "agents:",
    `  maxSubagents: ${envelope.agents.maxSubagents}`,
    `  allowFullTranscriptCapture: ${envelope.agents.allowFullTranscriptCapture}`,
    "circuits:",
    circuits,
  ].join("\n")}\n`;
}

export function initEnvelope({ root = process.cwd(), homeDir = process.env.HOME || os.homedir(), generatedAt } = {}) {
  const requestedRoot = path.resolve(root);
  const repoRoot = path.resolve(gitOutput(requestedRoot, ["rev-parse", "--show-toplevel"]) || requestedRoot);
  const scan = scanFactory({ root: repoRoot, generatedAt });
  const repoName = redactSecrets(scan.target.name);
  const factoryId = factoryIdFromName(scan.target.name);
  const proofCommands = Object.values(scan.commands)
    .filter((command) => command.status === "found" && command.command)
    .map((command) => command.command);
  const envelope = withArtifactMetadata("envelope", {
    factory: {
      id: factoryId,
      repo: {
        name: repoName,
        root: ".",
      },
    },
    tracker: {
      provider: "none",
    },
    delivery: {
      defaultBranch: redactSecrets(explicitDefaultBranch(repoRoot)),
      branchPrefix: "factory",
      autoMerge: false,
    },
    proof: {
      commands: proofCommands.length > 0 ? proofCommands : ["manual proof required"],
    },
    agents: {
      maxSubagents: 0,
      allowFullTranscriptCapture: false,
    },
    circuits: [
      {
        name: "proof-required",
        gate: "proof",
        outcome: "block",
        enforcement: "validate",
        reason: "Launch requires explicit proof commands before merge.",
      },
      {
        name: "tracker-explicit",
        gate: "tracker",
        outcome: "block",
        enforcement: "manual-review",
        reason: "Tracker binding stays unset until an explicit bind command runs.",
      },
    ],
  }, generatedAt);
  const yaml = renderEnvelopeYaml(envelope);
  const validation = validateEnvelopeYaml(yaml);
  if (!validation.ok) throw new Error(`invalid generated envelope: ${validation.errors.join("; ")}`);
  const state = resolveFactoryStatePaths({ homeDir, targetRepoPath: repoRoot, factoryId, generatedAt });
  if (existsSync(state.envelope)) throw new Error("factory envelope already exists; refusing to overwrite local state");
  mkdirSync(path.dirname(state.envelope), { recursive: true });
  writeFileSync(state.envelope, yaml);
  return { envelope, path: state.envelope, repoRoot };
}

const TRACKER_PROVIDERS = new Set(["linear", "github"]);

function detectSourceRepo(root) {
  const url = gitOutput(root, ["remote", "get-url", "origin"]);
  if (!url) return null;
  const match = url.match(/github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?$/u);
  return match ? match[1] : null;
}

function trackerBlock({ provider, team, project, repo, root }) {
  if (!provider) throw new Error("explicit --provider <linear|github> is required; tracker left inactive");
  if (!TRACKER_PROVIDERS.has(provider)) throw new Error(`unknown tracker provider: ${provider} (expected linear or github)`);
  if (provider === "linear") {
    if (!team || !project) throw new Error("linear bind requires --team and --project");
    return { provider, team, project };
  }
  const sourceRepo = repo || detectSourceRepo(root);
  if (!sourceRepo) throw new Error("could not detect a GitHub source repo; pass --repo <owner>/<name>");
  return { provider, repo: sourceRepo };
}

export function bindTracker({ root = process.cwd(), homeDir = process.env.HOME || os.homedir(), provider, team, project, repo, generatedAt } = {}) {
  const requestedRoot = path.resolve(root);
  const repoRoot = path.resolve(gitOutput(requestedRoot, ["rev-parse", "--show-toplevel"]) || requestedRoot);
  const scan = scanFactory({ root: repoRoot, generatedAt });
  const factoryId = factoryIdFromName(scan.target.name);
  const state = resolveFactoryStatePaths({ homeDir, targetRepoPath: repoRoot, factoryId, generatedAt });
  if (!existsSync(state.envelope)) throw new Error("factory envelope not found; run init-envelope first");
  const tracker = trackerBlock({ provider, team, project, repo, root: repoRoot });
  const envelope = parseYaml(readFileSync(state.envelope, "utf8"));
  envelope.tracker = tracker;
  const yaml = renderEnvelopeYaml(envelope);
  const validation = validateEnvelopeYaml(yaml);
  if (!validation.ok) throw new Error(`invalid bound envelope: ${validation.errors.join("; ")}`);
  writeFileSync(state.envelope, yaml);
  return { envelope, path: state.envelope, repoRoot, tracker };
}

export function main(argv = process.argv.slice(2)) {
  const options = readArgs(argv);
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  const result = initEnvelope({ root: options.root });
  process.stdout.write([
    "Factory envelope",
    "Mode: init-envelope (writes local envelope state only; no target-repo writes)",
    `Repo: ${redactSecrets(path.basename(result.repoRoot))}`,
    "Tracker: none (explicit/unset)",
    "Remote APIs: none",
    "Pointer writes: none",
    "",
  ].join("\n"));
  return 0;
}

function bindArgs(argv) {
  const flags = { "--root": "root", "--provider": "provider", "--team": "team", "--project": "project", "--repo": "repo" };
  const options = { root: process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    const key = flags[arg];
    if (!key) throw new Error(`Unknown option: ${arg}`);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) throw new Error(`${arg} requires a value`);
    options[key] = next;
    index += 1;
  }
  return options;
}

const BIND_USAGE = "Usage: node scripts/factory-nucleus/factory.mjs bind-tracker --provider <linear|github> [--team <team>] [--project <project>] [--repo <owner/name>] [--root <path>]";

export function bindMain(argv = process.argv.slice(2)) {
  const options = bindArgs(argv);
  if (options.help) {
    process.stdout.write(`${BIND_USAGE}\n`);
    return 0;
  }
  const result = bindTracker(options);
  const trackerLine = result.tracker.provider === "linear"
    ? `Tracker: linear (project ${result.tracker.project})`
    : `Tracker: github (repo ${result.tracker.repo})`;
  process.stdout.write([
    "Factory tracker bind",
    "Mode: bind-tracker (writes local envelope state only; no target-repo writes)",
    `Repo: ${redactSecrets(path.basename(result.repoRoot))}`,
    trackerLine,
    "Remote APIs: none",
    "",
  ].join("\n"));
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
