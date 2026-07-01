import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { renderAndGate, resolveDisposition } from "../scripts/render-harness-nucleus.mjs";
import {
  buildPluginCandidates,
  containmentFindings,
  gateAndApply,
  isAllowedPluginDestination,
  localOnlyPatterns,
  PLUGIN_BRIDGE_ROOT,
  symlinkContainmentFindings,
} from "../scripts/render-plugin-bridge.mjs";

const repoFile = (rel) => new URL(`../${rel}`, import.meta.url).pathname;
const renderer = repoFile("scripts/render-plugin-bridge.mjs");
const bridgeDir = repoFile("docs/harness/plugin-bridge");

const plan = JSON.parse(readFileSync(repoFile("docs/harness/plugin-bridge/plan.json"), "utf8"));
const manifest = JSON.parse(readFileSync(repoFile("docs/harness/resource-manifest.json"), "utf8"));
const matrix = JSON.parse(readFileSync(repoFile("docs/harness/omp-builtins/portability-matrix.json"), "utf8"));
const source = JSON.parse(readFileSync(repoFile("docs/harness/omp-builtins/source.json"), "utf8"));
const shared = JSON.parse(readFileSync(repoFile("docs/harness/shared-nucleus-agents.json"), "utf8"));

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

function frontmatterName(file) {
  const text = readFileSync(file, "utf8");
  const match = text.match(/^---\n([\s\S]*?)\n---/u);
  if (!match) return null;
  const line = match[1].split(/\r?\n/u).find((row) => row.startsWith("name:"));
  return line ? line.slice("name:".length).trim() : null;
}

function run(args = []) {
  return spawnSync(process.execPath, [renderer, ...args], { encoding: "utf8" });
}

function runJson(args = []) {
  const result = run([...args, "--json"]);
  return { result, manifest: result.status === null ? null : JSON.parse(result.stdout) };
}

