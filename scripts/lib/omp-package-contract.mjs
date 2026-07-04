// Contract seam for the @oh-my-pi/pi-coding-agent package's INTERNAL source layout.
//
// Everything the snapshot refresh scrapes from inside the installed package lives here:
// the package name, the internal source paths, and the registry marker. Upstream owes us
// none of this — any omp refactor can move these files, so a miss must fail loudly with
// what to re-verify instead of silently producing an empty snapshot.
//
// Observed upstream version: omp/16.3.5 (@oh-my-pi/pi-coding-agent 16.3.5).

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export const OMP_PACKAGE_CONTRACT_VERSION = "omp/16.3.5";

// Bundled agent set for omp/16.3.5.
// `Tester` is capitalized; byte-sort puts it first.
export const EXPECTED_AGENTS = ["Tester", "designer", "explore", "librarian", "plan", "reviewer", "sonic", "task"];

export const PACKAGE_NAME = "@oh-my-pi/pi-coding-agent";

// Internal source files/roots the refresh scrapes, relative to the package root.
export const PACKAGE_LAYOUT = {
  commandRegistry: "src/slash-commands/builtin-registry.ts",
  availableCommands: "src/slash-commands/available-commands.ts",
  acpBuiltins: "src/slash-commands/acp-builtins.ts",
  promptsRoot: "src/prompts",
  builtinRulesRoot: "src/discovery/builtin-rules",
};

// Marker preceding the builtin slash-command array inside `commandRegistry`.
export const COMMAND_REGISTRY_MARKER = "const BUILTIN_SLASH_COMMAND_REGISTRY";

export function contractStaleError(missing) {
  return new Error(
    [
      `omp package contract may be stale (observed ${OMP_PACKAGE_CONTRACT_VERSION}; installed layout differs).`,
      `Missing inside the installed ${PACKAGE_NAME} package:`,
      ...missing.map(item => `  - ${item}`),
      "Re-verify scripts/lib/omp-package-contract.mjs against the installed package source",
      "(paths in PACKAGE_LAYOUT and the COMMAND_REGISTRY_MARKER), then update the contract.",
    ].join("\n"),
  );
}

// Assert every contract path exists under `packageRoot`; throw the actionable stale error
// listing each miss. Returns absolute paths keyed like PACKAGE_LAYOUT for the happy path.
export function assertPackageLayout(packageRoot) {
  const resolved = {};
  const missing = [];
  for (const [key, relative] of Object.entries(PACKAGE_LAYOUT)) {
    const absolute = path.join(packageRoot, relative);
    if (existsSync(absolute)) {
      resolved[key] = absolute;
    } else {
      missing.push(relative);
    }
  }
  if (missing.length > 0) throw contractStaleError(missing);
  return resolved;
}

// Locate the registry marker in the registry source; a miss is a contract miss, not a
// generic parse error.
export function assertRegistryMarker(registrySource) {
  if (!registrySource.includes(COMMAND_REGISTRY_MARKER)) {
    throw contractStaleError([`marker "${COMMAND_REGISTRY_MARKER}" in ${PACKAGE_LAYOUT.commandRegistry}`]);
  }
}

// --- package-root discovery ---------------------------------------------------------------------
//
// The CLI binary is no longer guaranteed to live inside the package (the current install is a
// standalone compiled binary in /opt/homebrew/bin with no node_modules nearby). Discovery therefore
// tries an ordered list of strategies and, because any on-disk package is now a separate artifact
// from the running binary, every candidate must match BOTH the package name and the CLI version —
// otherwise the refresh would scrape stale source while labeling it with the live CLI version.

// Parse the numeric package version out of `omp --version` output (e.g. "omp/16.3.0" or "omp v16.3.0").
export function parseCliPackageVersion(cliVersionText) {
  const match = /(\d+\.\d+\.\d+\S*)/.exec(cliVersionText ?? "");
  return match ? match[1] : null;
}

