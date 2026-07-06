import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, lstatSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { claudePlanPath as claudePlanRel, codexPlanPath, codexTemplatesDir, ompSourceRoot } from "../scripts/lib/layout.mjs";

const renderer = new URL("../scripts/render-nucleus.mjs", import.meta.url).pathname;
const templatesDir = new URL(`../${codexTemplatesDir}`, import.meta.url).pathname;
const planPath = new URL(`../${codexPlanPath}`, import.meta.url).pathname;
const claudePlanPath = new URL(`../${claudePlanRel}`, import.meta.url).pathname;
import { applyCandidates } from "../scripts/lib/harness-apply-engine.mjs";
import { configKeys, configKindFor, renderAndGate } from "../scripts/lib/harness-render-gate.mjs";

function withTempPlan(addBoundary) {
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  plan.templateBoundaries.push(addBoundary);
  const file = path.join(mkdtempSync(path.join(tmpdir(), "render-plan-")), "adapter-plan.json");
  writeFileSync(file, JSON.stringify(plan));
  return file;
}

function withTempClaudePlan(mutator) {
  const plan = JSON.parse(readFileSync(claudePlanPath, "utf8"));
  const root = mkdtempSync(path.join(tmpdir(), "render-claude-plan-"));
  mutator(plan, root);
  const file = path.join(root, "adapter-plan.json");
  writeFileSync(file, JSON.stringify(plan));
  return { file, root };
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

test("dry-run reports Claude instruction and settings candidates without write eligibility", () => {
  const home = tempDir("render-home-");
  const { manifest } = runJson(["--home", home]);
  const claude = manifest.candidates.filter((entry) => entry.harness === "claude");
  const byDestination = new Map(claude.map((entry) => [entry.destination, entry]));

  const instructionSettings = claude.filter((entry) =>
    entry.boundaryId === "claude-instructions" || entry.boundaryId === "claude-settings",
  );
  assert.deepEqual(
    instructionSettings.map((entry) => entry.destination),
    [
      ".claude/CLAUDE.md",
      ".claude/settings.json",
      "~/.claude/CLAUDE.md",
      "~/.claude/settings.json",
      "CLAUDE.md",
    ],
  );
  for (const entry of claude) {
    assert.equal(entry.operation, "future-issue-required");
    assert.equal(entry.appliable, false);
    assert.equal(entry.requiredApproval, "n/a (reported only)");
  }
  assert.equal(byDestination.get("~/.claude/settings.json").disposition, "adapt");
  assert.equal(byDestination.get("~/.claude/CLAUDE.md").disposition, "reference-only");
  assert.ok(manifest.skippedLocalOnly.includes("~/.claude/settings.local.json"));
  assert.ok(manifest.skippedLocalOnly.includes("~/.claude/history.jsonl"));
  assert.ok(manifest.skippedLocalOnly.includes("~/.claude/projects/"));
  assert.deepEqual(listFiles(home), []);

  rmSync(home, { recursive: true, force: true });
});

test("dry-run reports generated Claude agent and skill candidates with disposition and overwrite risk", () => {
  const home = tempDir("render-home-");
  const { manifest } = runJson(["--home", home]);
  const agents = manifest.candidates.filter((entry) => entry.boundaryId === "claude-agent");
  const skills = manifest.candidates.filter((entry) => entry.boundaryId === "claude-skill");

  const agentNames = ["omp-designer", "omp-explorer", "omp-librarian", "omp-planner", "omp-reviewer"];
  assert.deepEqual(
    agents.map((entry) => entry.destination).sort(),
    agentNames.flatMap((name) => [`.claude/agents/${name}.md`, `~/.claude/agents/${name}.md`]).sort(),
  );
  const skillNames = ["omp-handoff", "omp-plan"];
  assert.deepEqual(
    skills.map((entry) => entry.destination).sort(),
    skillNames.flatMap((name) => [`.claude/skills/${name}/SKILL.md`, `~/.claude/skills/${name}/SKILL.md`]).sort(),
  );

  for (const entry of [...agents, ...skills]) {
    // Live ~/.claude surfaces are adapt per the manifest; project-scoped copies are reference-only.
    assert.equal(entry.disposition, entry.destination.startsWith("~/") ? "adapt" : "reference-only");
    // HITL write semantics are undecided, so every generated candidate stays reported-only.
    assert.equal(entry.operation, "future-issue-required");
    assert.equal(entry.appliable, false);
    assert.equal(typeof entry.overwriteRisk, "string");
    assert.equal(entry.requiredApproval, "n/a (reported only)");
  }
  assert.deepEqual(listFiles(home), []);

  rmSync(home, { recursive: true, force: true });
});

test("no whole-root or symlink-manifest Claude skill candidate is rendered", () => {
  const home = tempDir("render-home-");
  const { manifest } = runJson(["--home", home]);
  const claude = manifest.candidates.filter((entry) => entry.harness === "claude");

  assert.ok(!claude.some((entry) => entry.boundaryId === "skill-symlink-candidates"));
  assert.ok(!claude.some((entry) => entry.destination.includes("<name>")));
  // Every rendered skill candidate is a curated per-skill file, never a skills-root target.
  for (const entry of claude.filter((candidate) => candidate.destination.includes("/skills/"))) {
    assert.match(entry.destination, /\/skills\/[^/]+\/SKILL\.md$/u);
  }
  assert.deepEqual(listFiles(home), []);

  rmSync(home, { recursive: true, force: true });
});

test("dry-run reports existing Claude files as user-owned future issue work", () => {
  const home = tempDir("render-home-");
  mkdirSync(path.join(home, ".claude"), { recursive: true });
  writeFileSync(path.join(home, ".claude", "CLAUDE.md"), "operator instructions\n");
  writeFileSync(path.join(home, ".claude", "settings.json"), "{\"includeCoAuthoredBy\": true}\n");

  const { manifest } = runJson(["--home", home]);
  const byDestination = new Map(manifest.candidates.map((entry) => [entry.destination, entry]));
  for (const destination of ["~/.claude/CLAUDE.md", "~/.claude/settings.json"]) {
    const entry = byDestination.get(destination);
    assert.equal(entry.liveStatus, "user-file");
    assert.equal(entry.ownership, "user-file");
    assert.equal(entry.operation, "future-issue-required");
    assert.equal(entry.appliable, false);
    assert.equal(entry.overwriteRisk, "would not overwrite (existing non-marker file skipped)");
  }
  assert.equal(readFileSync(path.join(home, ".claude", "CLAUDE.md"), "utf8"), "operator instructions\n");
  assert.equal(readFileSync(path.join(home, ".claude", "settings.json"), "utf8"), "{\"includeCoAuthoredBy\": true}\n");

  rmSync(home, { recursive: true, force: true });
});

test("text dry-run includes overwrite risk for reported Claude candidates", () => {
  const home = tempDir("render-home-");
  mkdirSync(path.join(home, ".claude"), { recursive: true });
  writeFileSync(path.join(home, ".claude", "settings.json"), "{\"includeCoAuthoredBy\": true}\n");

  const result = run(["--home", home]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /- ~\/\.claude\/settings\.json/u);
  assert.match(result.stdout, /operation: future-issue-required/u);
  assert.match(result.stdout, /overwriteRisk: would not overwrite \(existing non-marker file skipped\)/u);
  assert.match(result.stdout, /requiredApproval: n\/a \(reported only\)/u);

  rmSync(home, { recursive: true, force: true });
});

// --- Claude strict-manual apply gate (LOO-151) -----------------------------------------------

const LOO_151_CLAUDE_APPLY_CANDIDATES = [
  {
    destination: "~/.claude/settings.json",
    liveRel: ".claude/settings.json",
    source: "adapters/claude/templates/settings.template.json",
  },
  {
    destination: "~/.claude/agents/omp-designer.md",
    liveRel: ".claude/agents/omp-designer.md",
    source: "adapters/claude/templates/agents/omp-designer.md",
  },
  {
    destination: "~/.claude/agents/omp-explorer.md",
    liveRel: ".claude/agents/omp-explorer.md",
    source: "adapters/claude/templates/agents/omp-explorer.md",
  },
  {
    destination: "~/.claude/agents/omp-librarian.md",
    liveRel: ".claude/agents/omp-librarian.md",
    source: "adapters/claude/templates/agents/omp-librarian.md",
  },
  {
    destination: "~/.claude/agents/omp-planner.md",
    liveRel: ".claude/agents/omp-planner.md",
    source: "adapters/claude/templates/agents/omp-planner.md",
  },
  {
    destination: "~/.claude/agents/omp-reviewer.md",
    liveRel: ".claude/agents/omp-reviewer.md",
    source: "adapters/claude/templates/agents/omp-reviewer.md",
  },
  {
    destination: "~/.claude/skills/omp-handoff/SKILL.md",
    liveRel: ".claude/skills/omp-handoff/SKILL.md",
    source: "adapters/claude/templates/skills/omp-handoff/SKILL.md",
  },
  {
    destination: "~/.claude/skills/omp-plan/SKILL.md",
    liveRel: ".claude/skills/omp-plan/SKILL.md",
    source: "adapters/claude/templates/skills/omp-plan/SKILL.md",
  },
];

const LOO_151_CLAUDE_APPLY_DESTINATIONS = LOO_151_CLAUDE_APPLY_CANDIDATES.map((entry) => entry.destination);

function repoFixture(rel) {
  return new URL(`../${rel}`, import.meta.url).pathname;
}

test("dry-run with --approve-claude-apply makes only home-scoped adapt Claude candidates appliable", () => {
  const home = tempDir("render-home-");
  const { result, manifest } = runJson(["--home", home, "--approve-claude-apply"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(manifest.result, "pass");

  const claude = manifest.candidates.filter((entry) => entry.harness === "claude");
  const appliable = claude.filter((entry) => entry.appliable);
  assert.deepEqual(
    appliable.map((entry) => entry.destination).sort(),
    LOO_151_CLAUDE_APPLY_DESTINATIONS.toSorted(),
  );

  for (const destination of LOO_151_CLAUDE_APPLY_DESTINATIONS) {
    const entry = claude.find((candidate) => candidate.destination === destination);
    assert.equal(entry?.disposition, "adapt", `${destination} must stay an adapt-disposition candidate`);
    assert.equal(entry?.operation, "create-file", `${destination} must be create-file under explicit approval`);
    assert.equal(entry?.requiredApproval, "strict-manual + --approve-claude-apply");
  }

  const reportedClaude = claude.filter(
    (entry) => entry.destination === "~/.claude/CLAUDE.md" || !entry.destination.startsWith("~/"),
  );
  assert.ok(reportedClaude.length > 0, "expected reference-only and project-scoped Claude candidates");
  for (const entry of reportedClaude) {
    assert.equal(entry.operation, "future-issue-required", `${entry.destination} must remain reported-only`);
    assert.equal(entry.appliable, false, `${entry.destination} must not be appliable`);
    assert.equal(entry.requiredApproval, "n/a (reported only)", `${entry.destination} must not require apply approval`);
  }

  assert.deepEqual(listFiles(home), []);

  rmSync(home, { recursive: true, force: true });
});

test("--write without --approve-claude-apply leaves Claude home paths untouched", () => {
  const home = tempDir("render-home-");
  const { result, manifest } = runJson(["--write", "--home", home]);
  assert.equal(result.status, 0, result.stderr);

  assert.ok(
    !manifest.actions.some((entry) => entry.destination.startsWith("~/.claude/")),
    "Claude candidates must not enter the write action set without explicit approval",
  );
  assert.ok(
    !listFiles(home).some((rel) => rel.startsWith(".claude/")),
    "default --write must not create files under the scoped Claude home",
  );

  rmSync(home, { recursive: true, force: true });
});

test("--write with --approve-claude-apply creates the gated Claude files and is idempotent", () => {
  const home = tempDir("render-home-");
  const first = runJson(["--write", "--approve-claude-apply", "--home", home]);
  assert.equal(first.result.status, 0, first.result.stderr);

  const createdClaude = first.manifest.actions
    .filter((entry) => entry.action === "created" && entry.destination.startsWith("~/.claude/"))
    .map((entry) => entry.destination);
  assert.deepEqual(createdClaude.sort(), LOO_151_CLAUDE_APPLY_DESTINATIONS.toSorted());
  assert.ok(
    first.manifest.actions.some((entry) => entry.action === "created" && entry.destination.startsWith("~/.omp/agent/")),
    "approved Claude apply must still write the normal OMP files",
  );

  const markerFile = path.join(home, ".loom-harness", "applied-manifest.json");
  const marker = JSON.parse(readFileSync(markerFile, "utf8"));
  for (const { destination, liveRel, source } of LOO_151_CLAUDE_APPLY_CANDIDATES) {
    assert.equal(readFileSync(path.join(home, liveRel), "utf8"), readFileSync(repoFixture(source), "utf8"));
    assert.equal(marker.entries[destination]?.renderedFrom, source, `${destination} must be recorded in the marker`);
  }

  const before = listFiles(home).map((rel) => [rel, readFileSync(path.join(home, rel), "utf8")]);
  const second = runJson(["--write", "--approve-claude-apply", "--home", home]);
  assert.equal(second.result.status, 0, second.result.stderr);
  assert.ok(second.manifest.actions.every((entry) => entry.action === "already-applied"));
  assert.deepEqual(second.manifest.backups, []);
  const after = listFiles(home).map((rel) => [rel, readFileSync(path.join(home, rel), "utf8")]);
  assert.deepEqual(after, before);

  rmSync(home, { recursive: true, force: true });
});

test("--write with --approve-claude-apply skips pre-existing user Claude settings", () => {
  const home = tempDir("render-home-");
  const settingsFile = path.join(home, ".claude", "settings.json");
  const userSettings = "{\"includeCoAuthoredBy\": false, \"operator\": \"keep\"}\n";
  mkdirSync(path.dirname(settingsFile), { recursive: true });
  writeFileSync(settingsFile, userSettings);

  const { result, manifest } = runJson(["--write", "--approve-claude-apply", "--home", home]);
  assert.equal(result.status, 0, result.stderr);
  const settingsAction = manifest.actions.find((entry) => entry.destination === "~/.claude/settings.json");
  assert.equal(settingsAction?.action, "skipped");
  assert.equal(settingsAction?.reason, "exists");
  assert.equal(readFileSync(settingsFile, "utf8"), userSettings);

  const marker = JSON.parse(readFileSync(path.join(home, ".loom-harness", "applied-manifest.json"), "utf8"));
  assert.ok(!("~/.claude/settings.json" in marker.entries));

  rmSync(home, { recursive: true, force: true });
});

test("--write with --approve-claude-apply refuses dirty Claude settings before writing", () => {
  const home = tempDir("render-home-");
  const { file, root } = withTempClaudePlan((plan, tempRoot) => {
    const template = path.join(tempRoot, "settings.template.json");
    writeFileSync(template, `${JSON.stringify({ model: "blocked-default" }, null, 2)}\n`);
    const settings = plan.templateBoundaries.find((boundary) => boundary.id === "claude-settings");
    settings.templatePath = template;
    settings.candidateDestinations = ["~/.claude/settings.json"];
  });

  const result = run(["--write", "--approve-claude-apply", "--home", home, "--claude-plan", file]);
  assert.equal(result.status, 1, "expected non-zero exit on forbidden Claude settings key");
  assert.match(result.stdout + result.stderr, /forbidden key model/u);
  assert.deepEqual(listFiles(home), []);

  rmSync(home, { recursive: true, force: true });
  rmSync(root, { recursive: true, force: true });
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
  assert.ok(manifest.skippedLocalOnly.includes("~/.omp/agent/config.local.yml"));
  assert.ok(manifest.skippedLocalOnly.includes("~/.omp/agent/sessions/"));
  const matrixByDestination = new Map(manifest.ownershipMatrix.map((entry) => [entry.destination, entry]));
  assert.equal(matrixByDestination.get("~/.omp/agent/config.local.yml").bucket, "local-only-config");
  assert.equal(matrixByDestination.get("~/.omp/agent/sessions/").bucket, "local-only-runtime");
  for (const entry of manifest.candidates) {
    assert.notEqual(entry.disposition, "local-only");
  }
  rmSync(home, { recursive: true, force: true });
});

test("dry-run reports existing OMP files as operator-owned user files", () => {
  const home = tempDir("render-home-");
  try {
    const agentDir = path.join(home, ".omp", "agent");
    mkdirSync(agentDir, { recursive: true });
    const source = new URL(`../${ompSourceRoot}/AGENTS.md`, import.meta.url).pathname;
    writeFileSync(path.join(agentDir, "AGENTS.md"), readFileSync(source, "utf8"));
    const { result, manifest } = runJson(["--home", home]);
    assert.equal(result.status, 0, result.stderr);
    const candidate = manifest.candidates.find((entry) => entry.destination === "~/.omp/agent/AGENTS.md");
    assert.equal(candidate.liveStatus, "user-file");
    assert.equal(candidate.ownership, "user-file");
    const matrixRow = manifest.ownershipMatrix.find((entry) => entry.destination === "~/.omp/agent/AGENTS.md");
    assert.deepEqual(matrixRow, { destination: "~/.omp/agent/AGENTS.md", observedLiveState: "user-file", bucket: "existing-user-file", nextOwner: "operator-owned" });
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("dry-run reports legacy OMP symlinks as operator-owned user files", () => {
  const home = tempDir("render-home-");
  try {
    const agentDir = path.join(home, ".omp", "agent");
    mkdirSync(agentDir, { recursive: true });
    const source = new URL(`../${ompSourceRoot}/AGENTS.md`, import.meta.url).pathname;
    symlinkSync(source, path.join(agentDir, "AGENTS.md"));
    const { result, manifest } = runJson(["--home", home]);
    assert.equal(result.status, 0, result.stderr);
    const candidate = manifest.candidates.find((entry) => entry.destination === "~/.omp/agent/AGENTS.md");
    assert.equal(candidate.liveStatus, "user-file");
    assert.equal(candidate.ownership, "user-file");
  } finally { rmSync(home, { recursive: true, force: true }); }
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
  assert.equal(marker.generatedBy, "render-nucleus");
  for (const destination of created) {
    const liveRel = destination.replace(/^~\//u, "");
    const live = path.join(home, liveRel);
    assert.ok(!lstatSync(live).isSymbolicLink(), `${destination} must be copied, not linked`);
  }

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
    templatePath: `${codexTemplatesDir}/base.config.template.toml`,
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
    templatePath: `${codexTemplatesDir}/base.config.template.toml`,
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

test("gate fails a Claude instruction/settings candidate that targets local-only state", () => {
  const home = tempDir("render-home-");
  const { file, root } = withTempClaudePlan((plan) => {
    const settings = plan.templateBoundaries.find((boundary) => boundary.id === "claude-settings");
    settings.candidateDestinations = ["~/.claude/settings.local.json"];
  });

  const result = run(["--home", home, "--claude-plan", file]);
  assert.equal(result.status, 1, "expected non-zero exit on Claude local-only destination");
  assert.match(result.stdout + result.stderr, /local-only/u);
  assert.deepEqual(listFiles(home), []);

  rmSync(home, { recursive: true, force: true });
  rmSync(root, { recursive: true, force: true });
});

test("gate fails a Claude settings candidate with forbidden local routing keys", () => {
  const home = tempDir("render-home-");
  const { file, root } = withTempClaudePlan((plan, tempRoot) => {
    const template = path.join(tempRoot, "settings.template.json");
    writeFileSync(template, `${JSON.stringify({ model: "blocked-default" }, null, 2)}\n`);
    const settings = plan.templateBoundaries.find((boundary) => boundary.id === "claude-settings");
    settings.templatePath = template;
    settings.candidateDestinations = ["~/.claude/settings.json"];
  });

  const result = run(["--home", home, "--claude-plan", file]);
  assert.equal(result.status, 1, "expected non-zero exit on forbidden Claude settings key");
  assert.match(result.stdout + result.stderr, /forbidden key model/u);
  assert.deepEqual(listFiles(home), []);

  rmSync(home, { recursive: true, force: true });
  rmSync(root, { recursive: true, force: true });
});

test("gate fails a Claude agent candidate that targets local-only state", () => {
  const home = tempDir("render-home-");
  const { file, root } = withTempClaudePlan((plan) => {
    const agents = plan.templateBoundaries.find((boundary) => boundary.id === "claude-agent");
    agents.candidateDestinations = ["~/.claude/sessions/*.md"];
  });

  const result = run(["--home", home, "--claude-plan", file]);
  assert.equal(result.status, 1, "expected non-zero exit on Claude agent local-only destination");
  assert.match(result.stdout + result.stderr, /local-only/u);
  assert.deepEqual(listFiles(home), []);

  rmSync(home, { recursive: true, force: true });
  rmSync(root, { recursive: true, force: true });
});

test("gate fails a Claude agent candidate with a forbidden frontmatter key", () => {
  const home = tempDir("render-home-");
  const { file, root } = withTempClaudePlan((plan, tempRoot) => {
    const template = path.join(tempRoot, "omp-reviewer.md");
    writeFileSync(template, "---\nname: omp-reviewer\nmcpServers: smuggled\n---\n# Reviewer\n");
    const mapping = plan.ompAgentMappings.find((entry) => entry.claudeCandidate === "omp-reviewer");
    mapping.candidateTemplate = template;
  });

  const result = run(["--home", home, "--claude-plan", file]);
  assert.equal(result.status, 1, "expected non-zero exit on forbidden Claude agent key");
  assert.match(result.stdout + result.stderr, /forbidden key mcpServers/u);
  assert.deepEqual(listFiles(home), []);

  rmSync(home, { recursive: true, force: true });
  rmSync(root, { recursive: true, force: true });
});

test("gate fails a Claude skill candidate with a forbidden frontmatter key", () => {
  const home = tempDir("render-home-");
  const { file, root } = withTempClaudePlan((plan, tempRoot) => {
    const template = path.join(tempRoot, "SKILL.md");
    writeFileSync(template, "---\nname: omp-plan\nmodel: blocked-default\n---\n# Plan\n");
    const mapping = plan.skillCandidateMappings.find((entry) => entry.futureSkillName === "omp-plan");
    mapping.generatedClaudeAdapter = template;
  });

  const result = run(["--home", home, "--claude-plan", file]);
  assert.equal(result.status, 1, "expected non-zero exit on forbidden Claude skill key");
  assert.match(result.stdout + result.stderr, /forbidden key model/u);
  assert.deepEqual(listFiles(home), []);

  rmSync(home, { recursive: true, force: true });
  rmSync(root, { recursive: true, force: true });
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

function applyCandidate(destination, content, overrides = {}) {
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
    ...overrides,
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

test("applyCandidates skips pre-existing OMP symlinks as create-missing-only user files", () => {
  const home = tempDir("apply-home-");
  const dest = "~/.omp/agent/AGENTS.md";
  const source = new URL(`../${ompSourceRoot}/AGENTS.md`, import.meta.url).pathname;
  const live = path.join(home, ".omp", "agent", "AGENTS.md");
  mkdirSync(path.dirname(live), { recursive: true });
  symlinkSync(source, live);
  const candidate = applyCandidate(dest, readFileSync(source, "utf8"), { source: `${ompSourceRoot}/AGENTS.md` });
  const result = applyCandidates([candidate], home, emptyMarker());
  assert.equal(result.actions[0].action, "skipped");
  assert.equal(result.actions[0].reason, "exists");
  assert.ok(lstatSync(live).isSymbolicLink());
  rmSync(home, { recursive: true, force: true });
});

test("applyCandidates skips pre-existing real OMP files (operator-owned)", () => {
  const home = tempDir("apply-home-");
  const dest = "~/.omp/agent/config.yml";
  const live = path.join(home, ".omp", "agent", "config.yml");
  mkdirSync(path.dirname(live), { recursive: true });
  writeFileSync(live, "USER OWNED\n");
  const candidate = applyCandidate(dest, "repo: true\n", { source: `${ompSourceRoot}/config.yml` });
  const result = applyCandidates([candidate], home, emptyMarker());
  assert.equal(result.actions[0].action, "skipped");
  assert.equal(result.actions[0].reason, "exists");
  assert.equal(readFileSync(live, "utf8"), "USER OWNED\n");
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
