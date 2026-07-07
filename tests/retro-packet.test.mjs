import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  buildRetroPacket,
  validateEvidenceIntakeEntry,
  validateRetroPacket,
  writeRetroPacketFiles,
  main,
} from "../scripts/retro-packet.mjs";

function readJson(relativePath) {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));
}

const validFixture = readJson("fixtures/retro-packet-valid.json");
const malformedFixture = readJson("fixtures/retro-packet-malformed.json");

const fixturePr = {
  number: 215,
  title: "LOO-206: archive write-only docs",
  body: "## Summary\n- Move archive docs.\n## Test plan\n- [x] npm run check",
  labels: [],
  files: [
    { path: "docs/decisions/0002-loom-skill-library-no-project-layer.md", additions: 3, deletions: 0, changeType: "ADDED" },
    { path: "docs/operator/daily-workflow.md", additions: 1, deletions: 1, changeType: "MODIFIED" },
  ],
  mergedAt: "2026-07-07T14:17:52Z",
  author: { login: "DylanMcCavitt" },
  url: "https://github.com/DylanMcCavitt/loom/pull/215",
  baseRefName: "main",
  headRefName: "loo-206",
};

function runGit(args, options = {}) {
  const result = spawnSync("git", args, { encoding: "utf8", ...options });
  assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join("\n"));
  return result.stdout.trim();
}

function writeFakeGh(binDir) {
  const ghPath = path.join(binDir, "gh");
  writeFileSync(ghPath, `#!/usr/bin/env node
if (process.argv[2] === "pr" && process.argv[3] === "view") {
  console.log(${JSON.stringify(JSON.stringify(fixturePr))});
  process.exit(0);
}
console.error(\`unexpected gh call: \${process.argv.slice(2).join(" ")}\`);
process.exit(1);
`);
  chmodSync(ghPath, 0o755);
}

test("retro packet fixture satisfies the evidence-intake practiced core", () => {
  const result = validateRetroPacket(validFixture);
  assert.deepEqual(result, { ok: true, errors: [] });
  for (const entry of validFixture.entries) {
    assert.equal(validateEvidenceIntakeEntry(entry).ok, true, entry.kind);
  }
});

test("retro packet validator rejects malformed candidate entries", () => {
  const result = validateEvidenceIntakeEntry(malformedFixture.entries[0]);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /missing targetFile/u);
  assert.match(result.errors.join("\n"), /missing candidate/u);
  assert.match(result.errors.join("\n"), /status must be pending-human-review/u);
});

test("retro packet builder writes schema-valid nucleus files", () => {
  const root = mkdtempSync(path.join(tmpdir(), "retro-packet-test-"));
  try {
    const packet = buildRetroPacket(fixturePr, { generatedAt: "2026-07-07T00:00:00.000Z" });
    const written = writeRetroPacketFiles(packet, { root }).written;
    assert.deepEqual(written, [
      "retro/pr-215/decision-log.json",
      "retro/pr-215/candidate-exemplar.json",
      "retro/pr-215/candidate-rule.json",
      "retro/pr-215/candidate-coverage-gap.json",
      "retro/pr-215/pr-body.md",
    ]);
    const saved = JSON.parse(readFileSync(path.join(root, "retro/pr-215/candidate-rule.json"), "utf8"));
    assert.equal(validateEvidenceIntakeEntry(saved).ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("retro packet generator commits packet files and prints a runnable PR command", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "retro-packet-main-test-"));
  const repoRoot = path.join(root, "repo");
  const worktreeRoot = path.join(root, "retro-worktree");
  const binDir = path.join(root, "bin");
  const originalPath = process.env.PATH;
  const logs = [];
  const originalLog = console.log;
  try {
    mkdirSync(repoRoot, { recursive: true });
    mkdirSync(binDir, { recursive: true });
    writeFakeGh(binDir);
    runGit(["init"], { cwd: repoRoot });
    runGit(["config", "user.name", "Retro Test"], { cwd: repoRoot });
    runGit(["config", "user.email", "retro-test@example.invalid"], { cwd: repoRoot });
    writeFileSync(path.join(repoRoot, "README.md"), "fixture\n");
    runGit(["add", "README.md"], { cwd: repoRoot });
    runGit(["commit", "-m", "fixture"], { cwd: repoRoot });

    process.env.PATH = `${binDir}${path.delimiter}${originalPath}`;
    console.log = (...args) => logs.push(args.join(" "));
    await main(["--pr", "215", "--repo-root", repoRoot, "--worktree-root", worktreeRoot]);
  } finally {
    console.log = originalLog;
    process.env.PATH = originalPath;
  }

  try {
    assert.equal(runGit(["-C", worktreeRoot, "status", "--short"]), "");
    assert.equal(runGit(["-C", worktreeRoot, "log", "-1", "--pretty=%s"]), "retro: packet for PR #215");
    const commitLine = logs.find((line) => line.startsWith("Retro commit: "));
    assert.match(commitLine, /^Retro commit: [a-f0-9]+ \(retro: packet for PR #215\)$/u);

    const commandLine = logs.find((line) => line.startsWith("PR create command: "));
    assert.ok(commandLine, "expected PR create command output");
    const bodyPath = commandLine.match(/--body-file '([^']+)'/u)?.[1];
    assert.ok(bodyPath, commandLine);
    assert.equal(path.isAbsolute(bodyPath), true);
    assert.equal(existsSync(bodyPath), true);
    assert.equal(path.relative(worktreeRoot, bodyPath).split(path.sep).join("/"), "retro/pr-215/pr-body.md");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
