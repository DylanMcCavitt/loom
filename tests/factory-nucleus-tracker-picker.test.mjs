import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { trackerPicker } from "../scripts/factory-nucleus/tracker-picker.mjs";

const factoryCli = new URL("../scripts/factory-nucleus/factory.mjs", import.meta.url).pathname;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

function withRepo(callback) {
  const root = mkdtempSync(path.join(tmpdir(), "factory-picker-repo-"));
  try {
    mkdirSync(path.join(root, "src"));
    writeFileSync(path.join(root, "src", "index.js"), "console.log('picker');\n");
    run("git", ["init", "-q", "-b", "main"], { cwd: root });
    run("git", ["add", "."], { cwd: root });
    run("git", ["-c", "user.email=factory@example.invalid", "-c", "user.name=Factory Test", "commit", "-q", "-m", "initial"], { cwd: root });
    callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("tracker picker presents Linear and GitHub without selecting a default", () => {
  withRepo((root) => {
    run("git", ["remote", "add", "origin", "git@github.com:acme/widgets.git"], { cwd: root });
    const picker = trackerPicker({ root });

    assert.equal(picker.options.map((option) => option.provider).join(","), "linear,github");
    assert.match(picker.nextStep, /Ask the user which tracker/u);
    assert.match(picker.nextStep, /Do not infer/u);
    assert.equal(picker.options.find((option) => option.provider === "github").detectedRepo, "acme/widgets");
    assert.match(picker.options.find((option) => option.provider === "linear").command, /--provider linear/u);
  });
});

test("choose-tracker CLI is prose by default and JSON on request", () => {
  withRepo((root) => {
    const prose = run(process.execPath, [factoryCli, "choose-tracker", "--root", root]);
    assert.match(prose.stdout, /Factory tracker picker/u);
    assert.match(prose.stdout, /No tracker is selected by default/u);
    assert.match(prose.stdout, /npm run factory -- bind-tracker --provider linear/u);

    const json = run(process.execPath, [factoryCli, "choose-tracker", "--root", root, "--json"]);
    const parsed = JSON.parse(json.stdout);
    assert.equal(parsed.options.length, 2);
    assert.equal(parsed.options[0].provider, "linear");
    assert.equal(parsed.options[1].provider, "github");
  });
});
