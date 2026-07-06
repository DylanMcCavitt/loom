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

function writeResourceManifest(root) {
  writeFileSync(path.join(root, "docs/harness/resource-manifest.json"), JSON.stringify({
    schemaVersion: 1,
    allowedDispositions: ["track", "adapt", "reference-only", "local-only"],
    resources: [
      {
        id: "omp-user-project-resources",
        sourceHarness: "omp",
        resourceCategory: "user/project resources and workflow kit",
        currentLivePath: ["~/.omp/agent/workflow-kit/", "repo:adapters/omp/source/config.yml"],
        intendedRepoTarget: "adapters/omp/source/ and docs/harness/omp/",
        disposition: "track",
        migrationNotes: "Track declarative config and workflow-kit guidance only.",
      },
      {
        id: "omp-personal-local-overrides",
        sourceHarness: "omp",
        resourceCategory: "personal local config overlay",
        currentLivePath: ["~/.omp/agent/*.local.yml"],
        intendedRepoTarget: "none",
        disposition: "local-only",
        migrationNotes: "Local overlays are never tracked, read, or copied by renderers.",
      },
      {
        id: "omp-runtime-state",
        sourceHarness: "omp",
        resourceCategory: "runtime sessions, database files, blobs, terminal state, cache, logs, and private history",
        currentLivePath: ["~/.omp/agent/sessions/", "~/.omp/agent/*.sqlite"],
        intendedRepoTarget: "none",
        disposition: "local-only",
        migrationNotes: "Runtime state stays local; dry runs may report presence by path pattern only.",
      },
    ],
  }, null, 2));
}

function writeOwnershipDoc(root, rows = [
  ["omp-user-project-resources", "track", "adapters/omp/source/ and docs/harness/omp/", "no"],
  ["omp-personal-local-overrides", "local-only", "none", "yes"],
  ["omp-runtime-state", "local-only", "none", "yes"],
]) {
  const tableRows = rows
    .map(([id, state, target, localOnly]) => `| \`${id}\` | \`${state}\` | \`${target}\` | \`${localOnly}\` |`)
    .join("\n");
  writeFileSync(path.join(root, "docs/harness/omp-ownership.md"), `# OMP Ownership

## OMP ownership state matrix

The matrix below is the operator-facing mirror of \`docs/harness/resource-manifest.json\` for OMP-owned surfaces.

| Resource ID | Ownership state | Intended repo target | Local-only surface |
| --- | --- | --- | --- |
${tableRows}
`);
}

function makeFixture() {
  const root = path.join(tmpdir(), `nucleus-docs-drift-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(path.join(root, "docs/operator"), { recursive: true });
  mkdirSync(path.join(root, "docs/harness"), { recursive: true });
  mkdirSync(path.join(root, "docs/skills"), { recursive: true });
  mkdirSync(path.join(root, "nucleus/skills/bus-first"), { recursive: true });
  mkdirSync(path.join(root, "scripts"), { recursive: true });
  writeFileSync(path.join(root, "scripts/render-nucleus.mjs"), "// fixture\n");
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "oh-my-pi-config", scripts: { "render-nucleus": "node scripts/render-nucleus.mjs", "install-nucleus": "node scripts/render-nucleus.mjs --write", check: "npm run validate", doctor: "node scripts/doctor.mjs" } }, null, 2));
  writeFileSync(path.join(root, "README.md"), "# oh-my-pi-config\n\n```sh\nnpm run render-nucleus\nnpm run check\n```\n");
  writeFileSync(path.join(root, "docs/operator/daily-workflow.md"), "```sh\nnpm run doctor\n```\n");
  writeFileSync(path.join(root, "docs/operator/install-update.md"), "`install-nucleus` is `node scripts/render-nucleus.mjs --write`.\n");
  writeFileSync(path.join(root, "docs/harness/live-nucleus-inventory-2026-06-25.md"), "> Superseded historical snapshot: ADR 0004.\n> Old paths below are preserved only as 2026-06-25 evidence.\n`omp/.omp/agent/AGENTS.md`\n");
  writeFileSync(path.join(root, "docs/skills/factorio-kit.md"), "This manifest is the build envelope, not an active adapter template. Its roster is validated against committed `nucleus/skills/` by `npm run check`.\n\n## Skill table\n\n| Skill | Factorio | Does | Linear | GitHub | Status | Replaces / Reuses |\n|---|---|---|---|---|---|---|\n| `bus-first` | bus | does | — | — | MVP | new |\n\n## MVP skill contracts\n");
  writeFileSync(path.join(root, "nucleus/skills/bus-first/SKILL.md"), "---\nname: bus-first\ndescription: Use when testing\n---\n");
  writeResourceManifest(root);
  writeOwnershipDoc(root);
  return root;
}

test("docs drift validator passes minimal aligned docs", () => {
  const root = makeFixture();
  try {
    assert.deepEqual(evaluateNucleusDocsDrift({ root, skillsRoot: "nucleus/skills", repoDirName: "loom" }).failures, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("docs drift validator catches an OMP manifest resource missing from the ownership state matrix", () => {
  const root = makeFixture();
  try {
    writeOwnershipDoc(root, [
      ["omp-user-project-resources", "track", "adapters/omp/source/ and docs/harness/omp/", "no"],
      ["omp-personal-local-overrides", "local-only", "none", "yes"],
    ]);
    const failures = evaluateNucleusDocsDrift({ root, skillsRoot: "nucleus/skills", repoDirName: "loom" }).failures;
    assert.ok(
      failures.some((failure) => failure.includes("omp-runtime-state") && failure.includes("ownership state matrix")),
      `expected missing ownership state matrix row for omp-runtime-state, got:\n${failures.join("\n")}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("docs drift validator catches local-only OMP surfaces documented as repo-owned", () => {
  const root = makeFixture();
  try {
    writeOwnershipDoc(root, [
      ["omp-user-project-resources", "track", "adapters/omp/source/ and docs/harness/omp/", "no"],
      ["omp-personal-local-overrides", "local-only", "none", "yes"],
      ["omp-runtime-state", "track", "adapters/omp/runtime-state/", "no"],
    ]);
    const failures = evaluateNucleusDocsDrift({ root, skillsRoot: "nucleus/skills", repoDirName: "loom" }).failures;
    assert.ok(
      failures.some((failure) => failure.includes("omp-runtime-state") && failure.includes("local-only")),
      `expected local-only ownership drift for omp-runtime-state, got:\n${failures.join("\n")}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("docs drift validator catches stale active source paths outside superseded history", () => {
  const root = makeFixture();
  try {
    writeFileSync(path.join(root, "README.md"), "Edit active source in `omp/.omp/agent/AGENTS.md`.\n");
    const failures = validateNoActiveStalePaths({ root, docPaths: ["README.md", "docs/harness"] });
    assert.ok(failures.some((failure) => failure.includes("old OMP tracked source root")), failures.join("\n"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("docs drift validator catches command drift from package.json", () => {
  const root = makeFixture();
  try {
    writeFileSync(path.join(root, "docs/operator/install-update.md"), "```sh\nnpm run render-harness-nucleus\n```\n");
    const failures = validateDocumentedCommands({ root });
    assert.ok(failures.some((failure) => failure.includes("render-harness-nucleus")), failures.join("\n"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
