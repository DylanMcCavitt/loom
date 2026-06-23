import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { redactSecrets, scanFactory } from "../scripts/factory-nucleus/scan.mjs";
import { GOLDEN_FACTORY_FILES, GOLDEN_FACTORY_PATHS, materializeGoldenFactory } from "./fixtures/golden-factory.mjs";

const generatedAt = "2026-06-23T00:00:00.000Z";

test("golden factory fixture has package scripts, source, test, and CI shape", () => {
  assert.deepEqual(GOLDEN_FACTORY_PATHS, [
    ".github/workflows/ci.yml",
    "README.md",
    "package.json",
    "src/index.mjs",
    "test/index.test.mjs",
  ]);

  const pkg = JSON.parse(GOLDEN_FACTORY_FILES["package.json"]);
  assert.equal(pkg.name, "golden-factory");
  for (const kind of ["build", "test", "lint"]) {
    assert.equal(typeof pkg.scripts[kind], "string");
    assert.ok(pkg.scripts[kind].length > 0, `expected a ${kind} script`);
  }
  assert.match(GOLDEN_FACTORY_FILES["test/index.test.mjs"], /node:test/u);
  assert.match(GOLDEN_FACTORY_FILES[".github/workflows/ci.yml"], /jobs:/u);
});

test("golden factory fixture is small and synthetic with no secrets", () => {
  const totalBytes = Object.values(GOLDEN_FACTORY_FILES).reduce((sum, content) => sum + Buffer.byteLength(content), 0);
  assert.ok(totalBytes < 4096, `fixture should stay tiny, got ${totalBytes} bytes`);

  for (const [relativePath, content] of Object.entries(GOLDEN_FACTORY_FILES)) {
    assert.equal(redactSecrets(content), content, `secret-looking value in ${relativePath}`);
    assert.doesNotMatch(content, /\/(?:Users|home)\/[^/\s]+/u, `private home path in ${relativePath}`);
  }
});

test("golden factory loader materializes exactly the expected files", () => {
  const root = mkdtempSync(path.join(tmpdir(), "golden-factory-"));
  try {
    const written = materializeGoldenFactory(root);
    assert.deepEqual(written, GOLDEN_FACTORY_PATHS);
    for (const relativePath of GOLDEN_FACTORY_PATHS) {
      const filePath = path.join(root, relativePath);
      assert.ok(existsSync(filePath), `expected ${relativePath} on disk`);
      assert.equal(readFileSync(filePath, "utf8"), GOLDEN_FACTORY_FILES[relativePath]);
    }
    assert.throws(() => materializeGoldenFactory(""), /destination root is required/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("materialized golden factory scans as a clean Node factory", () => {
  const root = mkdtempSync(path.join(tmpdir(), "golden-factory-scan-"));
  try {
    materializeGoldenFactory(root);
    // Commit into a self-contained repo so scanFactory resolves this tree (not an enclosing checkout).
    spawnSync("git", ["init", "-q", "-b", "main"], { cwd: root, encoding: "utf8" });
    spawnSync("git", ["add", "."], { cwd: root, encoding: "utf8" });
    spawnSync("git", ["-c", "user.email=factory@example.invalid", "-c", "user.name=Factory Test", "commit", "-q", "-m", "golden factory"], { cwd: root, encoding: "utf8" });
    const scan = scanFactory({ root, generatedAt });

    assert.ok(scan.stack.some((entry) => entry.name === "node"), "expected a detected node stack");
    assert.equal(scan.commands.build.status, "found");
    assert.equal(scan.commands.test.status, "found");
    assert.equal(scan.commands.lint.status, "found");
    // Clean Node repo with build/test/lint and a CI workflow but no envelope -> green diagnostic science.
    assert.equal(scan.science.level, "green");
    assert.ok(scan.science.missingUnlocks.includes("factory envelope"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
