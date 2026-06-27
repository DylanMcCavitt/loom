import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const renderer = new URL("../scripts/render-harness-nucleus.mjs", import.meta.url).pathname;
const templatesDir = new URL("../docs/harness/codex-adapter-plan/templates", import.meta.url).pathname;
const planPath = new URL("../docs/harness/codex-adapter-plan/adapter-plan.json", import.meta.url).pathname;
import {
  applyCandidates,
  configKeys,
  configKindFor,
  renderAndGate,
} from "../scripts/render-harness-nucleus.mjs";

function withTempPlan(addBoundary) {
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  plan.templateBoundaries.push(addBoundary);
  const file = path.join(mkdtempSync(path.join(tmpdir(), "render-plan-")), "adapter-plan.json");
  writeFileSync(file, JSON.stringify(plan));
  return file;
}

const FORBIDDEN_KEY_TOKENS = [
  "model_provider",
  "model_providers",
  "openai_base_url",
  "chatgpt_base_url",
  "[profiles",
  "forced_login_method",
  "[otel",
  "[notify",
];

function run(args = []) {
  return spawnSync(process.execPath, [renderer, ...args], { encoding: "utf8" });
}

function runJson(args = []) {
  const result = run([...args, "--json"]);
  return { result, manifest: result.status === null ? null : JSON.parse(result.stdout) };
}

function tempDir(prefix) {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function listFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(path.relative(root, full));
    }
  };
  try {
    walk(root);
  } catch {
    return [];
  }
  return out.sort();
}

test("dry-run renders a deterministic manifest and touches no live path", () => {
  const home = tempDir("render-home-");
  const first = runJson(["--home", home]);
  assert.equal(first.result.status, 0, first.result.stderr);
  assert.equal(first.manifest.result, "pass");
  assert.deepEqual(first.manifest.findings, []);
  // No live path written in dry-run.
  assert.deepEqual(listFiles(home), []);

  // Deterministic: a second dry-run yields byte-identical candidates and ordering.
  const second = runJson(["--home", home]);
  assert.deepEqual(second.manifest.candidates, first.manifest.candidates);
  assert.deepEqual(second.manifest.skippedLocalOnly, first.manifest.skippedLocalOnly);

  rmSync(home, { recursive: true, force: true });
});

test("dry-run resolves dispositions: track/adapt appliable, reference-only and local-only reported/skipped", () => {
  const home = tempDir("render-home-");
  const { manifest } = runJson(["--home", home]);

  const byDestination = new Map(manifest.candidates.map((entry) => [entry.destination, entry]));
  for (const candidate of manifest.candidates) {
    assert.doesNotMatch(candidate.destination, /(?:^|\/)omp-(?:designer|planner|reviewer|librarian)\.toml$/u);
    assert.doesNotMatch(candidate.source, /templates\/agents\/omp-(?:designer|planner|reviewer)\.toml$/u);
  }
  assert.ok(!byDestination.has("~/.codex/agents/omp-reviewer.toml"));
  assert.ok(!byDestination.has(".codex/agents/omp-reviewer.toml"));
  // Track: tracked OMP source is appliable.
  assert.equal(byDestination.get("~/.omp/agent/AGENTS.md").disposition, "track");
  assert.equal(byDestination.get("~/.omp/agent/AGENTS.md").appliable, true);
  // Reference-only: the shared ~/.codex/config.toml merge surface is reported, never appliable.
  assert.equal(byDestination.get("~/.codex/config.toml").disposition, "reference-only");
  assert.equal(byDestination.get("~/.codex/config.toml").appliable, false);

  // Local-only surfaces are reported as skipped and never become candidate destinations.
  assert.ok(manifest.skippedLocalOnly.includes("~/.codex/auth.json"));
  assert.ok(manifest.skippedLocalOnly.includes("~/.codex/sessions/"));
  for (const entry of manifest.candidates) {
    assert.notEqual(entry.disposition, "local-only");
  }
  rmSync(home, { recursive: true, force: true });
});