function expandTilde(dir, home) {
  if (dir === "~") return home;
  if (dir.startsWith("~/")) return path.join(home, dir.slice(2));
  return dir;
}

// Validate one candidate directory. Returns { ok: true } or { ok: false, reason }.
function inspectCandidate(dir, cliPackageVersion) {
  if (!existsSync(dir)) return { ok: false, reason: "directory does not exist" };
  const packageJsonPath = path.join(dir, "package.json");
  if (!existsSync(packageJsonPath)) return { ok: false, reason: "no package.json" };
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  } catch {
    return { ok: false, reason: "unreadable package.json" };
  }
  if (pkg.name !== PACKAGE_NAME) {
    return { ok: false, reason: `package.json name is ${pkg.name ?? "(unset)"}, not ${PACKAGE_NAME}` };
  }
  if (!cliPackageVersion) return { ok: false, reason: "could not parse CLI version" };
  if (pkg.version !== cliPackageVersion) {
    return { ok: false, reason: `package version ${pkg.version} does not match CLI version ${cliPackageVersion}` };
  }
  return { ok: true };
}

export function packageRootDiscoveryError({ ompBinaryPath, cliVersionText, attempts }) {
  return new Error(
    [
      `Could not find the ${PACKAGE_NAME} package root for ${cliVersionText} (omp binary: ${ompBinaryPath}).`,
      "Strategies tried:",
      ...attempts.map(attempt => `  - ${attempt.strategy}: ${attempt.path} (${attempt.reason})`),
      `Set PI_PACKAGE_DIR to a ${PACKAGE_NAME} package root matching the CLI version`,
      "(e.g. packages/coding-agent inside an oh-my-pi checkout), or re-verify",
      "scripts/lib/omp-package-contract.mjs (discovery strategies and PACKAGE_LAYOUT).",
    ].join("\n"),
  );
}

// Locate the installed package root. Strategies, in order:
//   1. PI_PACKAGE_DIR — omp's own package-directory override env var.
//   2. Walk up from the resolved omp binary (bun-global installs keep the package above the shim).
//   3. The bun global install directory (the layout the original snapshot was captured from).
// Reads package source directories only — never sessions, auth, or caches.
export function discoverPackageRoot({ ompBinaryPath, cliVersionText, env = process.env, home = homedir() }) {
  const cliPackageVersion = parseCliPackageVersion(cliVersionText);
  const attempts = [];

  const override = env.PI_PACKAGE_DIR;
  if (override) {
    const dir = path.resolve(expandTilde(override, home));
    const result = inspectCandidate(dir, cliPackageVersion);
    if (result.ok) return dir;
    attempts.push({ strategy: "PI_PACKAGE_DIR", path: dir, reason: result.reason });
  } else {
    attempts.push({ strategy: "PI_PACKAGE_DIR", path: "(unset)", reason: "environment variable not set" });
  }

  let current = path.dirname(ompBinaryPath);
  let walkReason = `no ${PACKAGE_NAME} package.json in any parent directory`;
  while (current !== path.dirname(current)) {
    const result = inspectCandidate(current, cliPackageVersion);
    if (result.ok) return current;
    if (result.reason.startsWith("package version")) {
      walkReason = `${current}: ${result.reason}`;
      break;
    }
    current = path.dirname(current);
  }
  attempts.push({ strategy: "walk-up from omp binary", path: ompBinaryPath, reason: walkReason });

  const bunInstall = env.BUN_INSTALL || path.join(home, ".bun");
  const bunDir = path.join(bunInstall, "install", "global", "node_modules", ...PACKAGE_NAME.split("/"));
  const bunResult = inspectCandidate(bunDir, cliPackageVersion);
  if (bunResult.ok) return bunDir;
  attempts.push({ strategy: "bun global install", path: bunDir, reason: bunResult.reason });

  throw packageRootDiscoveryError({ ompBinaryPath, cliVersionText, attempts });
}
