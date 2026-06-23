import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { scanFactory } from "../scripts/factory-nucleus/scan.mjs";

const factoryCli = new URL("../scripts/factory-nucleus/factory.mjs", import.meta.url).pathname;
const generatedAt = "2026-06-23T00:00:00.000Z";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

function writeFiles(root, files) {
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }
}

function commitAll(root) {
  run("git", ["init", "-q", "-b", "main"], { cwd: root });
  run("git", ["add", "."], { cwd: root });
  run("git", ["-c", "user.email=factory@example.invalid", "-c", "user.name=Factory Test", "commit", "-q", "-m", "initial"], { cwd: root });
}

function withTempRepo(files, callback) {
  const root = mkdtempSync(path.join(tmpdir(), "factory-scan-repo-"));
  try {
    writeFiles(root, files);
    commitAll(root);
    callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function walkFiles(root, current = root, output = new Map()) {
  for (const entry of readdirSync(current).sort()) {
    const fullPath = path.join(current, entry);
    const relativePath = path.relative(root, fullPath);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walkFiles(root, fullPath, output);
    } else {
      output.set(relativePath, readFileSync(fullPath, "utf8"));
    }
  }
  return output;
}

function assertNoUserFileWrites(root, before) {
  assert.deepEqual(walkFiles(root), before);
}

function runScan(root) {
  const home = mkdtempSync(path.join(tmpdir(), "factory-scan-home-"));
  try {
    const result = spawnSync(process.execPath, [factoryCli, "scan", "--root", root], {
      encoding: "utf8",
      env: { ...process.env, HOME: home },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.deepEqual(readdirSync(home), [], "default scan must not create local state files");
    return result;
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

test("default factory scan reports a clean Node repo without writing files", () => {
  withTempRepo({
    "package.json": `${JSON.stringify({ scripts: { build: "tsc", test: "node --test", lint: "eslint ." } }, null, 2)}\n`,
    "package-lock.json": "{}\n",
    ".github/workflows/ci.yml": "name: ci\n",
    "src/index.js": "console.log('factory');\n",
  }, (root) => {
    const before = walkFiles(root);
    const result = runScan(root);

    assert.match(result.stdout, /Factory scan/u);
    assert.match(result.stdout, /Mode: zero-footprint \(no target-repo or local-state writes\)/u);
    assert.match(result.stdout, /Remote APIs: none/u);
    assert.match(result.stdout, /Branch: main \(default: main\)/u);
    assert.match(result.stdout, /Dirty state: clean/u);
    assert.match(result.stdout, /Stack: node\/npm/u);
    assert.match(result.stdout, /build: npm run build \(package\.json\)/u);
    assert.match(result.stdout, /test: npm test \(package\.json\)/u);
    assert.match(result.stdout, /lint: npm run lint \(package\.json\)/u);
    assert.match(result.stdout, /Science level: logistic/u);
    assertNoUserFileWrites(root, before);

    const scan = scanFactory({ root, generatedAt });
    assert.equal(scan.schemaVersion, 1);
    assert.equal(scan.kind, "factory-scan");
    assert.equal(scan.generatedAt, generatedAt);
    assert.equal(scan.localState.writes, false);
    assert.equal(scan.remoteApis.called, false);
  });
});

test("factory scan reports dirty worktree state without modifying the dirty repo", () => {
  withTempRepo({
    "package.json": `${JSON.stringify({ scripts: { test: "node --test" } }, null, 2)}\n`,
    "src/index.js": "console.log('clean');\n",
  }, (root) => {
    writeFileSync(path.join(root, "src/index.js"), "console.log('dirty');\n");
    writeFileSync(path.join(root, "notes.md"), "untracked\n");
    const before = walkFiles(root);
    const result = runScan(root);

    assert.match(result.stdout, /Dirty state: dirty \(2 paths\)/u);
    assert.match(result.stdout, /Missing unlocks:/u);
    assert.match(result.stdout, /clean worktree/u);
    assertNoUserFileWrites(root, before);
  });
});

test("factory scan prints explicit command absence for repos without scripts", () => {
  withTempRepo({
    "README.md": "# no commands yet\n",
  }, (root) => {
    const before = walkFiles(root);
    const result = runScan(root);

    assert.match(result.stdout, /Stack: unknown/u);
    assert.match(result.stdout, /build: absent/u);
    assert.match(result.stdout, /test: absent/u);
    assert.match(result.stdout, /lint: absent/u);
    assert.match(result.stdout, /stack detection/u);
    assert.match(result.stdout, /test command/u);
    assertNoUserFileWrites(root, before);
  });
});

test("factory scan suggests protected surfaces and redacts secret-looking output", () => {
  const fakeToken = `ghp_${"12345678901234567890"}`;
  withTempRepo({
    "package.json": `${JSON.stringify({ scripts: { test: "node test.js" } }, null, 2)}\n`,
    ".github/workflows/ci.yml": "name: ci\n",
    ".agents/skills/example/SKILL.md": "---\nname: example\ndescription: Example.\n---\n",
    ".agents/envelope/linear-map.md": "team: Loom\n",
    "docs/decisions/0001-test.md": "# Test ADR\n",
    ".loom.yml": "factory: test\n",
  }, (root) => {
    run("git", ["branch", "-m", `feature/key_${fakeToken}`], { cwd: root });
    const before = walkFiles(root);
    const result = runScan(root);

    assert.match(result.stdout, /\.github\/workflows: route CI changes through proof and launch review/u);
    assert.match(result.stdout, /\.agents\/skills: pair skill changes with routing\/eval proof/u);
    assert.match(result.stdout, /\.agents\/envelope: keep durable policy separate from scan observations/u);
    assert.match(result.stdout, /\.loom\.yml: treat pointer changes as explicit setup intent/u);
    assert.match(result.stdout, /docs\/decisions: route ADR changes through maintainer review/u);
    assert.match(result.stdout, /Branch: feature\/key_\[REDACTED\] \(default: feature\/key_\[REDACTED\]\)/u);
    assert.doesNotMatch(result.stdout, new RegExp(fakeToken, "u"));
    assertNoUserFileWrites(root, before);
    assert.ok(existsSync(path.join(root, "package.json")));
  });
});

test("factory scan distinguishes sk tokens from ordinary task branch names", () => {
  withTempRepo({
    "package.json": `${JSON.stringify({ scripts: { test: "node test.js" } }, null, 2)}\n`,
  }, (root) => {
    run("git", ["branch", "-m", "task-123456789012"], { cwd: root });
    const result = runScan(root);

    assert.match(result.stdout, /Branch: task-123456789012 \(default: task-123456789012\)/u);
    assert.doesNotMatch(result.stdout, /\[REDACTED\]/u);
  });

  const fakeSkToken = `sk-${"123456789012"}`;
  withTempRepo({
    "package.json": `${JSON.stringify({ scripts: { test: "node test.js" } }, null, 2)}\n`,
  }, (root) => {
    run("git", ["branch", "-m", `feature/key_${fakeSkToken}`], { cwd: root });
    const result = runScan(root);

    assert.match(result.stdout, /Branch: feature\/key_\[REDACTED\] \(default: feature\/key_\[REDACTED\]\)/u);
    assert.doesNotMatch(result.stdout, new RegExp(fakeSkToken, "u"));
  });
});
