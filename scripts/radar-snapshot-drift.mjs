#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ompBuiltinsSourcePath } from "./lib/layout.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const FETCH_TIMEOUT_MS = 10_000;

function compareSemver(a, b) {
  const pa = String(a).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const pb = String(b).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) {
      return da < db ? -1 : 1;
    }
  }
  return 0;
}

function loadPinnedSnapshot() {
  const sourcePath = path.join(repoRoot, ompBuiltinsSourcePath);
  const source = JSON.parse(readFileSync(sourcePath, "utf8"));
  const packageName = source?.source?.packageName;
  const packageVersion = source?.source?.packageVersion;
  if (!packageName || !packageVersion) {
    throw new Error(`missing packageName/packageVersion in ${ompBuiltinsSourcePath}`);
  }
  return { packageName, packageVersion };
}

async function fetchLatestDistTag(packageName) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const url = `https://registry.npmjs.org/-/package/${encodeURIComponent(packageName)}/dist-tags`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`registry HTTP ${response.status}`);
    }
    const tags = await response.json();
    const latest = tags?.latest;
    if (!latest || typeof latest !== "string") {
      throw new Error("missing latest dist-tag");
    }
    return latest;
  } finally {
    clearTimeout(timer);
  }
}

function printVerdictLine(verdict, pinned, latest) {
  console.log(`verdict=${verdict} pinned=${pinned} latest=${latest}`);
}

async function main() {
  const { packageName, packageVersion: pinned } = loadPinnedSnapshot();
  let latest = "unknown";
  let verdict = "UNKNOWN";

  console.log("OMP snapshot drift radar");
  console.log(`package: ${packageName}`);
  console.log(`pinned:  ${pinned}`);

  try {
    latest = await fetchLatestDistTag(packageName);
    console.log(`latest:  ${latest}`);
    const comparison = compareSemver(pinned, latest);
    if (comparison === 0) {
      verdict = "CURRENT";
      console.log("status:  pinned matches npm latest");
    } else {
      verdict = "DRIFT";
      console.log(
        comparison < 0
          ? "status:  snapshot pin is behind npm latest"
          : "status:  snapshot pin is ahead of npm latest",
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log("latest:  (unavailable)");
    console.log(`status:  could not reach npm registry (${message})`);
    verdict = "UNKNOWN";
    latest = "unknown";
  }

  printVerdictLine(verdict, pinned, latest);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    printVerdictLine("UNKNOWN", "unknown", "unknown");
    process.exit(0);
  });
