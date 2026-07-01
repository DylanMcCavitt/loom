#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resourceManifestPath } from "./lib/layout.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateHarnessManifest as validateManifest } from "./lib/harness-safety.mjs";

const USAGE = "Usage: node scripts/validate-harness-manifest.mjs [--manifest <path>]";
const DEFAULT_MANIFEST = resourceManifestPath;

function readArgs(argv) {
  const options = { manifest: DEFAULT_MANIFEST };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log(USAGE);
      process.exit(0);
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

export function validateHarnessManifest(manifest) {
  return validateManifest(manifest).errors;
}

function main() {
  const options = readArgs(process.argv.slice(2));
  const manifestPath = path.resolve(options.manifest);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const errors = validateHarnessManifest(manifest);
  if (errors.length) {
    console.error("Harness manifest validation failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`Harness manifest validation passed: ${manifest.resources.length} resources checked in ${options.manifest}`);
}

const invokedDirectly = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (invokedDirectly) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    console.error(USAGE);
    process.exit(2);
  }
}
