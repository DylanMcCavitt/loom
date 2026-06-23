import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { scanFactory } from "../scripts/factory-nucleus/scan.mjs";
import { resolveFactoryStatePaths } from "../scripts/factory-nucleus/schema.mjs";

const factoryCli = new URL("../scripts/factory-nucleus/factory.mjs", import.meta.url).pathname;
const generatedAt = "2026-06-23T00:00:00.000Z";
const offlineEnvelopeYaml = `
schemaVersion: 1
kind: envelope
generatedAt: "${generatedAt}"
factory:
  id: offline-factory
  repo:
    name: fixture
    root: .
tracker:
  provider: none
delivery:
  defaultBranch: main
  branchPrefix: offline
  autoMerge: false
proof:
  commands:
    - npm test
agents:
  maxSubagents: 1
  allowFullTranscriptCapture: false
circuits:
  - name: proof-required
    gate: proof
    outcome: block
    enforcement: validate
`;

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

function withScanSave(root, callback) {
  const home = mkdtempSync(path.join(tmpdir(), "factory-scan-save-home-"));
  try {
    const result = spawnSync(process.execPath, [factoryCli, "scan", "--root", root, "--save"], {
      encoding: "utf8",
      env: { ...process.env, HOME: home },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    callback({ home, result });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

function withFactoryScan(root, args, callback) {
  const home = mkdtempSync(path.join(tmpdir(), "factory-scan-cli-home-"));
  try {
    const result = spawnSync(process.execPath, [factoryCli, "scan", "--root", root, ...args], {
      encoding: "utf8",
      env: { ...process.env, HOME: home },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    callback({ home, result });
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
    assert.match(result.stdout, /Science level: green/u);
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

test("factory scan --save writes only scan state outside the target repo", () => {
  withTempRepo({
    "package.json": `${JSON.stringify({ scripts: { test: "node --test" } }, null, 2)}\n`,
    ".agents/envelope/linear-map.md": "team: Loom\n",
    ".loom.yml": "factory: test\n",
  }, (root) => {
    const beforeRepo = walkFiles(root);
    withScanSave(root, ({ home, result }) => {
      const state = resolveFactoryStatePaths({
        homeDir: home,
        targetRepoPath: root,
        factoryId: path.basename(root),
        generatedAt,
      });
      assert.equal(existsSync(state.envelope), false, "scan save must not create an envelope");
      const envelopeDir = path.dirname(state.envelope);
      mkdirSync(envelopeDir, { recursive: true });
      writeFileSync(state.envelope, "original envelope\n");

      const secondResult = spawnSync(process.execPath, [factoryCli, "scan", "--root", root, "--save"], {
        encoding: "utf8",
        env: { ...process.env, HOME: home },
      });
      assert.equal(secondResult.status, 0, secondResult.stderr || secondResult.stdout);

      assert.match(result.stdout, /Factory scan/u);
      assert.match(result.stdout, /Mode: scan-save \(writes local scan state only; no target-repo writes\)/u);
      assert.ok(existsSync(state.scan), "scan save should write scan/latest.json");
      assert.equal(readFileSync(state.envelope, "utf8"), "original envelope\n");
      assert.deepEqual(
        [...walkFiles(home).keys()].sort(),
        [path.relative(home, state.envelope), path.relative(home, state.scan)].sort(),
      );

      const savedScan = JSON.parse(readFileSync(state.scan, "utf8"));
      assert.equal(savedScan.schemaVersion, 1);
      assert.equal(savedScan.kind, "factory-scan");
      assert.equal(savedScan.mode, "scan-save");
      assert.equal(savedScan.localState.writes, true);
      assert.equal(savedScan.localState.scan, state.scan);
      assert.equal(savedScan.remoteApis.called, false);
      assert.deepEqual(savedScan.pointer, { present: true, status: "valid", identity: "test" });
    });
    assertNoUserFileWrites(root, beforeRepo);
  });
});

test("factory scan --save redacts secret-looking branch names in saved scan state", () => {
  const fakeToken = `ghp_${"12345678901234567890"}`;
  withTempRepo({
    "package.json": `${JSON.stringify({ scripts: { test: "node --test" } }, null, 2)}\n`,
  }, (root) => {
    run("git", ["branch", "-m", `feature/key_${fakeToken}`], { cwd: root });
    withScanSave(root, ({ home }) => {
      const state = resolveFactoryStatePaths({
        homeDir: home,
        targetRepoPath: root,
        factoryId: path.basename(root),
        generatedAt,
      });
      const savedText = readFileSync(state.scan, "utf8");
      const savedScan = JSON.parse(savedText);

      assert.doesNotMatch(savedText, new RegExp(fakeToken, "u"));
      assert.equal(savedScan.git.currentBranch, "feature/key_[REDACTED]");
      assert.equal(savedScan.git.defaultBranch, "feature/key_[REDACTED]");
    });
  });
});

test("factory scan reads .loom.yml pointer identity only", () => {
  withTempRepo({
    "package.json": `${JSON.stringify({ scripts: { test: "node --test" } }, null, 2)}\n`,
    ".loom.yml": "factory: test-factory\n",
  }, (root) => {
    const before = walkFiles(root);
    const result = runScan(root);
    const scan = scanFactory({ root, generatedAt });

    assert.match(result.stdout, /Pointer: test-factory/u);
    assert.deepEqual(scan.pointer, { present: true, status: "valid", identity: "test-factory" });
    assertNoUserFileWrites(root, before);
  });
});

test("factory scan ignores policy-bearing .loom.yml values", () => {
  const fakeToken = `ghp_${"12345678901234567890"}`;
  withTempRepo({
    "package.json": `${JSON.stringify({ scripts: { test: "node --test" } }, null, 2)}\n`,
    ".loom.yml": `factory: test-factory\ntracker:\n  token: ${fakeToken}\ncommands:\n  test: npm test\n`,
  }, (root) => {
    const before = walkFiles(root);
    withScanSave(root, ({ home, result }) => {
      const state = resolveFactoryStatePaths({
        homeDir: home,
        targetRepoPath: root,
        factoryId: path.basename(root),
        generatedAt,
      });
      const savedText = readFileSync(state.scan, "utf8");
      const savedScan = JSON.parse(savedText);

      assert.match(result.stdout, /Pointer: ignored policy-bearing \.loom\.yml \(tracker, commands\)/u);
      assert.doesNotMatch(result.stdout, new RegExp(fakeToken, "u"));
      assert.doesNotMatch(savedText, new RegExp(fakeToken, "u"));
      assert.ok(savedScan.science.missingUnlocks.includes("factory envelope"));
      assert.deepEqual(savedScan.pointer, {
        present: true,
        status: "ignored-policy",
        ignoredKeys: ["tracker", "commands"],
      });
    });
    assertNoUserFileWrites(root, before);
  });
});

test("factory scan treats quoted pointer policy keys as policy-bearing", () => {
  withTempRepo({
    "package.json": `${JSON.stringify({ scripts: { test: "node --test" } }, null, 2)}\n`,
    ".loom.yml": `factory: test-factory\n"commands":\n  test: npm test\n`,
  }, (root) => {
    const scan = scanFactory({ root, generatedAt });

    assert.deepEqual(scan.pointer, {
      present: true,
      status: "ignored-policy",
      ignoredKeys: ["commands"],
    });
  });
});

test("factory scan rejects unbalanced pointer quotes", () => {
  for (const loomYml of [`"factory: prod\n`, `factory: "prod\n`]) {
    withTempRepo({
      "package.json": `${JSON.stringify({ scripts: { test: "node --test" } }, null, 2)}\n`,
      ".loom.yml": loomYml,
    }, (root) => {
      const result = runScan(root);
      const scan = scanFactory({ root, generatedAt });

      assert.match(result.stdout, /Pointer: ignored policy-bearing \.loom\.yml \(unparsed\)/u);
      assert.deepEqual(scan.pointer, {
        present: true,
        status: "ignored-policy",
        ignoredKeys: ["unparsed"],
      });
      assert.ok(scan.science.missingUnlocks.includes("factory envelope"));
    });
  }
});

test("factory scan rejects leading indented pointer content", () => {
  withTempRepo({
    "package.json": `${JSON.stringify({ scripts: { test: "node --test" } }, null, 2)}\n`,
    ".loom.yml": "  commands:\n    test: npm test\nfactory: prod\n",
  }, (root) => {
    const result = runScan(root);
    const scan = scanFactory({ root, generatedAt });

    assert.match(result.stdout, /Pointer: ignored policy-bearing \.loom\.yml \(unparsed\)/u);
    assert.deepEqual(scan.pointer, {
      present: true,
      status: "ignored-policy",
      ignoredKeys: ["unparsed"],
    });
    assert.ok(scan.science.missingUnlocks.includes("factory envelope"));
  });
});

test("factory scan rejects structured pointer identity values", () => {
  const privatePath = "/Users/alice/private";
  withTempRepo({
    "package.json": `${JSON.stringify({ scripts: { test: "node --test" } }, null, 2)}\n`,
    ".loom.yml": `id: safe\nfactory: { id: test, repo: { root: ${privatePath} }, commands: { test: npm test } }\n`,
  }, (root) => {
    const before = walkFiles(root);
    withScanSave(root, ({ home, result }) => {
      const state = resolveFactoryStatePaths({
        homeDir: home,
        targetRepoPath: root,
        factoryId: path.basename(root),
        generatedAt,
      });
      const savedText = readFileSync(state.scan, "utf8");
      const savedScan = JSON.parse(savedText);

      assert.match(result.stdout, /Pointer: ignored policy-bearing \.loom\.yml \(factory\)/u);
      assert.doesNotMatch(result.stdout, new RegExp(privatePath.replaceAll("/", "\\/"), "u"));
      assert.doesNotMatch(savedText, new RegExp(privatePath.replaceAll("/", "\\/"), "u"));
      assert.ok(savedScan.science.missingUnlocks.includes("factory envelope"));
      assert.deepEqual(savedScan.pointer, {
        present: true,
        status: "ignored-policy",
        ignoredKeys: ["factory"],
      });
    });
    assertNoUserFileWrites(root, before);
  });
});

test("factory scan rejects block-valued pointer identity keys", () => {
  withTempRepo({
    "package.json": `${JSON.stringify({ scripts: { test: "node --test" } }, null, 2)}\n`,
    ".loom.yml": "id: safe\nfactory:\n  commands:\n    test: npm test\n",
  }, (root) => {
    const result = runScan(root);
    const scan = scanFactory({ root, generatedAt });

    assert.match(result.stdout, /Pointer: ignored policy-bearing \.loom\.yml \(factory\)/u);
    assert.deepEqual(scan.pointer, {
      present: true,
      status: "ignored-policy",
      ignoredKeys: ["factory"],
    });
    assert.ok(scan.science.missingUnlocks.includes("factory envelope"));
  });
});

test("factory scan rejects indented content after scalar pointer identities", () => {
  withTempRepo({
    "package.json": `${JSON.stringify({ scripts: { test: "node --test" } }, null, 2)}\n`,
    ".loom.yml": "id: safe\nfactory: real\n  commands:\n    test: npm test\n",
  }, (root) => {
    const result = runScan(root);
    const scan = scanFactory({ root, generatedAt });

    assert.match(result.stdout, /Pointer: ignored policy-bearing \.loom\.yml \(factory\)/u);
    assert.deepEqual(scan.pointer, {
      present: true,
      status: "ignored-policy",
      ignoredKeys: ["factory"],
    });
    assert.ok(scan.science.missingUnlocks.includes("factory envelope"));
  });
});

test("factory scan does not follow symlinked .loom.yml pointers", () => {
  withTempRepo({
    "package.json": `${JSON.stringify({ scripts: { test: "node --test" } }, null, 2)}\n`,
    ".loom.yml": "factory: inside\n",
  }, (root) => {
    const outside = mkdtempSync(path.join(tmpdir(), "factory-pointer-outside-"));
    try {
      writeFileSync(path.join(outside, ".loom.yml"), "factory: external\n");
      rmSync(path.join(root, ".loom.yml"), { force: true });
      symlinkSync(path.join(outside, ".loom.yml"), path.join(root, ".loom.yml"));

      const result = runScan(root);
      const scan = scanFactory({ root, generatedAt });

      assert.match(result.stdout, /Pointer: unreadable/u);
      assert.doesNotMatch(result.stdout, /external/u);
      assert.deepEqual(scan.pointer, { present: true, status: "unreadable" });
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

test("factory scan reports dangling .loom.yml symlinks as unreadable", () => {
  withTempRepo({
    "package.json": `${JSON.stringify({ scripts: { test: "node --test" } }, null, 2)}\n`,
  }, (root) => {
    symlinkSync(path.join(root, "missing.yml"), path.join(root, ".loom.yml"));

    const result = runScan(root);
    const scan = scanFactory({ root, generatedAt });

    assert.match(result.stdout, /Pointer: unreadable/u);
    assert.deepEqual(scan.pointer, { present: true, status: "unreadable" });
  });
});

test("factory scan ignores integrated envelopes unless explicitly requested", () => {
  withTempRepo({
    "package.json": `${JSON.stringify({ scripts: { test: "node --test" } }, null, 2)}\n`,
    ".agents/envelope/envelope.yaml": "schemaVersion 1\nUNREQUESTED_INTEGRATED_ENVELOPE\n",
  }, (root) => {
    const before = walkFiles(root);
    const result = runScan(root);
    const scan = scanFactory({ root, generatedAt });

    assert.deepEqual(scan.integratedEnvelope, { enabled: false });
    assert.doesNotMatch(result.stdout, /Integrated envelope/u);
    assert.doesNotMatch(result.stdout, /UNREQUESTED_INTEGRATED_ENVELOPE/u);
    assertNoUserFileWrites(root, before);
  });
});

test("factory scan --integrated-envelope discovers and validates offline envelope content", () => {
  withTempRepo({
    "package.json": `${JSON.stringify({ scripts: { test: "node --test" } }, null, 2)}\n`,
    ".agents/envelope/envelope.yaml": offlineEnvelopeYaml,
  }, (root) => {
    withFactoryScan(root, ["--integrated-envelope"], ({ home, result }) => {
      assert.deepEqual(readdirSync(home), [], "integrated envelope scan without --save must not create local state files");
      assert.match(result.stdout, /Integrated envelope: valid \(\.agents\/envelope\/envelope\.yaml\)/u);
    });

    const scan = scanFactory({ root, generatedAt, integratedEnvelope: true });
    assert.deepEqual(scan.integratedEnvelope, {
      enabled: true,
      present: true,
      path: ".agents/envelope/envelope.yaml",
      status: "valid",
      validation: { ok: true, errors: [] },
    });
    assert.equal(scan.localState.writes, false);
  });
});

test("factory scan --integrated-envelope reports invalid offline envelope content", () => {
  withTempRepo({
    "package.json": `${JSON.stringify({ scripts: { test: "node --test" } }, null, 2)}\n`,
    ".agents/envelope/envelope.yaml": "schemaVersion 1\n",
  }, (root) => {
    const before = walkFiles(root);
    withFactoryScan(root, ["--integrated-envelope"], ({ result }) => {
      assert.match(result.stdout, /Integrated envelope: invalid \(\.agents\/envelope\/envelope\.yaml\)/u);
    });

    const scan = scanFactory({ root, generatedAt, integratedEnvelope: true });
    assert.equal(scan.integratedEnvelope.enabled, true);
    assert.equal(scan.integratedEnvelope.present, true);
    assert.equal(scan.integratedEnvelope.path, ".agents/envelope/envelope.yaml");
    assert.equal(scan.integratedEnvelope.status, "invalid");
    assert.equal(scan.integratedEnvelope.validation.ok, false);
    assert.ok(scan.integratedEnvelope.validation.errors.length > 0);
    assertNoUserFileWrites(root, before);
  });
});

test("factory scan --integrated-envelope --save writes only scan state outside the target repo", () => {
  withTempRepo({
    "package.json": `${JSON.stringify({ scripts: { test: "node --test" } }, null, 2)}\n`,
    ".agents/envelope/envelope.yaml": offlineEnvelopeYaml,
  }, (root) => {
    const before = walkFiles(root);
    withFactoryScan(root, ["--integrated-envelope", "--save"], ({ home, result }) => {
      const state = resolveFactoryStatePaths({
        homeDir: home,
        targetRepoPath: root,
        factoryId: path.basename(root),
        generatedAt,
      });
      const savedScan = JSON.parse(readFileSync(state.scan, "utf8"));

      assert.match(result.stdout, /Mode: scan-save \(writes local scan state only; no target-repo writes\)/u);
      assert.equal(existsSync(state.scan), true);
      assert.equal(existsSync(state.envelope), false, "integrated envelope scan save must not create a local envelope");
      assert.deepEqual([...walkFiles(home).keys()], [path.relative(home, state.scan)]);
      assert.equal(savedScan.mode, "scan-save");
      assert.equal(savedScan.localState.writes, true);
      assert.equal(savedScan.remoteApis.called, false);
      assert.equal(savedScan.integratedEnvelope.status, "valid");
      assert.equal(savedScan.integratedEnvelope.validation.ok, true);
    });
    assertNoUserFileWrites(root, before);
  });
});

test("factory scan skips content inspection unless explicitly requested", () => {
  const fakeToken = `ghp_${"12345678901234567890"}`;
  withTempRepo({
    "package.json": `${JSON.stringify({ scripts: { test: "node --test" } }, null, 2)}\n`,
    "src/secret.js": `const token = "${fakeToken}";\n`,
  }, (root) => {
    const before = walkFiles(root);
    const result = runScan(root);
    const scan = scanFactory({ root, generatedAt });

    assert.equal(scan.content.enabled, false);
    assert.doesNotMatch(result.stdout, /Content signals/u);
    assert.doesNotMatch(result.stdout, new RegExp(fakeToken, "u"));
    assertNoUserFileWrites(root, before);
  });
});

test("factory scan --content-scan reports redacted content-derived signals", () => {
  const fakeToken = `ghp_${"12345678901234567890"}`;
  withTempRepo({
    "package.json": `${JSON.stringify({ scripts: { test: "node --test" } }, null, 2)}\n`,
    "src/secret.js": `const token = "${fakeToken}";\n`,
  }, (root) => {
    withFactoryScan(root, ["--content-scan"], ({ home, result }) => {
      assert.deepEqual(readdirSync(home), [], "content scan without --save must not create local state files");
      assert.match(result.stdout, /Content signals:/u);
      assert.match(result.stdout, /redacted secret-like signals: 1/u);
      assert.match(result.stdout, /src\/secret\.js: secret-like-content redacted/u);
      assert.doesNotMatch(result.stdout, new RegExp(fakeToken, "u"));
    });
  });
});

test("factory scan --content-scan --save omits secret-looking values from saved state", () => {
  const fakeToken = `ghp_${"12345678901234567890"}`;
  withTempRepo({
    "package.json": `${JSON.stringify({ scripts: { test: "node --test" } }, null, 2)}\n`,
    "src/secret.js": `const token = "${fakeToken}";\n`,
  }, (root) => {
    const before = walkFiles(root);
    withFactoryScan(root, ["--content-scan", "--save"], ({ home }) => {
      const state = resolveFactoryStatePaths({
        homeDir: home,
        targetRepoPath: root,
        factoryId: path.basename(root),
        generatedAt,
      });
      const savedText = readFileSync(state.scan, "utf8");
      const savedScan = JSON.parse(savedText);

      assert.equal(existsSync(state.envelope), false, "content scan save must not create an envelope");
      assert.doesNotMatch(savedText, new RegExp(fakeToken, "u"));
      assert.equal(savedScan.content.enabled, true);
      assert.equal(savedScan.content.redactedSignals.length, 1);
      assert.equal(savedScan.content.redactedSignals[0].path, "src/secret.js");
      assert.equal(savedScan.content.redactedSignals[0].redacted, true);
    });
    assertNoUserFileWrites(root, before);
  });
});

test("factory scan --content-scan skips tracked files missing from the working tree", () => {
  withTempRepo({
    "package.json": `${JSON.stringify({ scripts: { test: "node --test" } }, null, 2)}\n`,
    "src/deleted.js": "console.log('tracked then deleted');\n",
  }, (root) => {
    rmSync(path.join(root, "src/deleted.js"));
    const before = walkFiles(root);
    withFactoryScan(root, ["--content-scan"], ({ result }) => {
      assert.match(result.stdout, /Content signals:/u);
      assert.doesNotMatch(result.stdout, /ENOENT/u);
    });
    const scan = scanFactory({ root, content: true, generatedAt });
    assert.equal(scan.content.skippedFiles, 1);
    assertNoUserFileWrites(root, before);
  });
});

test("factory scan --content-scan skips tracked symlinks before reading content", () => {
  const fakeToken = `ghp_${"12345678901234567890"}`;
  withTempRepo({
    "package.json": `${JSON.stringify({ scripts: { test: "node --test" } }, null, 2)}\n`,
  }, (root) => {
    const outside = mkdtempSync(path.join(tmpdir(), "factory-content-outside-"));
    try {
      const outsideSecret = path.join(outside, "credentials.js");
      writeFileSync(outsideSecret, `const token = "${fakeToken}";\n`);
      mkdirSync(path.join(root, "src"), { recursive: true });
      symlinkSync(outsideSecret, path.join(root, "src/config.js"));
      run("git", ["add", "src/config.js"], { cwd: root });
      run("git", ["-c", "user.email=factory@example.invalid", "-c", "user.name=Factory Test", "commit", "-q", "-m", "add symlink"], { cwd: root });

      withFactoryScan(root, ["--content-scan"], ({ result }) => {
        assert.match(result.stdout, /Content signals:/u);
        assert.match(result.stdout, /redacted secret-like signals: 0/u);
        assert.doesNotMatch(result.stdout, new RegExp(fakeToken, "u"));
      });
      const scan = scanFactory({ root, content: true, generatedAt });
      assert.equal(scan.content.skippedFiles, 1);
      assert.equal(scan.content.redactedSignals.length, 0);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

test("factory scan --content-scan skips tracked paths through symlinked ancestors", () => {
  const fakeToken = `ghp_${"12345678901234567890"}`;
  withTempRepo({
    "package.json": `${JSON.stringify({ scripts: { test: "node --test" } }, null, 2)}\n`,
    "src/config.js": "console.log('inside repo');\n",
  }, (root) => {
    const outside = mkdtempSync(path.join(tmpdir(), "factory-content-ancestor-"));
    try {
      writeFileSync(path.join(outside, "config.js"), `const token = "${fakeToken}";\n`);
      rmSync(path.join(root, "src"), { recursive: true, force: true });
      symlinkSync(outside, path.join(root, "src"));

      withFactoryScan(root, ["--content-scan"], ({ result }) => {
        assert.match(result.stdout, /Content signals:/u);
        assert.match(result.stdout, /redacted secret-like signals: 0/u);
        assert.doesNotMatch(result.stdout, new RegExp(fakeToken, "u"));
      });
      const scan = scanFactory({ root, content: true, generatedAt });
      assert.equal(scan.content.skippedFiles, 1);
      assert.equal(scan.content.redactedSignals.length, 0);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
