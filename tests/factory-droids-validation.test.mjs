import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import path from "node:path";
import { tmpdir } from "node:os";

import { validateFactoryDroids } from "../scripts/validate-factory-droids.mjs";

const script = new URL("../scripts/validate-factory-droids.mjs", import.meta.url).pathname;
const sourceDroidsDir = new URL("../.factory/droids", import.meta.url);
const contract = JSON.parse(readFileSync(new URL("../nucleus/agents/shared-nucleus-agents.json", import.meta.url), "utf8"));

function withDroidFixture(callback) {
  const dir = mkdtempSync(path.join(tmpdir(), "factory-droids-"));
  try {
    const droidsDir = path.join(dir, "droids");
    cpSync(sourceDroidsDir, droidsDir, { recursive: true });
    return callback(droidsDir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function readDroid(droidsDir, name) {
  return readFileSync(path.join(droidsDir, `${name}.md`), "utf8");
}

function writeDroid(droidsDir, name, content) {
  writeFileSync(path.join(droidsDir, `${name}.md`), content);
}

test("factory droid validator passes for checked-in droids", () => {
  const result = spawnSync(process.execPath, [script], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`Factory droid checks passed: ${contract.agents.length} droids, max body \\d+ chars`, "u"));

  const directResult = validateFactoryDroids();
  assert.deepEqual(directResult.failures, []);
  assert.equal(directResult.droidsChecked, contract.agents.length);
});

test("factory droid validator fails when a droid is missing", () => {
  withDroidFixture((droidsDir) => {
    unlinkSync(path.join(droidsDir, "blueprint.md"));

    const result = validateFactoryDroids({ droidsDir });
    assert.ok(
      result.failures.some((failure) => failure.includes("missing factory droid blueprint.md")),
      result.failures.join("\n"),
    );
  });
});

test("factory droid validator fails when an extra droid file exists", () => {
  withDroidFixture((droidsDir) => {
    writeFileSync(path.join(droidsDir, "extra.md"), "---\nname: extra\n---\n");

    const result = validateFactoryDroids({ droidsDir });
    assert.ok(
      result.failures.some((failure) => failure.includes("unexpected factory droid entry extra.md")),
      result.failures.join("\n"),
    );
  });
});

test("factory droid validator fails when frontmatter name diverges", () => {
  withDroidFixture((droidsDir) => {
    writeDroid(droidsDir, "blueprint", readDroid(droidsDir, "blueprint").replace("name: blueprint", "name: factory-blueprint"));

    const result = validateFactoryDroids({ droidsDir });
    assert.ok(
      result.failures.some((failure) => failure.includes("blueprint.md: frontmatter name must be blueprint, got factory-blueprint")),
      result.failures.join("\n"),
    );
  });
});

test("factory droid validator fails when a canonical path reference is missing", () => {
  withDroidFixture((droidsDir) => {
    writeDroid(
      droidsDir,
      "blueprint",
      readDroid(droidsDir, "blueprint").replace("nucleus/skills/blueprint/SKILL.md", "nucleus/skills/planner/SKILL.md"),
    );

    const result = validateFactoryDroids({ droidsDir });
    assert.ok(
      result.failures.some((failure) => failure.includes("blueprint.md: body must reference nucleus/skills/blueprint/SKILL.md")),
      result.failures.join("\n"),
    );
  });
});

test("factory droid validator fails when body grows beyond thin-router cap", () => {
  withDroidFixture((droidsDir) => {
    writeDroid(droidsDir, "blueprint", `${readDroid(droidsDir, "blueprint")}\n${"x".repeat(3500)}`);

    const result = validateFactoryDroids({ droidsDir });
    assert.ok(
      result.failures.some((failure) => failure.includes("blueprint.md: body must stay under 3500 chars")),
      result.failures.join("\n"),
    );
  });
});