// A botched plugin candidate aimed at an explicit destination, shaped like a real rendered candidate.
function botched(destination, content = JSON.stringify({ name: "loom-nucleus" })) {
  const rel = destination.replace(/^~\//u, "").replace(/^\.\//u, "");
  return {
    id: `codex:botched:${destination}`,
    harness: "codex",
    boundaryId: null,
    forbiddenKeys: [],
    source: "test/botched.json",
    content,
    renderedRelPath: path.join("plugin-bridge-botched", rel),
    destination,
    disposition: "adapt",
    operation: "create-file",
    appliable: true,
  };
}

// --- mapping completeness -----------------------------------------------------------------------

test("plugin skills include OMP skill candidates and canonical shared agent packages", () => {
  const matrixSkillCommands = matrix.commands
    .filter((command) => command.portabilityClass === "skill")
    .map((command) => command.name)
    .sort();
  assert.equal(matrixSkillCommands.length, 6, `expected 6 matrix skill commands, got ${matrixSkillCommands.join(",")}`);

  const planSkillCommands = plan.skills.map((skill) => skill.ompCommand).sort();
  assert.deepEqual(planSkillCommands, matrixSkillCommands, "plan skill ompCommands must equal the matrix skill commands");

  const planSkillNames = plan.skills.map((skill) => skill.name).sort();
  assert.equal(new Set(planSkillNames).size, planSkillNames.length, "duplicate plan skill name");

  const sharedAgentNames = shared.agents.map((agent) => agent.name).sort();
  const packagedAgentNames = plan.agents.map((agent) => agent.name).sort();
  assert.deepEqual(packagedAgentNames, sharedAgentNames, "plan agents must match the shared nucleus roster");
  assert.ok(plan.agents.every((agent) => agent.packaged === true && agent.consumedBy === "both"), "shared agents must be packaged for both harnesses");

  const skillDirs = readdirSync(path.join(bridgeDir, "loom-nucleus", "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(skillDirs, [...planSkillNames, ...sharedAgentNames].sort(), "plugin skills directory must contain OMP skills plus shared agent packages");

  for (const name of planSkillNames) {
    const skillFile = path.join(bridgeDir, "loom-nucleus", "skills", name, "SKILL.md");
    assert.equal(frontmatterName(skillFile), name, `SKILL.md frontmatter name must equal its directory (${name})`);
  }
});

test("canonical shared agent packages have required shape and unprefixed names", () => {
  const requiredFiles = [
    "AGENTS.md",
    "SKILL.md",
    "references/agent-judgment.md",
    "references/rules.md",
    "references/patterns.md",
    "references/glossary.md",
    "references/coverage-gaps.md",
  ];

  for (const agent of plan.agents) {
    assert.doesNotMatch(agent.name, /^(omp|codex|claude)-/u, `shared agent must not be harness-prefixed: ${agent.name}`);
    const rootDir = path.join(bridgeDir, "loom-nucleus", "skills", agent.name);
    for (const rel of requiredFiles) {
      assert.ok(readFileSync(path.join(rootDir, rel), "utf8").length > 0, `${agent.name} missing ${rel}`);
    }
    assert.equal(frontmatterName(path.join(rootDir, "SKILL.md")), agent.name, `SKILL.md frontmatter name must equal package name (${agent.name})`);
    const exemplar = path.join(rootDir, "exemplars", `pr-${agent.name}.md`);
    assert.ok(readFileSync(exemplar, "utf8").includes("No accepted PR exemplar"), `${agent.name} exemplar index missing`);
  }

  const agentsDir = path.join(bridgeDir, "loom-nucleus", "agents");
  assert.throws(() => readdirSync(agentsDir), /ENOENT/u, "legacy Claude agents/*.md ports must not remain in the plugin source");
  assert.ok(plan.supersededOmpAgentPorts.every((entry) => entry.decision === "superseded-by-shared-agent-packages"));
});

test("activation proof covers OMP-compatible source, Codex, and Claude shared roster surfaces", () => {
  const codexPlugin = JSON.parse(readFileSync(path.join(bridgeDir, "loom-nucleus", ".codex-plugin", "plugin.json"), "utf8"));
  const claudePlugin = JSON.parse(readFileSync(path.join(bridgeDir, "loom-nucleus", ".claude-plugin", "plugin.json"), "utf8"));
  assert.equal(codexPlugin.skills, "./skills", "Codex must consume shared roster as plugin skills");
  assert.equal(claudePlugin.skills, "./skills", "Claude must consume shared roster as plugin skills");
  assert.ok(!("agents" in codexPlugin), "Codex must not receive native agent ports");
  assert.ok(!("agents" in claudePlugin), "Claude must not receive native agent ports");

  const candidates = buildPluginCandidates(plan, manifest, {}).candidates;
  for (const agent of shared.agents) {
    const sourceRoot = path.join(bridgeDir, "loom-nucleus", "skills", agent.name);
    assert.ok(readFileSync(path.join(sourceRoot, "AGENTS.md"), "utf8").length > 0, `${agent.name} missing OMP-compatible package source`);
    assert.ok(
      candidates.some((candidate) =>
        candidate.kind === "shared-agent-package" &&
        candidate.consumedBy === "both" &&
        candidate.destination === `~/.agents/plugins/loom-nucleus/skills/${agent.name}/SKILL.md` &&
        candidate.appliable === true),
      `${agent.name} missing shared package activation candidate`,
    );
  }
});

// --- gate rejects botched targets ---------------------------------------------------------------

test("gate rejects candidates aimed at cache/auth/data/local-only destinations", () => {
  const localOnly = localOnlyPatterns(manifest);
  const cases = [
    "~/.codex/plugins/cache/loom-nucleus/marketplace.json",
    "~/.claude/plugins/data/loom-nucleus/plugin.json",
    "~/.codex/auth.json",
    "~/.claude/settings.local.json",
    "~/.omp/agent/sessions/loom.json",
  ];
  for (const destination of cases) {
    const findings = renderAndGate([botched(destination)], localOnly);
    assert.ok(findings.length > 0, `expected a finding for ${destination}, got none`);
  }
});

test("--write refuses when the gate is not clean", () => {
  const localOnly = localOnlyPatterns(manifest);
  const home = tempDir("plugin-bridge-refuse-");
  const marker = { schemaVersion: 1, generatedBy: "test", entries: {} };
  const result = gateAndApply([botched("~/.claude/plugins/data/loom-nucleus/plugin.json")], localOnly, home, marker);
  assert.equal(result.refused, true, "gateAndApply must refuse a botched candidate");
  assert.ok(result.findings.length > 0);
  assert.equal(result.actions.length, 0, "no write actions when refused");
  assert.deepEqual(listFiles(home), [], "refused write must touch no file");
  rmSync(home, { recursive: true, force: true });
});

// --- JSON manifest validity ---------------------------------------------------------------------

test("rendered plugin and marketplace manifests parse and carry required fields", () => {
  const { candidates, localOnly } = buildPluginCandidates(plan, manifest, {});
  assert.deepEqual(renderAndGate(candidates, localOnly), [], "the real plugin-bridge candidates must gate clean");

  const byId = new Map(candidates.map((candidate) => [candidate.id.split(":")[1], candidate]));
  const parse = (key) => JSON.parse(byId.get(key).content);

  const codexPlugin = parse("codex-plugin-manifest");
  assert.equal(codexPlugin.name, "loom-nucleus");
  assert.ok(typeof codexPlugin.version === "string" && codexPlugin.version.length > 0, "Codex plugin needs a version");
  assert.ok(!("agents" in codexPlugin), "Codex plugin manifest must not bundle an agents pointer");
  assert.ok(codexPlugin.skills.startsWith("./"), "skills pointer must be ./-relative");
  assert.ok(codexPlugin.hooks.startsWith("./"), "hooks pointer must be ./-relative");

  const claudePlugin = parse("claude-plugin-manifest");
  assert.equal(claudePlugin.name, "loom-nucleus");
  assert.ok(!("agents" in claudePlugin), "Claude plugin uses canonical skill packages instead of legacy agents pointer");
  assert.ok(claudePlugin.skills.startsWith("./"), "skills pointer must be ./-relative");

  const codexMarket = parse("codex-marketplace");
  const codexEntry = codexMarket.plugins.find((entry) => entry.name === "loom-nucleus");
  assert.ok(codexEntry, "Codex marketplace must list loom-nucleus");
  assert.equal(codexEntry.source.source, "local");
  // Verified live (LOO-15, codex-cli 0.142.0): Codex auto-discovers ~/.agents/plugins/marketplace.json
  // with marketplace ROOT = $HOME and resolves source.path relative to that root, so the plugin at
  // ~/.agents/plugins/loom-nucleus requires this exact path (not "./loom-nucleus").
  assert.equal(codexEntry.source.path, "./.agents/plugins/loom-nucleus", "Codex source.path must resolve to the plugin under the $HOME marketplace root");
  assert.ok(["AVAILABLE", "INSTALLED_BY_DEFAULT", "NOT_AVAILABLE"].includes(codexEntry.policy.installation));
  assert.ok(typeof codexEntry.policy.authentication === "string");
  assert.ok(typeof codexEntry.category === "string" && codexEntry.category.length > 0);

  const claudeMarket = parse("claude-marketplace");
  const claudeEntry = claudeMarket.plugins.find((entry) => entry.name === "loom-nucleus");
  assert.ok(claudeEntry, "Claude marketplace must list loom-nucleus");
  assert.ok(typeof claudeEntry.source === "string" && claudeEntry.source.startsWith("./"), "Claude source must be ./-prefixed");
});

test("the repo Claude marketplace is project-scoped and reported, not a HOME write", () => {
  const { candidates } = buildPluginCandidates(plan, manifest, {});
  const claudeMarket = candidates.find((candidate) => candidate.id.includes("claude-marketplace"));
  assert.ok(claudeMarket, "claude-marketplace candidate must exist");
  assert.equal(claudeMarket.appliable, false, "project-scoped catalog must not be a HOME write");
  assert.ok(!claudeMarket.destination.startsWith("~/"), "project-scoped destination must not be home-anchored");

  // Every appliable candidate must be a safe home-anchored ~/.agents/plugins target.
  for (const candidate of candidates.filter((entry) => entry.appliable)) {
    assert.ok(candidate.destination.startsWith("~/.agents/plugins/"), `appliable target must stay under ~/.agents/plugins: ${candidate.destination}`);
  }
});

// --- dry-run AFK --------------------------------------------------------------------------------

test("dry-run over a temp fake HOME writes nothing and passes", () => {
  const home = tempDir("plugin-bridge-dry-");
  const { result, manifest: report } = runJson(["--home", home]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(report.mode, "dry-run");
  assert.equal(report.result, "pass");
  assert.deepEqual(listFiles(home), [], "dry-run must not write any file");
  rmSync(home, { recursive: true, force: true });
});

// --- idempotent --write -------------------------------------------------------------------------

test("--write applies create-missing-only and a second run is a clean no-op", () => {
  const home = tempDir("plugin-bridge-write-");

  const first = runJson(["--home", home, "--write"]);
  assert.equal(first.result.status, 0, first.result.stderr);
  assert.equal(first.manifest.result, "pass");
  const expectedAppliable = buildPluginCandidates(plan, manifest, {}).candidates.filter((candidate) => candidate.appliable).length;
  const created = first.manifest.actions.filter((action) => action.action === "created");
  assert.equal(created.length, expectedAppliable, "fresh apply must create every appliable target");
  assert.ok(created.every((action) => action.destination.startsWith("~/.agents/plugins/")), "apply must stay inside the approved plugin root");
  assert.equal(first.manifest.markerChanged, true);
  const marker = JSON.parse(readFileSync(path.join(home, ".loom-harness", "applied-manifest.json"), "utf8"));
  assert.equal(Object.keys(marker.entries).length, expectedAppliable, "marker must record each created target");
  assert.ok(Object.keys(marker.entries).every((destination) => destination.startsWith("~/.agents/plugins/")), "marker must not adopt runtime/local-only paths");

  // The catalog and co-located plugin source both landed under the personal marketplace root.
  const written = listFiles(path.join(home, ".agents", "plugins"));
  assert.ok(written.includes("marketplace.json"), "catalog must be written");
  assert.ok(written.includes(path.join("loom-nucleus", ".codex-plugin", "plugin.json")), "plugin source must be written");
  assert.ok(written.includes(path.join("loom-nucleus", "hooks", "verify-loom-install.mjs")), "verifier must be written");

  const second = runJson(["--home", home, "--write"]);
  assert.equal(second.result.status, 0, second.result.stderr);
  assert.equal(second.manifest.actions.filter((action) => action.action === "created").length, 0, "second run must create nothing");
  assert.equal(second.manifest.actions.filter((action) => action.action === "already-applied").length, expectedAppliable, "second run must be all already-applied");
  assert.equal(second.manifest.markerChanged, false, "marker must be unchanged on the second run");

  rmSync(home, { recursive: true, force: true });
});

// --- verifier broken vs good --------------------------------------------------------------------

function installAndVerify(home, mutate) {
  const write = run(["--home", home, "--write"]);
  assert.equal(write.status, 0, write.stderr);
  const root = path.join(home, ".agents", "plugins", "loom-nucleus");
  if (mutate) mutate(root, home);
  const verifier = path.join(root, "hooks", "verify-loom-install.mjs");
  return spawnSync(process.execPath, [verifier, "--root", root, "--home", home], { encoding: "utf8" });
}

test("verifier exits 0 on a good install and stays silent", () => {
  const home = tempDir("plugin-bridge-verify-good-");
  const result = installAndVerify(home, null);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "", "good install must stay silent");
  rmSync(home, { recursive: true, force: true });
});

test("verifier exits non-zero with a reason when a component is missing", () => {
  const home = tempDir("plugin-bridge-verify-missing-");
  const result = installAndVerify(home, (root) => rmSync(path.join(root, "skills", "omp-plan"), { recursive: true, force: true }));
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stderr);
  assert.equal(report.ok, false);
  assert.ok(report.reasons.some((reason) => reason.includes("missing omp-plan")), report.stderr);
  rmSync(home, { recursive: true, force: true });
});

test("verifier exits non-zero with a reason when a marker hash drifts", () => {
  const home = tempDir("plugin-bridge-verify-drift-");
  const result = installAndVerify(home, (root) => {
    writeFileSync(path.join(root, ".codex-plugin", "plugin.json"), JSON.stringify({ name: "loom-nucleus", version: "0.1.0", skills: "./skills", hooks: "./hooks/hooks.json" }));
  });
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stderr);
  assert.ok(report.reasons.some((reason) => reason.includes("hash drift")), result.stderr);
  rmSync(home, { recursive: true, force: true });
});

// --- security regressions (review findings) -----------------------------------------------------

test("[finding 1] confines appliable writes to the plugin-bridge root and refuses outside destinations", () => {
  assert.equal(isAllowedPluginDestination(`${PLUGIN_BRIDGE_ROOT}/marketplace.json`), true);
  assert.equal(isAllowedPluginDestination(`${PLUGIN_BRIDGE_ROOT}/loom-nucleus/skills/x/SKILL.md`), true);
  assert.equal(isAllowedPluginDestination("~/.codex/agents/omp-x.toml"), false);
  assert.equal(isAllowedPluginDestination(`${PLUGIN_BRIDGE_ROOT}/loom-nucleus/../../.ssh/authorized_keys`), false);

  // ~/.codex/agents resolves to `adapt` via the codex-agents-skills manifest row; without the
  // allowlist this would be appliable. It must instead be non-appliable AND a containment finding.
  const evilPlan = {
    pluginName: "loom-nucleus",
    pluginVersion: "0.0.0",
    templates: [
      {
        id: "evil-codex-agent",
        kind: "agent",
        consumedBy: "codex",
        template: "loom-nucleus/.codex-plugin/plugin.json",
        destination: "~/.codex/agents/omp-evil.toml",
        dispositionHarness: "codex",
      },
    ],
  };
  const { candidates } = buildPluginCandidates(evilPlan, manifest, {});
  assert.equal(candidates[0].disposition, "adapt", "guard test requires a track/adapt resolution");
  assert.equal(candidates[0].appliable, false, "a home destination outside the allowlist must not be appliable");
  assert.ok(
    containmentFindings(candidates).some((finding) => finding.includes("outside the plugin-bridge write allowlist")),
    "containment finding expected",
  );

  const home = tempDir("plugin-bridge-allowlist-");
  const result = gateAndApply(candidates, localOnlyPatterns(manifest), home, { schemaVersion: 1, generatedBy: "test", entries: {} });
  assert.equal(result.refused, true, "the write must refuse a destination outside the allowlist");
  assert.deepEqual(listFiles(home), [], "refused write must touch no file");
  rmSync(home, { recursive: true, force: true });
});

test("[finding 2] refuses to write when a plugin-bridge ancestor is a symlink escaping HOME", () => {
  const home = tempDir("plugin-bridge-symlink-home-");
  const evil = tempDir("plugin-bridge-symlink-evil-");
  symlinkSync(evil, path.join(home, ".agents")); // ~/.agents -> outside dir
  const { candidates, localOnly } = buildPluginCandidates(plan, manifest, {});

  assert.ok(symlinkContainmentFindings(candidates, home).length > 0, "symlinked ~/.agents must be flagged");

  const result = gateAndApply(candidates, localOnly, home, { schemaVersion: 1, generatedBy: "test", entries: {} });
  assert.equal(result.refused, true, "the write must refuse a symlinked plugin-bridge ancestor");
  assert.deepEqual(listFiles(evil), [], "nothing may be written through the symlink");

  rmSync(home, { recursive: true, force: true });
  rmSync(evil, { recursive: true, force: true });
});

test("[finding 3] rejects a template path that escapes the bridge dir before reading", () => {
  const traversalPlan = {
    templates: [{
      id: "evil",
      kind: "skill",
      consumedBy: "both",
      template: "../resource-manifest.json",
      destination: `${PLUGIN_BRIDGE_ROOT}/loom-nucleus/skills/x/SKILL.md`,
      dispositionHarness: "codex",
    }],
  };
  assert.throws(() => buildPluginCandidates(traversalPlan, manifest, {}), /must not contain '\.\.'/u);

  const absolutePlan = {
    templates: [{
      id: "abs",
      kind: "skill",
      consumedBy: "both",
      template: "/etc/passwd",
      destination: `${PLUGIN_BRIDGE_ROOT}/loom-nucleus/skills/x/SKILL.md`,
      dispositionHarness: "codex",
    }],
  };
  assert.throws(() => buildPluginCandidates(absolutePlan, manifest, {}), /must be relative/u);
});

test("[finding 4] gate forbidden-key-scans Markdown YAML frontmatter but allows clean/frontmatter-less md", () => {
  const mdCandidate = (content) => ({
    id: `codex:md:${content.length}`,
    harness: "codex",
    boundaryId: null,
    forbiddenKeys: [],
    source: "test/agent.md",
    content,
    renderedRelPath: "plugin-bridge/loom-nucleus/skills/evil/SKILL.md",
    destination: "~/.agents/plugins/loom-nucleus/skills/evil/SKILL.md",
    disposition: "adapt",
    operation: "create-file",
    appliable: true,
  });
  const withModel = renderAndGate([mdCandidate("---\nname: omp-evil\nmodel: gpt-4o\n---\n# body\n")], []);
  assert.ok(withModel.some((finding) => finding.includes("forbidden key model")), withModel.join("\n"));
  const withAuth = renderAndGate([mdCandidate("---\nname: omp-evil\nauth: required\n---\n# body\n")], []);
  assert.ok(withAuth.some((finding) => finding.includes("forbidden key auth")), withAuth.join("\n"));
  assert.deepEqual(
    renderAndGate([mdCandidate("---\nname: omp-ok\ndescription: x\ntools: [Read, Grep]\n---\n# body\n")], []),
    [],
    "clean frontmatter must pass",
  );
  assert.deepEqual(
    renderAndGate([mdCandidate("# just a heading\nno frontmatter here\n")], []),
    [],
    "frontmatter-less markdown must pass",
  );
});

test("[finding 5] resolveDisposition is the engine's and always filters by harness", () => {
  const localOnly = localOnlyPatterns(manifest);
  assert.equal(resolveDisposition(`${PLUGIN_BRIDGE_ROOT}/marketplace.json`, "codex", manifest, localOnly), "adapt");
  // A mismatched harness must not match the codex-owned row: the engine always filters by harness.
  assert.equal(resolveDisposition(`${PLUGIN_BRIDGE_ROOT}/marketplace.json`, "claude", manifest, localOnly), "reference-only");
  const { candidates } = buildPluginCandidates(plan, manifest, {});
  const claudeMarket = candidates.find((candidate) => candidate.id.includes("claude-marketplace"));
  assert.equal(claudeMarket.disposition, "reference-only");
  assert.equal(claudeMarket.appliable, false);
});