test("gate runs over rendered output: a forbidden provider key in a template fails the render", () => {
  const home = tempDir("render-home-");
  const td = tempDir("render-templates-");
  cpSync(templatesDir, td, { recursive: true });
  appendFileSync(path.join(td, "base.config.template.toml"), '\nmodel = "gpt-x"\n');

  const result = run(["--home", home, "--template-dir", td]);
  assert.equal(result.status, 1, "expected non-zero exit on forbidden key");
  assert.match(result.stdout + result.stderr, /forbidden key model/u);

  rmSync(home, { recursive: true, force: true });
  rmSync(td, { recursive: true, force: true });
});

test("gate runs over rendered output: an absolute private home path in a template fails the render", () => {
  const home = tempDir("render-home-");
  const td = tempDir("render-templates-");
  cpSync(templatesDir, td, { recursive: true });
  appendFileSync(path.join(td, "profile.omp-harness.config.template.toml"), '\n# leak /Users/victim/secret\n');

  const result = run(["--home", home, "--template-dir", td]);
  assert.equal(result.status, 1, "expected non-zero exit on private home path");
  assert.match(result.stdout + result.stderr, /private home path/u);

  rmSync(home, { recursive: true, force: true });
  rmSync(td, { recursive: true, force: true });
});

test("--write applies create-missing-only, records markers, and a second run is a clean no-op", () => {
  const home = tempDir("render-home-");

  const first = runJson(["--write", "--home", home]);
  assert.equal(first.result.status, 0, first.result.stderr);
  const created = first.manifest.actions.filter((a) => a.action === "created").map((a) => a.destination);
  assert.deepEqual(
    created.sort(),
    [
      "~/.omp/agent/AGENTS.md",
      "~/.omp/agent/RULES.md",
      "~/.omp/agent/config.yml",
    ].sort(),
  );
  // Marker manifest is written outside the repo, in the live home tree.
  const markerFile = path.join(home, ".loom-harness", "applied-manifest.json");
  const marker = JSON.parse(readFileSync(markerFile, "utf8"));
  assert.equal(Object.keys(marker.entries).length, 3);

  // No applied artifact carries provider/model/auth/telemetry/profile keys or secrets.
  for (const rel of listFiles(home)) {
    if (rel.startsWith(".loom-harness")) continue;
    const text = readFileSync(path.join(home, rel), "utf8");
    for (const token of FORBIDDEN_KEY_TOKENS) assert.ok(!text.includes(token), `${rel} contains ${token}`);
    assert.doesNotMatch(text, /\bsk-[A-Za-z0-9_-]{20,}\b/u, `${rel} contains secret-looking text`);
  }

  // Idempotent: a second --write changes nothing on disk.
  const before = listFiles(home).map((rel) => [rel, readFileSync(path.join(home, rel), "utf8")]);
  const second = runJson(["--write", "--home", home]);
  assert.equal(second.result.status, 0);
  assert.ok(second.manifest.actions.every((a) => a.action === "already-applied"));
  const after = listFiles(home).map((rel) => [rel, readFileSync(path.join(home, rel), "utf8")]);
  assert.deepEqual(after, before);

  rmSync(home, { recursive: true, force: true });
});

