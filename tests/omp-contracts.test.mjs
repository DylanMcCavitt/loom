import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  COMMAND_REGISTRY_MARKER,
  PACKAGE_LAYOUT,
  PACKAGE_NAME,
  assertPackageLayout,
  assertRegistryMarker,
  discoverPackageRoot,
  parseCliPackageVersion,
} from "../scripts/lib/omp-package-contract.mjs";
import {
  SESSION_FILENAME,
  defaultSessionsDir,
  parseSessionFilename,
  sessionContractStaleError,
} from "../scripts/lib/omp-session-contract.mjs";

// --- package contract -------------------------------------------------------------------------

function fakePackageRoot() {
  const root = mkdtempSync(path.join(tmpdir(), "omp-pkg-contract-"));
  for (const relative of Object.values(PACKAGE_LAYOUT)) {
    const absolute = path.join(root, relative);
    if (relative.endsWith(".ts")) {
      mkdirSync(path.dirname(absolute), { recursive: true });
      writeFileSync(absolute, `${COMMAND_REGISTRY_MARKER} = [];\n`);
    } else {
      mkdirSync(absolute, { recursive: true });
    }
  }
  return root;
}

test("assertPackageLayout resolves every contract path against a complete fake package", () => {
  const root = fakePackageRoot();
  try {
    const layout = assertPackageLayout(root);
    assert.deepEqual(Object.keys(layout).sort(), Object.keys(PACKAGE_LAYOUT).sort());
    for (const [key, relative] of Object.entries(PACKAGE_LAYOUT)) {
      assert.equal(layout[key], path.join(root, relative));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("assertPackageLayout fails a moved layout with an actionable stale-contract error", () => {
  const root = fakePackageRoot();
  try {
    // Simulate an upstream refactor: the registry file moved away.
    rmSync(path.join(root, PACKAGE_LAYOUT.commandRegistry));
    rmSync(path.join(root, PACKAGE_LAYOUT.builtinRulesRoot), { recursive: true });
    assert.throws(
      () => assertPackageLayout(root),
      (error) => {
        assert.match(error.message, /contract may be stale/u);
        assert.match(error.message, /omp\/16\.3\.5/u);
        assert.ok(error.message.includes(PACKAGE_LAYOUT.commandRegistry), "lists the missing registry file");
        assert.ok(error.message.includes(PACKAGE_LAYOUT.builtinRulesRoot), "lists the missing rules root");
        assert.match(error.message, /omp-package-contract\.mjs/u, "names the file to re-verify");
        assert.ok(error.message.includes(PACKAGE_NAME));
        return true;
      },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("assertRegistryMarker treats a missing registry marker as a contract miss", () => {
  assert.throws(
    () => assertRegistryMarker("export const SOMETHING_ELSE = [];\n"),
    /contract may be stale/u,
  );
  assert.doesNotThrow(() => assertRegistryMarker(`${COMMAND_REGISTRY_MARKER} = [];\n`));
});

// --- session contract -------------------------------------------------------------------------

test("parseSessionFilename accepts the omp session naming scheme and normalizes the id", () => {
  const parsed = parseSessionFilename("2026-07-02T04-00-00_0197B2E4-9F1C-7D3A-8000-ABCDEF012345.jsonl");
  assert.deepEqual(parsed, {
    timestamp: "2026-07-02T04-00-00",
    sessionId: "0197b2e4-9f1c-7d3a-8000-abcdef012345",
  });
});

test("parseSessionFilename returns null for non-session names", () => {
  for (const name of [
    "notes.jsonl",
    "0197b2e4-9f1c-7d3a-8000-abcdef012345.jsonl", // no timestamp segment
    "ts_0197b2e4-9f1c-7d3a-8000-abcdef012345.json", // wrong extension
    "ts_0197b2e4.jsonl", // truncated uuid
  ]) {
    assert.equal(parseSessionFilename(name), null, name);
  }
});

test("session contract owns the layout literal, regex, and default root", () => {
  assert.ok(SESSION_FILENAME instanceof RegExp);
  assert.ok(defaultSessionsDir().endsWith(path.join(".omp", "agent", "sessions")));
  const error = sessionContractStaleError("weird-name.jsonl");
  assert.match(error.message, /contract may be stale/u);
  assert.match(error.message, /omp\/16\.0\.5/u);
  assert.match(error.message, /omp-session-contract\.mjs/u, "names the file to re-verify");
  assert.ok(error.message.includes("weird-name.jsonl"));
});

// --- package-root discovery --------------------------------------------------------------------

const CLI_VERSION_TEXT = "omp/16.3.0";
const CLI_VERSION = "16.3.0";

function writePackageJson(dir, pkg) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "package.json"), `${JSON.stringify(pkg)}\n`);
}

// Isolated fake home per test so the real machine's ~/.bun can never satisfy the fallback.
function discoveryFixture() {
  const fixture = mkdtempSync(path.join(tmpdir(), "omp-pkg-discovery-"));
  const home = path.join(fixture, "home");
  mkdirSync(home, { recursive: true });
  return { fixture, home };
}

test("parseCliPackageVersion extracts the semver token from omp --version output", () => {
  for (const [input, expected] of [
    ["omp/16.3.0", "16.3.0"],
    ["omp v16.3.0", "16.3.0"],
    ["garbage", null],
    [undefined, null],
  ]) {
    assert.equal(parseCliPackageVersion(input), expected, String(input));
  }
});

test("discoverPackageRoot rejects package roots when the CLI version cannot be parsed", () => {
  const { fixture, home } = discoveryFixture();
  try {
    const packageDir = path.join(fixture, "checkout", "packages", "coding-agent");
    writePackageJson(packageDir, { name: PACKAGE_NAME, version: CLI_VERSION });
    assert.throws(
      () =>
        discoverPackageRoot({
          ompBinaryPath: path.join(fixture, "opt", "bin", "omp"),
          cliVersionText: "garbage",
          env: { PI_PACKAGE_DIR: packageDir },
          home,
        }),
      (error) => {
        assert.match(error.message, /could not parse CLI version/u);
        assert.ok(error.message.includes(`PI_PACKAGE_DIR: ${packageDir}`));
        return true;
      },
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("discoverPackageRoot honors PI_PACKAGE_DIR when name and version match the CLI", () => {
  const { fixture, home } = discoveryFixture();
  try {
    const packageDir = path.join(fixture, "checkout", "packages", "coding-agent");
    writePackageJson(packageDir, { name: PACKAGE_NAME, version: CLI_VERSION });
    const root = discoverPackageRoot({
      ompBinaryPath: path.join(fixture, "opt", "bin", "omp"),
      cliVersionText: CLI_VERSION_TEXT,
      env: { PI_PACKAGE_DIR: packageDir },
      home,
    });
    assert.equal(root, packageDir);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("discoverPackageRoot rejects a PI_PACKAGE_DIR whose version disagrees with the CLI", () => {
  const { fixture, home } = discoveryFixture();
  try {
    const packageDir = path.join(fixture, "stale-checkout");
    writePackageJson(packageDir, { name: PACKAGE_NAME, version: "15.0.0" });
    assert.throws(
      () =>
        discoverPackageRoot({
          ompBinaryPath: path.join(fixture, "opt", "bin", "omp"),
          cliVersionText: CLI_VERSION_TEXT,
          env: { PI_PACKAGE_DIR: packageDir },
          home,
        }),
      (error) => {
        assert.ok(
          error.message.includes(`PI_PACKAGE_DIR: ${packageDir}`),
          "names the PI_PACKAGE_DIR strategy with the rejected path",
        );
        assert.match(error.message, /package version 15\.0\.0 does not match CLI version 16\.3\.0/u);
        return true;
      },
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("discoverPackageRoot expands a ~/ PI_PACKAGE_DIR against the injected home", () => {
  const { fixture, home } = discoveryFixture();
  try {
    const packageDir = path.join(home, "oh-my-pi", "packages", "coding-agent");
    writePackageJson(packageDir, { name: PACKAGE_NAME, version: CLI_VERSION });
    const root = discoverPackageRoot({
      ompBinaryPath: path.join(fixture, "opt", "bin", "omp"),
      cliVersionText: CLI_VERSION_TEXT,
      env: { PI_PACKAGE_DIR: "~/oh-my-pi/packages/coding-agent" },
      home,
    });
    assert.equal(root, packageDir);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("discoverPackageRoot walks up from the omp binary to a matching package root", () => {
  const { fixture, home } = discoveryFixture();
  try {
    const packageRoot = path.join(fixture, "node_modules", ...PACKAGE_NAME.split("/"));
    writePackageJson(packageRoot, { name: PACKAGE_NAME, version: CLI_VERSION });
    mkdirSync(path.join(packageRoot, "bin"), { recursive: true });
    const root = discoverPackageRoot({
      ompBinaryPath: path.join(packageRoot, "bin", "omp"),
      cliVersionText: CLI_VERSION_TEXT,
      env: {},
      home,
    });
    assert.equal(root, packageRoot);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("discoverPackageRoot aborts the walk-up at a same-name package with the wrong version", () => {
  const { fixture, home } = discoveryFixture();
  try {
    // An ancestor with the right version must NOT be reached past a wrong-version name match:
    // returning it would scrape stale source while labeling it with the live CLI version.
    const outer = path.join(fixture, "checkout");
    writePackageJson(outer, { name: PACKAGE_NAME, version: CLI_VERSION });
    const nested = path.join(outer, "vendored");
    writePackageJson(nested, { name: PACKAGE_NAME, version: "15.0.0" });
    assert.throws(
      () =>
        discoverPackageRoot({
          ompBinaryPath: path.join(nested, "bin", "omp"),
          cliVersionText: CLI_VERSION_TEXT,
          env: {},
          home,
        }),
      (error) => {
        assert.ok(
          error.message.includes(`${nested}: package version 15.0.0 does not match CLI version 16.3.0`),
          "walk-up reason names the aborting directory and the version mismatch",
        );
        return true;
      },
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("discoverPackageRoot falls back to the bun global install under the injected home", () => {
  const { fixture, home } = discoveryFixture();
  try {
    const bunPackageDir = path.join(
      home,
      ".bun",
      "install",
      "global",
      "node_modules",
      ...PACKAGE_NAME.split("/"),
    );
    writePackageJson(bunPackageDir, { name: PACKAGE_NAME, version: CLI_VERSION });
    const root = discoverPackageRoot({
      ompBinaryPath: path.join(fixture, "opt", "bin", "omp"),
      cliVersionText: CLI_VERSION_TEXT,
      env: {},
      home,
    });
    assert.equal(root, bunPackageDir);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("discoverPackageRoot prefers $BUN_INSTALL over home/.bun for the bun global fallback", () => {
  const { fixture, home } = discoveryFixture();
  try {
    const bunInstall = path.join(fixture, "custom-bun");
    const bunPackageDir = path.join(
      bunInstall,
      "install",
      "global",
      "node_modules",
      ...PACKAGE_NAME.split("/"),
    );
    writePackageJson(bunPackageDir, { name: PACKAGE_NAME, version: CLI_VERSION });
    // A stale package under home/.bun proves BUN_INSTALL takes precedence rather than merely existing.
    writePackageJson(
      path.join(home, ".bun", "install", "global", "node_modules", ...PACKAGE_NAME.split("/")),
      { name: PACKAGE_NAME, version: "15.0.0" },
    );
    const root = discoverPackageRoot({
      ompBinaryPath: path.join(fixture, "opt", "bin", "omp"),
      cliVersionText: CLI_VERSION_TEXT,
      env: { BUN_INSTALL: bunInstall },
      home,
    });
    assert.equal(root, bunPackageDir);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("discoverPackageRoot failure names every strategy, its reason, and the PI_PACKAGE_DIR fix", () => {
  const { fixture, home } = discoveryFixture();
  try {
    const ompBinaryPath = path.join(fixture, "opt", "homebrew", "bin", "omp");
    assert.throws(
      () => discoverPackageRoot({ ompBinaryPath, cliVersionText: CLI_VERSION_TEXT, env: {}, home }),
      (error) => {
        assert.ok(error instanceof Error);
        assert.match(
          error.message,
          /PI_PACKAGE_DIR: \(unset\) \(environment variable not set\)/u,
          "lists the PI_PACKAGE_DIR attempt",
        );
        assert.ok(
          error.message.includes(
            `walk-up from omp binary: ${ompBinaryPath} (no ${PACKAGE_NAME} package.json in any parent directory)`,
          ),
          "lists the walk-up attempt with its reason",
        );
        const bunDir = path.join(
          home,
          ".bun",
          "install",
          "global",
          "node_modules",
          ...PACKAGE_NAME.split("/"),
        );
        assert.ok(
          error.message.includes(`bun global install: ${bunDir} (directory does not exist)`),
          "lists the bun global attempt with its reason",
        );
        assert.match(error.message, /Set PI_PACKAGE_DIR/u, "tells the operator the fix");
        return true;
      },
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
