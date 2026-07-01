#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { resourceManifestPath } from "./lib/layout.mjs";

const USAGE = "Usage: node scripts/dry-run-harness-inventory.mjs [--manifest <path>] [--check-live]";
const DEFAULT_MANIFEST = resourceManifestPath;

function readArgs(argv) {
  const options = { manifest: DEFAULT_MANIFEST, checkLive: false };
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
    if (arg !== "--manifest") {
      throw new Error(`Unknown option: ${arg}`);
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      throw new Error("--manifest requires a value");
    }
    options.manifest = next;
    index += 1;
  }
  return options;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.length) return [value];
  return [];
}

function pathStatus(livePath, checkLive) {
  if (!checkLive) return "not checked";
  if (livePath.startsWith("repo:")) {
    const repoPath = livePath.slice("repo:".length);
    return existsSync(path.resolve(repoPath)) ? "present" : "missing";
  }
  if (livePath.includes("*")) return "pattern";
  if (livePath.startsWith("~/")) {
    return existsSync(path.join(homedir(), livePath.slice(2))) ? "present" : "missing";
  }
  return existsSync(path.resolve(livePath)) ? "present" : "missing";
}

function printResource(resource, checkLive) {
  const livePaths = asArray(resource.currentLivePath);
  const liveLabel = livePaths.length ? livePaths.join(", ") : resource.discoverySource;
  console.log(`- ${resource.id}`);
  console.log(`  harness: ${resource.sourceHarness}`);
  console.log(`  category: ${resource.resourceCategory}`);
  console.log(`  disposition: ${resource.disposition}`);
  console.log(`  target: ${resource.intendedRepoTarget}`);
  console.log(`  live/discovery: ${liveLabel}`);
  if (livePaths.length) {
    const statuses = livePaths.map((livePath) => `${livePath}=${pathStatus(livePath, checkLive)}`);
    console.log(`  dryRunStatus: ${statuses.join("; ")}`);
  } else {
    console.log("  dryRunStatus: discovery-only");
  }
  console.log(`  notes: ${resource.migrationNotes}`);
}

try {
  const options = readArgs(process.argv.slice(2));
  const manifest = JSON.parse(readFileSync(path.resolve(options.manifest), "utf8"));
  const resources = [...manifest.resources].sort((left, right) => {
    const disposition = left.disposition.localeCompare(right.disposition);
    if (disposition !== 0) return disposition;
    const harness = left.sourceHarness.localeCompare(right.sourceHarness);
    if (harness !== 0) return harness;
    return left.id.localeCompare(right.id);
  });

  console.log("Harness resource inventory dry run");
  console.log(`Manifest: ${options.manifest}`);
  console.log("Mutation: disabled");
  console.log(`Live existence check: ${options.checkLive ? "path-only" : "disabled"}`);
  console.log("");

  let currentDisposition = "";
  for (const resource of resources) {
    if (resource.disposition !== currentDisposition) {
      currentDisposition = resource.disposition;
      console.log(`[${currentDisposition}]`);
    }
    printResource(resource, options.checkLive);
  }

  if (Array.isArray(manifest.excludedSurfaces) && manifest.excludedSurfaces.length) {
    console.log("");
    console.log("[excluded]");
    for (const surface of manifest.excludedSurfaces) {
      console.log(`- ${surface.id}: ${surface.reason}`);
      console.log(`  paths: ${surface.paths.join(", ")}`);
    }
  }
} catch (error) {
  console.error(error.message);
  console.error(USAGE);
  process.exit(2);
}
