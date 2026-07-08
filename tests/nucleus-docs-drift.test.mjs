import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  evaluateNucleusDocsDrift,
  validateDocumentedCommands,
  validateNoActiveStalePaths,
} from "../scripts/validate-nucleus-docs-drift.mjs";

function makeFixture() {
  const root = path.join(tmpdir(), `nucleus-docs-drift-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(path.join(root, "docs/operator"), { recursive: true });
  mkdirSync(path.join(root, "docs/skills"), { recursive: true });
  mkdirSync(path.join(root, "skills/bus-first"), { recursive: true });
  mkdirSync(path.join(root, "scripts"), { recursive: true });
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "loom", scripts: { check: "npm run validate", validate: "node scripts/validate-skills.mjs", test: "node --test tests/*.test.mjs" } }, null, 2));
  writeFileSync(path.join(root, "README.md"), "# Loom\n\n```sh\nnpm run check\n```\n");
  writeFileSync(path.join(root, "docs/operator/daily-workflow.md"), "```sh\nnpm run check\n```\n");
  writeFileSync(path.join(root, "docs/skills/factorio-kit.md"), "This manifest is the build envelope, not an active adapter template. Its roster is validated against committed `skills/` by `npm run check`.\n\n## Skill table\n\n| Skill | Factorio | Does | Linear | GitHub | Status | Replaces / Reuses |\n|---|---|---|---|---|---|---|\n| `bus-first` | bus | does | — | — | MVP | new |\n\n## MVP skill contracts\n");
  writeFileSync(path.join(root, "skills/bus-first/SKILL.md"), "---\nname: bus-first\ndescription: Use when testing\n---\n");
  return root;
}

test("docs drift validator passes minimal aligned docs", () => {
  const root = makeFixture();
  try {
    assert.deepEqual(evaluateNucleusDocsDrift({ root, skillsRoot: "skills" }).failures, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("docs drift validator catches stale active source paths outside superseded history", () => {
  const root = makeFixture();
  try {
    writeFileSync(path.join(root, "README.md"), "Edit active source in `omp/.omp/agent/AGENTS.md`.\n");
    const failures = validateNoActiveStalePaths({ root, docPaths: ["README.md", "docs/operator"] });
    assert.ok(failures.some((failure) => failure.includes("old OMP tracked source root")), failures.join("\n"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("docs drift validator catches command drift from package.json", () => {
  const root = makeFixture();
  try {
    writeFileSync(path.join(root, "docs/operator/daily-workflow.md"), "```sh\nnpm run stale-command\n```\n");
    const failures = validateDocumentedCommands({ root });
    assert.ok(failures.some((failure) => failure.includes("stale-command")), failures.join("\n"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
