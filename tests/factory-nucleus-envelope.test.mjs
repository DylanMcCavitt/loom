import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { exportEnvelope, importEnvelope, initEnvelope, redactEnvelope } from "../scripts/factory-nucleus/envelope.mjs";
import { resolveFactoryStatePaths, validateEnvelopeYaml } from "../scripts/factory-nucleus/schema.mjs";

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
  const root = mkdtempSync(path.join(tmpdir(), "factory-envelope-repo-"));
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

test("factory init-envelope writes a schema-valid conservative local envelope", () => {
  withTempRepo({
    "package.json": `${JSON.stringify({ scripts: { build: "tsc", test: "node --test", lint: "eslint ." } }, null, 2)}\n`,
    "package-lock.json": "{}\n",
    "src/index.js": "console.log('factory');\n",
  }, (root) => {
    const home = mkdtempSync(path.join(tmpdir(), "factory-envelope-home-"));
    try {
      const beforeRepo = walkFiles(root);
      const result = initEnvelope({ root, homeDir: home, generatedAt });
      const envelopeYaml = readFileSync(result.path, "utf8");
      const validation = validateEnvelopeYaml(envelopeYaml);

      assert.equal(validation.ok, true, validation.errors.join("\n"));
      assert.match(envelopeYaml, /kind: envelope/u);
      assert.match(envelopeYaml, new RegExp(`name: "${path.basename(root)}"`, "u"));
      assert.match(envelopeYaml, /root: "\."/u);
      assert.match(envelopeYaml, /provider: none/u);
      assert.doesNotMatch(envelopeYaml, /team:/u);
      assert.doesNotMatch(envelopeYaml, /project:/u);
      assert.match(envelopeYaml, /defaultBranch: "main"/u);
      assert.match(envelopeYaml, /- "npm run build"/u);
      assert.match(envelopeYaml, /- "npm test"/u);
      assert.match(envelopeYaml, /- "npm run lint"/u);
      assert.match(envelopeYaml, /name: "tracker-explicit"/u);
      assert.throws(
        () => initEnvelope({ root, homeDir: home, generatedAt }),
        /already exists; refusing to overwrite/u,
      );
      assert.equal(readFileSync(result.path, "utf8"), envelopeYaml);
      assert.equal(existsSync(path.join(root, ".loom.yml")), false, "init must not write a target-repo pointer");
      assert.deepEqual(walkFiles(root), beforeRepo);
      assert.deepEqual([...walkFiles(home).keys()], [path.relative(home, result.path)]);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

test("factory init-envelope CLI leaves tracker binding explicit and unset", () => {
  withTempRepo({
    "package.json": `${JSON.stringify({ scripts: { test: "node --test" } }, null, 2)}\n`,
  }, (root) => {
    const home = mkdtempSync(path.join(tmpdir(), "factory-envelope-cli-home-"));
    try {
      const beforeRepo = walkFiles(root);
      const result = spawnSync(process.execPath, [factoryCli, "init-envelope", "--root", root], {
        encoding: "utf8",
        env: { ...process.env, HOME: home },
      });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.match(result.stdout, /Mode: init-envelope \(writes local envelope state only; no target-repo writes\)/u);
      assert.match(result.stdout, /Tracker: none \(explicit\/unset\)/u);
      assert.match(result.stdout, /Remote APIs: none/u);
      assert.match(result.stdout, /Pointer writes: none/u);

      const state = resolveFactoryStatePaths({ homeDir: home, targetRepoPath: root, factoryId: path.basename(root) });
      const envelopeYaml = readFileSync(state.envelope, "utf8");
      assert.equal(validateEnvelopeYaml(envelopeYaml).ok, true);
      assert.match(envelopeYaml, /provider: none/u);
      assert.deepEqual(walkFiles(root), beforeRepo);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

test("factory init-envelope does not persist current branch as default branch", () => {
  withTempRepo({
    "package.json": `${JSON.stringify({ scripts: { test: "node --test" } }, null, 2)}\n`,
    ".github/workflows/ci.yml": "name: ci\n",
  }, (root) => {
    run("git", ["branch", "-m", "feature/init-envelope"], { cwd: root });
    const home = mkdtempSync(path.join(tmpdir(), "factory-envelope-branch-home-"));
    try {
      const result = initEnvelope({ root, homeDir: home, generatedAt });
      const envelopeYaml = readFileSync(result.path, "utf8");

      assert.match(envelopeYaml, /defaultBranch: "main"/u);
      assert.doesNotMatch(envelopeYaml, /feature\/init-envelope/u);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

test("factory bind-tracker --provider linear records adapter and project identity", () => {
  withTempRepo({
    "package.json": `${JSON.stringify({ scripts: { test: "node --test" } }, null, 2)}\n`,
  }, (root) => {
    const home = mkdtempSync(path.join(tmpdir(), "factory-bind-linear-home-"));
    try {
      initEnvelope({ root, homeDir: home, generatedAt });
      const beforeRepo = walkFiles(root);
      const result = spawnSync(
        process.execPath,
        [factoryCli, "bind-tracker", "--root", root, "--provider", "linear", "--team", "Loom", "--project", "Factory Nucleus"],
        { encoding: "utf8", env: { ...process.env, HOME: home } },
      );
      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.match(result.stdout, /Mode: bind-tracker \(writes local envelope state only; no target-repo writes\)/u);
      assert.match(result.stdout, /Tracker: linear \(project Factory Nucleus\)/u);

      const state = resolveFactoryStatePaths({ homeDir: home, targetRepoPath: root, factoryId: path.basename(root) });
      const envelopeYaml = readFileSync(state.envelope, "utf8");
      assert.equal(validateEnvelopeYaml(envelopeYaml).ok, true, validateEnvelopeYaml(envelopeYaml).errors.join("\n"));
      assert.match(envelopeYaml, /provider: linear/u);
      assert.match(envelopeYaml, /team: "Loom"/u);
      assert.match(envelopeYaml, /project: "Factory Nucleus"/u);
      assert.deepEqual(walkFiles(root), beforeRepo);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

test("factory bind-tracker --provider github records the detected source repo bridge", () => {
  withTempRepo({
    "package.json": `${JSON.stringify({ scripts: { test: "node --test" } }, null, 2)}\n`,
  }, (root) => {
    run("git", ["remote", "add", "origin", "git@github.com:acme/widgets.git"], { cwd: root });
    const home = mkdtempSync(path.join(tmpdir(), "factory-bind-github-home-"));
    try {
      initEnvelope({ root, homeDir: home, generatedAt });
      const beforeRepo = walkFiles(root);
      const result = spawnSync(
        process.execPath,
        [factoryCli, "bind-tracker", "--root", root, "--provider", "github"],
        { encoding: "utf8", env: { ...process.env, HOME: home } },
      );
      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.match(result.stdout, /Tracker: github \(repo acme\/widgets\)/u);

      const state = resolveFactoryStatePaths({ homeDir: home, targetRepoPath: root, factoryId: path.basename(root) });
      const envelopeYaml = readFileSync(state.envelope, "utf8");
      assert.equal(validateEnvelopeYaml(envelopeYaml).ok, true, validateEnvelopeYaml(envelopeYaml).errors.join("\n"));
      assert.match(envelopeYaml, /provider: github/u);
      assert.match(envelopeYaml, /repo: "acme\/widgets"/u);
      assert.doesNotMatch(envelopeYaml, /team:/u);
      assert.deepEqual(walkFiles(root), beforeRepo);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

test("factory bind-tracker without an explicit provider leaves the tracker inactive", () => {
  withTempRepo({
    "package.json": `${JSON.stringify({ scripts: { test: "node --test" } }, null, 2)}\n`,
  }, (root) => {
    const home = mkdtempSync(path.join(tmpdir(), "factory-bind-inactive-home-"));
    try {
      initEnvelope({ root, homeDir: home, generatedAt });
      const state = resolveFactoryStatePaths({ homeDir: home, targetRepoPath: root, factoryId: path.basename(root) });
      const before = readFileSync(state.envelope, "utf8");
      const result = spawnSync(
        process.execPath,
        [factoryCli, "bind-tracker", "--root", root],
        { encoding: "utf8", env: { ...process.env, HOME: home } },
      );
      assert.equal(result.status, 1);
      assert.match(result.stderr, /explicit --provider <linear\|github> is required; tracker left inactive/u);
      assert.equal(readFileSync(state.envelope, "utf8"), before);
      assert.match(before, /provider: none/u);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

test("factory bind-tracker before init-envelope reports a missing envelope", () => {
  withTempRepo({
    "package.json": `${JSON.stringify({ scripts: { test: "node --test" } }, null, 2)}\n`,
  }, (root) => {
    const home = mkdtempSync(path.join(tmpdir(), "factory-bind-missing-home-"));
    try {
      const result = spawnSync(
        process.execPath,
        [factoryCli, "bind-tracker", "--root", root, "--provider", "linear", "--team", "Loom", "--project", "Factory Nucleus"],
        { encoding: "utf8", env: { ...process.env, HOME: home } },
      );
      assert.equal(result.status, 1);
      assert.match(result.stderr, /factory envelope not found; run init-envelope first/u);
      const state = resolveFactoryStatePaths({ homeDir: home, targetRepoPath: root, factoryId: path.basename(root) });
      assert.equal(existsSync(state.envelope), false);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

test("factory bind-tracker rejects invalid binds and leaves the envelope unchanged", () => {
  const cases = [
    { args: ["--provider", "bitbucket"], message: /unknown tracker provider: bitbucket/u },
    { args: ["--provider", "linear"], message: /linear bind requires --team and --project/u },
    { args: ["--provider", "github"], message: /could not detect a GitHub source repo/u },
  ];
  for (const { args, message } of cases) {
    withTempRepo({
      "package.json": `${JSON.stringify({ scripts: { test: "node --test" } }, null, 2)}\n`,
    }, (root) => {
      const home = mkdtempSync(path.join(tmpdir(), "factory-bind-reject-home-"));
      try {
        initEnvelope({ root, homeDir: home, generatedAt });
        const state = resolveFactoryStatePaths({ homeDir: home, targetRepoPath: root, factoryId: path.basename(root) });
        const before = readFileSync(state.envelope, "utf8");
        const result = spawnSync(
          process.execPath,
          [factoryCli, "bind-tracker", "--root", root, ...args],
          { encoding: "utf8", env: { ...process.env, HOME: home } },
        );
        assert.equal(result.status, 1, result.stdout);
        assert.match(result.stderr, message);
        assert.equal(readFileSync(state.envelope, "utf8"), before);
        assert.match(before, /provider: none/u);
      } finally {
        rmSync(home, { recursive: true, force: true });
      }
    });
  }
});

// A schema-valid envelope used for the portable export/import round-trip tests.
const SAMPLE_ENVELOPE = {
  schemaVersion: 1,
  kind: "envelope",
  generatedAt,
  factory: { id: "loom", repo: { name: "loom", root: "." } },
  tracker: { provider: "linear", team: "Loom", project: "Factory Nucleus" },
  delivery: { defaultBranch: "main", branchPrefix: "factory", autoMerge: false },
  proof: { commands: ["npm run check"] },
  agents: { maxSubagents: 4, allowFullTranscriptCapture: false },
  circuits: [
    { name: "proof-required", gate: "proof", outcome: "block", enforcement: "validate", reason: "Launch requires proof." },
  ],
};

test("envelope export/import round-trips a clean durable policy", () => {
  const { yaml, envelope } = exportEnvelope(SAMPLE_ENVELOPE);
  // A clean envelope has nothing to redact, so export preserves the policy.
  assert.deepEqual(envelope, SAMPLE_ENVELOPE);
  assert.equal(validateEnvelopeYaml(yaml).ok, true);
  assert.deepEqual(importEnvelope(yaml), SAMPLE_ENVELOPE);
});

test("envelope export redacts secret-looking values and still validates", () => {
  const withSecret = {
    ...SAMPLE_ENVELOPE,
    delivery: { ...SAMPLE_ENVELOPE.delivery, branchPrefix: "ghp_branchsecret0123456789" },
    proof: { commands: ["npm run check", "deploy --key sk-livesecret0123456789"] },
  };
  const { yaml } = exportEnvelope(withSecret);

  // The secret bodies must not survive export; redaction markers replace them.
  assert.doesNotMatch(yaml, /livesecret0123456789/u);
  assert.doesNotMatch(yaml, /branchsecret0123456789/u);
  assert.match(yaml, /\[REDACTED\]/u);

  // The redacted export still validates and round-trips to the redacted policy.
  assert.equal(validateEnvelopeYaml(yaml).ok, true);
  assert.deepEqual(importEnvelope(yaml), redactEnvelope(withSecret));
});

test("envelope import rejects schema-invalid input", () => {
  assert.throws(
    () => importEnvelope("schemaVersion: 1\nkind: envelope\n"),
    /invalid imported envelope/u,
  );
});

test("envelope export fails closed on an invalid envelope", () => {
  const broken = { ...SAMPLE_ENVELOPE, tracker: { provider: "gitlab" } };
  assert.throws(() => exportEnvelope(broken), /refusing to export an invalid envelope/u);
});
