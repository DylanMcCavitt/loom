#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";

import { redactSecrets } from "./scan.mjs";

const USAGE = "Usage: node scripts/factory-nucleus/factory.mjs choose-tracker [--root <path>] [--json]";

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
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg !== "--root") throw new Error(`Unknown option: ${arg}`);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) throw new Error("--root requires a value");
    options.root = next;
    index += 1;
  }
  return options;
}

function detectSourceRepo(root) {
  const url = gitOutput(root, ["remote", "get-url", "origin"]);
  if (!url) return null;
  const match = url.match(/github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?$/u);
  return match ? match[1] : null;
}

export function trackerPicker({ root = process.cwd() } = {}) {
  const requestedRoot = path.resolve(root);
  const repoRoot = path.resolve(gitOutput(requestedRoot, ["rev-parse", "--show-toplevel"]) || requestedRoot);
  const sourceRepo = detectSourceRepo(repoRoot);
  return {
    repo: redactSecrets(path.basename(repoRoot)),
    options: [
      {
        provider: "linear",
        useWhen: "You want planning in Linear projects/issues/docs and GitHub only for branches/PRs/CI.",
        command: "npm run factory -- bind-tracker --provider linear --team <team> --project <project>",
      },
      {
        provider: "github",
        useWhen: "You want GitHub Issues as the planning tracker for this repo.",
        command: sourceRepo
          ? "npm run factory -- bind-tracker --provider github"
          : "npm run factory -- bind-tracker --provider github --repo <owner/name>",
        detectedRepo: sourceRepo || undefined,
      },
    ],
    nextStep: "Ask the user which tracker to bind for this project, then run the matching bind-tracker command. Do not infer a tracker silently.",
  };
}

export function pickerMain(argv = process.argv.slice(2)) {
  const options = readArgs(argv);
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  const result = trackerPicker(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }
  process.stdout.write([
    "Factory tracker picker",
    `Repo: ${result.repo}`,
    "No tracker is selected by default. Ask the user which tracker to use for this project:",
    "",
    "1. linear",
    `   ${result.options[0].useWhen}`,
    `   ${result.options[0].command}`,
    "",
    "2. github",
    `   ${result.options[1].useWhen}`,
    result.options[1].detectedRepo ? `   detected repo: ${redactSecrets(result.options[1].detectedRepo)}` : "   detected repo: none",
    `   ${result.options[1].command}`,
    "",
    result.nextStep,
    "",
  ].join("\n"));
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exitCode = pickerMain();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
