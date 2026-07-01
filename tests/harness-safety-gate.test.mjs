import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { dryRunLinkPlanPath, ompSourceRoot } from "../scripts/lib/layout.mjs";
import { claudeTemplatesDir, codexTemplatesDir } from "../scripts/lib/layout.mjs";

const gate = new URL("../scripts/dry-run-harness-safety-gate.mjs", import.meta.url).pathname;
const planPath = new URL(`../${dryRunLinkPlanPath}`, import.meta.url).pathname;
const basePlan = JSON.parse(readFileSync(planPath, "utf8"));

function runGate(args = []) {
  return spawnSync(process.execPath, [gate, ...args], { encoding: "utf8" });
}

function withTempPlan(mutator) {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "harness-safety-gate-"));
  const tempPlan = path.join(tempRoot, "plan.json");
  const plan = JSON.parse(JSON.stringify(basePlan));
  mutator(plan);
  writeFileSync(tempPlan, `${JSON.stringify(plan, null, 2)}\n`);
  return {
    path: tempPlan,
    cleanup: () => rmSync(tempRoot, { recursive: true, force: true }),
  };
}

function withTempSourceRoot(files) {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "harness-source-scan-"));
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(tempRoot, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }
  return {
    path: tempRoot,
    cleanup: () => rmSync(tempRoot, { recursive: true, force: true }),
  };
}

