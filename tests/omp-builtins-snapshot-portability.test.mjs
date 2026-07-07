import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import {
  MACHINE_SPECIFIC_PATH_PREFIXES,
  SNAPSHOT_EPHEMERAL_PACKAGE_ROOT,
  assertPortableSnapshotText,
  findMachineSpecificPathViolations,
  portablePackageSourcePaths,
  portablePathUnderPackage,
} from "../scripts/lib/omp-package-contract.mjs";

const snapshotDir = new URL("../distributions/snapshots/omp-builtins/", import.meta.url).pathname;
const tmpFixturePath = new URL("./fixtures/omp-builtins-snapshot-machine-path.json", import.meta.url).pathname;

test("machine-specific path guard rejects /tmp fixture", () => {
  const fixture = readFileSync(tmpFixturePath, "utf8");
  const violations = findMachineSpecificPathViolations(fixture);
  assert.ok(violations.some(violation => violation.prefix === "/tmp/"));
});

test("machine-specific path guard accepts ephemeral-package-root sentinel", () => {
  const fixture = JSON.stringify(
    {
      source: {
        packageRoot: SNAPSHOT_EPHEMERAL_PACKAGE_ROOT,
        packageJsonPath: `${SNAPSHOT_EPHEMERAL_PACKAGE_ROOT}/package.json`,
      },
    },
    null,
    2,
  );
  assert.equal(findMachineSpecificPathViolations(fixture).length, 0);
});

test("portable snapshot helpers normalize package paths under sentinel root", () => {
  const packageRoot = "/tmp/omp-16.3.11-pkg/package";
  assert.deepEqual(portablePackageSourcePaths(), {
    packageRoot: SNAPSHOT_EPHEMERAL_PACKAGE_ROOT,
    packageJsonPath: `${SNAPSHOT_EPHEMERAL_PACKAGE_ROOT}/package.json`,
  });
  assert.equal(
    portablePathUnderPackage(packageRoot, `${packageRoot}/src/slash-commands/builtin-registry.ts`),
    `${SNAPSHOT_EPHEMERAL_PACKAGE_ROOT}/src/slash-commands/builtin-registry.ts`,
  );
});

test("portable snapshot write guard refuses machine-specific JSON text", () => {
  const leaked = JSON.stringify({ source: { packageRoot: "/tmp/omp-16.3.11-pkg/package" } }, null, 2);
  assert.throws(
    () => assertPortableSnapshotText("source.json", leaked),
    /refuses to emit machine-specific path prefixes/u,
  );
});

test("committed snapshot JSONs are free of machine-specific path prefixes", () => {
  for (const file of readdirSync(snapshotDir).filter(name => name.endsWith(".json"))) {
    const text = readFileSync(path.join(snapshotDir, file), "utf8");
    assert.equal(findMachineSpecificPathViolations(text).length, 0, file);
  }
});

test("machine-specific path prefix list matches LOO-194 contract", () => {
  assert.deepEqual([...MACHINE_SPECIFIC_PATH_PREFIXES], [
    "/tmp/",
    "/private/tmp/",
    "/Users/",
    "/home/",
    "~/.bun",
    "C:\\",
  ]);
});
