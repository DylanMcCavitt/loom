import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("package.json wires the nucleus dry-run and gated install scripts", () => {
  assert.equal(pkg.scripts["render-nucleus"], "node scripts/render-nucleus.mjs");
  assert.equal(pkg.scripts["install-nucleus"], "node scripts/render-nucleus.mjs --write");
});

test("the wired render-nucleus dry-run reports appliable candidates against a fake HOME", () => {
  // Execute the exact command the `render-nucleus` npm script wraps, so this test exercises the
  // script wiring rather than a hand-built invocation. The dry-run is the default (no --write).
  const wired = pkg.scripts["render-nucleus"].split(" ");
  assert.equal(wired[0], "node");
  const scriptArgs = wired.slice(1);

  const fakeHome = mkdtempSync(path.join(tmpdir(), "install-command-home-"));
  try {
    const result = spawnSync(
      process.execPath,
      [...scriptArgs, "--home", fakeHome, "--json"],
      { cwd: repoRoot, encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(result.stdout);
    assert.equal(manifest.mode, "dry-run");
    assert.equal(manifest.result, "pass");
    assert.ok(
      manifest.counts.appliable > 0,
      `expected appliable candidates, got ${JSON.stringify(manifest.counts)}`,
    );
  } finally {
    rmSync(fakeHome, { recursive: true, force: true });
  }
});