test("dry-run safety gate reports checked-in plan without mutation", () => {
  const result = runGate(["--check-live"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Harness dry-run safety gate/u);
  assert.match(result.stdout, /Mutation: disabled/u);
  assert.match(result.stdout, /Live link check: path-only/u);
  assert.match(result.stdout, /\[omp\]/u);
  assert.match(result.stdout, /\[codex\]/u);
  assert.match(result.stdout, /\[claude\]/u);
  assert.match(result.stdout, /Local-only symlink target guard: passed/u);
  assert.match(result.stdout, /4 Codex surfaces, 9 Claude surfaces/u);
  assert.match(result.stdout, /Tracked source content scan: passed/u);
  assert.match(result.stdout, /\[generated config destinations\]/u);
  assert.match(result.stdout, /codex-runtime-state/u);
  assert.match(result.stdout, /claude-runtime-state/u);
  assert.match(result.stdout, /Result: passed/u);
});

test("tracked source scan accepts tokenized source fixture", () => {
  const temp = withTempSourceRoot({
    "docs/good.md": "Use `~/.omp/agent/workflow-kit/README.md` and `~/.agents/skills/`.\n",
    [`${ompSourceRoot}/AGENTS.md`]: "Project-specific skills live in `<repo>/.agents/skills/`.\n",
    "scripts/good.mjs": "const kitRoot = process.env.KIT_ROOT || 'home-relative fallback';\n",
  });
  try {
    const result = runGate(["--source-root", temp.path]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Tracked source content scan: passed \(3 files scanned\)/u);
  } finally {
    temp.cleanup();
  }
});

test("tracked source scan rejects hardcoded private home paths", () => {
  const temp = withTempSourceRoot({
    "docs/bad-private-path.md": "Use /Users/example/.omp/agent/workflow-kit/README.md for setup.\n",
  });
  try {
    const result = runGate(["--source-root", temp.path, "--skip-git-tracked-check"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /docs\/bad-private-path\.md:1: tracked source contains absolute private home path/u);
  } finally {
    temp.cleanup();
  }
});

test("tracked source scan rejects fake secret-looking values", () => {
  const temp = withTempSourceRoot({
    "scripts/bad-secret.mjs": [
      "const token = 'ghp_12345678901234567890';",
      "const config = 'api_key = abcdefghijklmnop';",
      "",
    ].join("\n"),
  });
  try {
    const result = runGate(["--source-root", temp.path]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /scripts\/bad-secret\.mjs:1: tracked source contains API-key\/token\/secret-looking text/u);
    assert.match(result.stderr, /scripts\/bad-secret\.mjs:2: tracked source contains API-key\/token\/secret-looking text/u);
  } finally {
    temp.cleanup();
  }
});

test("checked-in dry-run plan covers OMP, Codex, and Claude candidates", () => {
  const harnesses = new Set(basePlan.candidateLinks.map((link) => link.sourceHarness));
  assert.deepEqual(harnesses, new Set(["omp", "codex", "claude"]));
  assert.ok(
    basePlan.candidateLinks.some((link) => (
      link.mode === "candidate-symlink"
      && link.livePath === "~/.omp/agent/AGENTS.md"
      && link.proposedTarget === `repo:${ompSourceRoot}/AGENTS.md`
    )),
    "expected one allowed OMP symlink candidate",
  );
  assert.ok(
    basePlan.generatedConfigDestinations.some((destination) => destination.destination === "~/.codex/omp-harness.config.toml"),
    "expected generated user config destination",
  );
  assert.ok(
    basePlan.generatedConfigDestinations.some((destination) => destination.destination === "~/.claude/settings.json"),
    "expected generated Claude user settings destination",
  );
  assert.ok(
    basePlan.generatedConfigDestinations.some((destination) => destination.destination === "per-skill symlink manifest"),
    "expected generated Claude per-skill symlink manifest destination",
  );
  assert.equal(
    basePlan.candidateLinks.find((link) => link.id === "claude-user-skills-root")?.mode,
    "report-only",
    "Claude whole skill root must be report-only",
  );
});

test("safety gate rejects local-only runtime paths as symlink targets", () => {
  const temp = withTempPlan((plan) => {
    plan.candidateLinks.push({
      id: "bad-session-target",
      sourceHarness: "codex",
      sourceResource: "codex-agents-skills",
      mode: "candidate-symlink",
      livePath: "~/.codex/skills/bad-session-target",
      proposedTarget: "~/.codex/sessions/",
      disposition: "adapt",
      notes: "Invalid: local-only runtime path cannot be a symlink target.",
    });
  });
  try {
    const result = runGate(["--plan", temp.path, "--skip-git-tracked-check"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /proposedTarget matches a local-only runtime path/u);
  } finally {
    temp.cleanup();
  }
});

test("safety gate rejects wildcard local-only runtime patterns", () => {
  const temp = withTempPlan((plan) => {
    plan.candidateLinks.push(
      {
        id: "bad-codex-state-live-path",
        sourceHarness: "codex",
        sourceResource: "codex-agents-skills",
        mode: "candidate-symlink",
        livePath: "~/.codex/app-state.json",
        proposedTarget: "repo:nucleus/skills/",
        disposition: "adapt",
        notes: "Invalid: matches ~/.codex/*state*.json.",
      },
      {
        id: "bad-claude-daemon-auth-target",
        sourceHarness: "claude",
        sourceResource: "claude-agents-skills-settings",
        mode: "candidate-symlink",
        livePath: "~/.claude/skills/omp-plan",
        proposedTarget: "~/.claude/daemon-auth-main",
        disposition: "adapt",
        notes: "Invalid: matches ~/.claude/daemon-auth-*.",
      },
    );
    plan.generatedConfigDestinations.push({
      id: "bad-claude-daemon-auth-render",
      sourceHarness: "claude",
      operation: "render-file",
      destination: "~/.claude/daemon-auth-main",
      sourceTemplate: `${claudeTemplatesDir}/settings.template.json`,
      status: "dry-run-only",
      approval: "future-issue-required",
      notes: "Invalid: matches ~/.claude/daemon-auth-*.",
    });
  });
  try {
    const result = runGate(["--plan", temp.path, "--skip-git-tracked-check"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /bad-codex-state-live-path: livePath is a local-only runtime path/u);
    assert.match(result.stderr, /bad-claude-daemon-auth-target: proposedTarget matches a local-only runtime path/u);
    assert.match(result.stderr, /bad-claude-daemon-auth-render: destination matches a local-only runtime path/u);
  } finally {
    temp.cleanup();
  }
});

test("safety gate rejects dangerous database, blob, auth, cache, and history paths", () => {
  const temp = withTempPlan((plan) => {
    plan.candidateLinks.push(
      {
        id: "bad-db-target",
        sourceHarness: "omp",
        sourceResource: "omp-user-project-resources",
        mode: "candidate-symlink",
        livePath: "~/.omp/agent/config.yml",
        proposedTarget: "repo:state/harness.sqlite",
        disposition: "track",
        notes: "Invalid database target.",
      },
      {
        id: "bad-auth-live-path",
        sourceHarness: "codex",
        sourceResource: "codex-agents-skills",
        mode: "candidate-symlink",
        livePath: "~/.codex/auth.json",
        proposedTarget: "repo:nucleus/skills/",
        disposition: "adapt",
        notes: "Invalid auth live path.",
      },
    );
    plan.generatedConfigDestinations.push({
      id: "bad-cache-render",
      sourceHarness: "codex",
      operation: "render-file",
      destination: "~/.codex/plugins/cache/rendered.toml",
      sourceTemplate: `${codexTemplatesDir}/base.config.template.toml`,
      status: "dry-run-only",
      approval: "future-issue-required",
      notes: "Invalid cache destination.",
    });
  });
  try {
    const result = runGate(["--plan", temp.path, "--skip-git-tracked-check"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /database/u);
    assert.match(result.stderr, /auth\/cache state/u);
    assert.match(result.stderr, /destination matches a local-only runtime path|destination is dangerous auth\/cache state/u);
  } finally {
    temp.cleanup();
  }
});

test("safety gate rejects secret-looking plan values", () => {
  const temp = withTempPlan((plan) => {
    plan.candidateLinks[0].notes = 'api_key = "sk-test-secret-looking-value-0000000000"';
  });
  try {
    const result = runGate(["--plan", temp.path, "--skip-git-tracked-check"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /secret-looking text/u);
  } finally {
    temp.cleanup();
  }
});

test("safety gate rejects bulk Claude skill-root symlink plans", () => {
  const temp = withTempPlan((plan) => {
    const claudeRoot = plan.candidateLinks.find((link) => link.id === "claude-user-skills-root");
    claudeRoot.mode = "candidate-symlink";
    claudeRoot.proposedTarget = "repo:nucleus/skills/";
  });
  try {
    const result = runGate(["--plan", temp.path, "--skip-git-tracked-check"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /bulk Claude skill-root symlinks are forbidden/u);
  } finally {
    temp.cleanup();
  }
});