test("dry-run verification reports marker ownership after write", () => {
  const home = tempDir("render-home-");
  try {
    const write = runJson(["--write", "--home", home]);
    assert.equal(write.result.status, 0, write.result.stderr);
    const createdDestinations = write.manifest.actions
      .filter((entry) => entry.action === "created")
      .map((entry) => entry.destination);
    assert.ok(createdDestinations.length > 0, "expected at least one created candidate");

    const verify = runJson(["--home", home]);
    assert.equal(verify.result.status, 0, verify.result.stderr);
    for (const destination of createdDestinations) {
      const candidate = verify.manifest.candidates.find((entry) => entry.destination === destination);
      assert.equal(candidate?.liveStatus, "already-applied", `${destination} must verify as applied`);
      assert.equal(candidate?.ownership, "marker-owned", `${destination} must verify as marker-owned`);
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("--write ignores pre-existing superseded OMP-prefixed Codex agent files", () => {
  const home = tempDir("render-home-");
  mkdirSync(path.join(home, ".codex", "agents"), { recursive: true });
  const userFile = path.join(home, ".codex", "agents", "omp-reviewer.toml");
  const userContent = "USER EDITED — keep me\n";
  writeFileSync(userFile, userContent);

  const { manifest } = runJson(["--write", "--home", home]);
  assert.ok(!manifest.actions.some((a) => a.destination === "~/.codex/agents/omp-reviewer.toml"));
  assert.equal(readFileSync(userFile, "utf8"), userContent);
  // The superseded user file is not adopted as a kit marker.
  const marker = JSON.parse(readFileSync(path.join(home, ".loom-harness", "applied-manifest.json"), "utf8"));
  assert.ok(!("~/.codex/agents/omp-reviewer.toml" in marker.entries));

  rmSync(home, { recursive: true, force: true });
});

test("--write backs up a drifted kit-owned marker before updating it", () => {
  const home = tempDir("render-home-");
  runJson(["--write", "--home", home]); // fresh apply records markers
  const live = path.join(home, ".omp", "agent", "config.yml");
  const rendered = readFileSync(live, "utf8");
  appendFileSync(live, "\n# drifted by operator\n");

  const { manifest } = runJson(["--write", "--home", home]);
  const updated = manifest.actions.find((a) => a.destination === "~/.omp/agent/config.yml");
  assert.equal(updated.action, "updated");
  assert.ok(updated.backup, "expected a backup path");
  // Backup captured the drifted content; live file is restored to the rendered content.
  assert.match(readFileSync(updated.backup, "utf8"), /drifted by operator/u);
  assert.equal(readFileSync(live, "utf8"), rendered);
  // Backups live alongside the live file, never inside the repo.
  assert.ok(updated.backup.startsWith(path.join(home, ".omp", "agent")));

  rmSync(home, { recursive: true, force: true });
});

test("superseded OMP-prefixed custom-agent templates are not active render inputs", () => {
  const home = tempDir("render-home-");
  const td = tempDir("render-templates-");
  cpSync(templatesDir, td, { recursive: true });
  appendFileSync(path.join(td, "agents", "omp-reviewer.toml"), '\nmodel_provider = "openai"\n');

  const { result, manifest } = runJson(["--home", home, "--template-dir", td]);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!manifest.candidates.some((entry) => /omp-(?:designer|planner|reviewer|librarian)\.toml/u.test(entry.destination)));
  assert.ok(!manifest.candidates.some((entry) => /templates\/agents\/omp-(?:designer|planner|reviewer)\.toml/u.test(entry.source)));

  rmSync(home, { recursive: true, force: true });
  rmSync(td, { recursive: true, force: true });
});

test("gate runs over rendered output: a quoted forbidden TOML key still fails the render", () => {
  const home = tempDir("render-home-");
  const td = tempDir("render-templates-");
  cpSync(templatesDir, td, { recursive: true });
  appendFileSync(path.join(td, "base.config.template.toml"), '\n"model" = "gpt-x"\n');

  const result = run(["--home", home, "--template-dir", td]);
  assert.equal(result.status, 1, "expected non-zero exit on quoted forbidden key");
  assert.match(result.stdout + result.stderr, /forbidden key model/u);

  rmSync(home, { recursive: true, force: true });
  rmSync(td, { recursive: true, force: true });
});

test("gate runs over rendered output: a forbidden key in YAML OMP source fails the render", () => {
  const home = tempDir("render-home-");
  const ompSrc = tempDir("render-omp-");
  writeFileSync(path.join(ompSrc, "config.yml"), "model_provider: openai\ntheme:\n  dark: x\n");

  const result = run(["--home", home, "--omp-source", ompSrc]);
  assert.equal(result.status, 1, "expected non-zero exit on forbidden YAML key");
  assert.match(result.stdout + result.stderr, /forbidden key model_provider/u);

  rmSync(home, { recursive: true, force: true });
  rmSync(ompSrc, { recursive: true, force: true });
});

test("preflight fails a candidate destination that escapes via path traversal", () => {
  const home = tempDir("render-home-");
  const evilPlan = withTempPlan({
    id: "evil-traversal",
    templatePath: "docs/harness/codex-adapter-plan/templates/base.config.template.toml",
    candidateDestinations: ["~/.codex/agents/../../../../escape.toml"],
    allowedKeys: [],
    forbiddenKeys: ["x"],
    boundary: "test",
  });

  const result = run(["--home", home, "--plan", evilPlan]);
  assert.equal(result.status, 1, "expected non-zero exit on traversal");
  assert.match(result.stdout + result.stderr, /path traversal/u);
  // Nothing escaped onto disk.
  assert.deepEqual(listFiles(home), []);

  rmSync(home, { recursive: true, force: true });
  rmSync(path.dirname(evilPlan), { recursive: true, force: true });
});

test("gate fails a candidate that targets a local-only destination", () => {
  const home = tempDir("render-home-");
  const evilPlan = withTempPlan({
    id: "evil-local-only",
    templatePath: "docs/harness/codex-adapter-plan/templates/base.config.template.toml",
    candidateDestinations: ["~/.codex/automations/evil.toml"],
    allowedKeys: [],
    forbiddenKeys: ["x"],
    boundary: "test",
  });

  const result = run(["--home", home, "--plan", evilPlan]);
  assert.equal(result.status, 1, "expected non-zero exit on local-only destination");
  assert.match(result.stdout + result.stderr, /local-only/u);

  rmSync(home, { recursive: true, force: true });
  rmSync(path.dirname(evilPlan), { recursive: true, force: true });
});

// --- JSON manifest gating (LOO-8 slice 1) -----------------------------------------------------

function jsonCandidate(content, overrides = {}) {
  const destination = overrides.destination ?? "~/.omp/agent/test-manifest.json";
  return {
    id: `omp:${destination}`,
    harness: "omp",
    boundaryId: null,
    forbiddenKeys: overrides.forbiddenKeys ?? [],
    source: "test/manifest.json",
    content,
    renderedRelPath: overrides.rel ?? "omp/agent/test-manifest.json",
    destination,
    disposition: "track",
    operation: "create-file",
    appliable: true,
  };
}

test("config kind detection recognises .json alongside .toml and .yaml", () => {
  assert.equal(configKindFor("agent/manifest.json"), "json");
  assert.equal(configKindFor("config.toml"), "toml");
  assert.equal(configKindFor("config.yaml"), "yaml");
  assert.equal(configKindFor("config.yml"), "yaml");
  assert.equal(configKindFor("notes.txt"), null);
  const keys = configKeys(JSON.stringify({ outer: { inner: 1 }, list: [{ deep: 2 }] }), "json");
  assert.ok(
    keys.has("outer") && keys.has("inner") && keys.has("list") && keys.has("deep"),
    `expected recursive JSON keys, got ${[...keys].join(",")}`,
  );
});

test("gate flags a top-level forbidden key in a rendered JSON manifest", () => {
  const findings = renderAndGate([jsonCandidate(JSON.stringify({ model_provider: "openai" }))], []);
  assert.ok(
    findings.some((finding) => finding.includes("forbidden key model_provider")),
    findings.join("\n"),
  );
});

test("gate flags a nested forbidden key in a rendered JSON manifest", () => {
  const findings = renderAndGate(
    [jsonCandidate(JSON.stringify({ settings: { profiles: { default: {} } } }))],
    [],
  );
  assert.ok(
    findings.some((finding) => finding.includes("forbidden key profiles")),
    findings.join("\n"),
  );
});

test("gate honours per-candidate forbiddenKeys for JSON manifests", () => {
  const findings = renderAndGate(
    [jsonCandidate(JSON.stringify({ plugin_id: "x" }), { forbiddenKeys: ["plugin_id"] })],
    [],
  );
  assert.ok(
    findings.some((finding) => finding.includes("forbidden key plugin_id")),
    findings.join("\n"),
  );
});

test("gate reports malformed rendered JSON as a finding instead of throwing", () => {
  let findings;
  assert.doesNotThrow(() => {
    findings = renderAndGate([jsonCandidate("{ not valid json ")], []);
  });
  assert.ok(
    findings.some((finding) => finding.includes("invalid JSON")),
    findings.join("\n"),
  );
});

test("gate passes a clean rendered JSON manifest with no forbidden keys", () => {
  const content = JSON.stringify(
    { name: "loom-plugin", version: "1.0.0", entries: [{ id: "a" }] },
    null,
    2,
  );
  const findings = renderAndGate([jsonCandidate(content)], []);
  assert.deepEqual(findings, []);
});

// --- applyCandidates apply engine (LOO-8 slice 1) ---------------------------------------------

function applyCandidate(destination, content) {
  return {
    id: destination,
    harness: "omp",
    boundaryId: null,
    forbiddenKeys: [],
    source: "test",
    content,
    renderedRelPath: "omp/agent/x",
    destination,
    disposition: "track",
    operation: "create-file",
    appliable: true,
  };
}

function emptyMarker() {
  return { schemaVersion: 1, generatedBy: "test", entries: {} };
}

test("applyCandidates creates missing files, records markers, and is idempotent", () => {
  const home = tempDir("apply-home-");
  const marker = emptyMarker();
  const dest = "~/.loom-apply/manifest.json";
  const content = '{"name":"ok"}\n';
  const live = path.join(home, ".loom-apply/manifest.json");

  const first = applyCandidates([applyCandidate(dest, content)], home, marker);
  assert.equal(first.actions.length, 1);
  assert.equal(first.actions[0].action, "created");
  assert.equal(first.backups.length, 0);
  assert.equal(readFileSync(live, "utf8"), content);
  assert.ok(marker.entries[dest], "expected a recorded marker entry");

  // Second run against the same marker is a clean no-op (no rewrite, no backup).
  const second = applyCandidates([applyCandidate(dest, content)], home, marker);
  assert.equal(second.actions[0].action, "already-applied");
  assert.equal(second.backups.length, 0);

  rmSync(home, { recursive: true, force: true });
});

test("applyCandidates skips a pre-existing non-marker user file (create-missing-only)", () => {
  const home = tempDir("apply-home-");
  const dest = "~/.loom-apply/user.json";
  const live = path.join(home, ".loom-apply/user.json");
  mkdirSync(path.dirname(live), { recursive: true });
  writeFileSync(live, "USER OWNED\n");

  const result = applyCandidates([applyCandidate(dest, '{"name":"kit"}\n')], home, emptyMarker());
  assert.equal(result.actions[0].action, "skipped");
  assert.equal(result.actions[0].reason, "exists");
  assert.equal(readFileSync(live, "utf8"), "USER OWNED\n", "user file must be byte-for-byte intact");

  rmSync(home, { recursive: true, force: true });
});

test("applyCandidates skips non-appliable and non-home-scoped candidates", () => {
  const home = tempDir("apply-home-");
  const nonAppliable = { ...applyCandidate("~/.loom-apply/skip.json", "{}\n"), appliable: false };
  const projectScoped = applyCandidate("./project/local.json", "{}\n");

  const result = applyCandidates([nonAppliable, projectScoped], home, emptyMarker());
  assert.equal(result.actions.length, 1, "non-appliable candidate must produce no action");
  assert.equal(result.actions[0].action, "skipped");
  assert.equal(result.actions[0].reason, "not home-scoped");

  rmSync(home, { recursive: true, force: true });
});
