import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { parse as parseToml } from "../scripts/vendor/smol-toml/index.js";
import { codexPlanMarkdownPath, codexPlanPath, codexTemplatesDir, ompBuiltinsPortabilityPath, ompBuiltinsSourcePath } from "../scripts/lib/layout.mjs";

const planPath = new URL(`../${codexPlanPath}`, import.meta.url).pathname;
const planMdPath = new URL(`../${codexPlanMarkdownPath}`, import.meta.url).pathname;
const sourcePath = new URL(`../${ompBuiltinsSourcePath}`, import.meta.url).pathname;
const portabilityPath = new URL(`../${ompBuiltinsPortabilityPath}`, import.meta.url).pathname;
const templatesDir = new URL(`../${codexTemplatesDir}/`, import.meta.url).pathname;
const validator = new URL("../scripts/validate-codex-adapter-plan.mjs", import.meta.url).pathname;

const plan = JSON.parse(readFileSync(planPath, "utf8"));
const source = JSON.parse(readFileSync(sourcePath, "utf8"));
const portability = JSON.parse(readFileSync(portabilityPath, "utf8"));

function walkFiles(root, predicate = () => true) {
  const result = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...walkFiles(full, predicate));
    if (entry.isFile() && predicate(full)) result.push(full);
  }
  return result.sort();
}

function runValidatorWithTemplateMutation(relativePath, appendText) {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "codex-adapter-plan-test-"));
  const tempTemplates = path.join(tempRoot, "templates");
  cpSync(templatesDir, tempTemplates, { recursive: true });
  const target = path.join(tempTemplates, relativePath);
  writeFileSync(target, `${readFileSync(target, "utf8")}\n${appendText}\n`);
  const result = spawnSync(process.execPath, [validator], {
    encoding: "utf8",
    env: {
      ...process.env,
      CODEX_ADAPTER_PLAN_TEMPLATE_DIR: tempTemplates,
    },
  });
  rmSync(tempRoot, { recursive: true, force: true });
  return result;
}

test("Codex adapter plan validator accepts checked-in plan and templates", () => {
  const result = spawnSync(process.execPath, [validator], { encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Codex adapter plan validation passed/u);
});

test("Codex adapter plan maps every bundled OMP agent once", () => {
  const expected = source.expectedBundledAgents.toSorted();
  const actual = plan.ompAgentMappings.map(mapping => mapping.ompAgent).toSorted();
  assert.deepEqual(actual, expected);
  assert.deepEqual(new Set(plan.ompAgentMappings.map(mapping => mapping.recommendation)), new Set(["adapt", "drop", "keep", "superseded"]));
  for (const mapping of plan.ompAgentMappings) {
    assert.ok(mapping.codexSurface, `${mapping.ompAgent} missing Codex surface`);
    assert.ok(mapping.rationale, `${mapping.ompAgent} missing rationale`);
  }
  for (const mapping of plan.ompAgentMappings.filter(mapping => mapping.recommendation === "superseded")) {
    assert.equal(mapping.candidateTemplate, null, `${mapping.ompAgent} must not have an active renderer template`);
    assert.doesNotMatch(mapping.codexCandidate ?? "", /^omp-/u);
  }
});

test("Codex adapter plan maps issue 40 skill-class commands to future skills", () => {
  const expected = portability.commands
    .filter(command => command.portabilityClass === "skill")
    .map(command => command.name)
    .toSorted();
  const actual = plan.skillCandidateMappings.map(mapping => mapping.ompCommand).toSorted();
  assert.deepEqual(actual, expected);
  for (const mapping of plan.skillCandidateMappings) {
    assert.equal(mapping.codexSurface, "skill");
    assert.match(mapping.futureSkillName, /^omp-/u);
  }
});

test("Codex adapter plan references current official Codex doc topics", () => {
  const topics = new Set(plan.officialCodexDocs.map(ref => ref.topic));
  for (const topic of ["config", "profiles", "project-config-boundaries", "custom-agents-subagents", "subagent-concepts", "skills", "agents-md", "auth"]) {
    assert.ok(topics.has(topic), `missing docs topic ${topic}`);
  }
  for (const ref of plan.officialCodexDocs) {
    assert.match(ref.url, /^https:\/\/developers\.openai\.com\/codex\//u);
    assert.ok(ref.usedFor);
  }
});

test("Codex adapter plan treats workflow-kit as the repo workflow nucleus", () => {
  assert.ok(plan.sourceInputs.includes("~/.omp/agent/workflow-kit"));
  assert.equal(plan.repositoryWorkflowNucleus.source, "~/.omp/agent/workflow-kit");
  assert.equal(plan.repositoryWorkflowNucleus.status, "reference-only");
  const policy = plan.repositoryWorkflowNucleus.portablePolicy.join("\n");
  for (const marker of ["global layer", "project layer", "idempotent", "one issue/worktree/PR", "nucleus/skills", "Use when", "GitHub"]) {
    assert.match(policy, new RegExp(marker.replace("/", "\\/"), "u"));
  }
  const translation = plan.repositoryWorkflowNucleus.codexTranslation.join("\n");
  assert.match(translation, /harnesses/u);
  assert.match(translation, /dry-run manifests/u);
  assert.ok(plan.humanDecisionResolutions.some(decision => /workflow-kit split/u.test(decision.resolution)));
  assert.ok(plan.liveConfigApprovalPolicyOptions.some(option => option.id === "strict-manual" && option.recommended));
});

test("Codex adapter templates parse and avoid forbidden live/provider/auth settings", () => {
  const files = walkFiles(templatesDir, file => file.endsWith(".toml"));
  assert.ok(files.length >= 5);
  for (const file of files) {
    assert.doesNotThrow(() => parseToml(readFileSync(file, "utf8")), file);
  }

  const base = readFileSync(path.join(templatesDir, "base.config.template.toml"), "utf8");
  assert.doesNotMatch(base, /^model\s*=/mu);
  assert.doesNotMatch(base, /^model_provider\s*=/mu);
  assert.doesNotMatch(base, /^openai_base_url\s*=/mu);

  const reviewer = readFileSync(path.join(templatesDir, "agents/omp-reviewer.toml"), "utf8");
  assert.doesNotMatch(reviewer, /^sandbox_mode\s*=\s*"workspace-write"/mu);

  const allTemplateText = files.map(file => readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(allTemplateText, /auth\.json|github_pat_|gh[pousr]_|sk-[A-Za-z0-9_-]{20,}|\/Users\//u);
});

test("Codex adapter validator rejects forbidden profile provider keys", () => {
  const result = runValidatorWithTemplateMutation(
    "profile.omp-harness.config.template.toml",
    'model_provider = "proxy"',
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /forbidden key model_provider/u);
});

test("Codex adapter validator rejects forbidden skills-config operations", () => {
  const result = runValidatorWithTemplateMutation(
    "skills.config.template.toml",
    "copy = true",
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /forbidden key copy/u);
});

test("Codex adapter validator rejects copied project trust state", () => {
  const result = runValidatorWithTemplateMutation(
    "base.config.template.toml",
    '[projects."/tmp/project"]\ntrust_level = "trusted"',
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /forbidden key projects|forbidden key projects\\..*trust_level/u);
});

test("Codex adapter plan marks local-only surfaces and dry-run-only generated candidates", () => {
  const localOnly = JSON.stringify(plan.localOnlyCodexSurfaces);
  for (const marker of ["auth.json", "sessions", "history.jsonl", "plugins/cache", "sqlite", "automations", "browser", "computer-use", "shell_snapshots", "memories"]) {
    assert.match(localOnly, new RegExp(marker.replace("/", "\\/"), "u"));
  }
  assert.ok(plan.generatedCandidateSurfaces.every(surface => surface.status === "dry-run-only"));
  assert.ok(plan.generatedCandidateSurfaces.some(surface => surface.surface === "nucleus/skills/{agent-name}/"));
  assert.ok(!plan.generatedCandidateSurfaces.some(surface => surface.surface === "~/.codex/agents/*.toml"));
  assert.ok(!plan.generatedCandidateSurfaces.some(surface => surface.surface === ".codex/agents/*.toml"));
  assert.ok(plan.dryRunValidationStrategy.some(step => /temporary directory/u.test(step)));
  assert.ok(plan.dryRunValidationStrategy.some(step => /separate future issue\/PR/u.test(step)));
});

test("Codex adapter plan markdown includes reviewable human decisions", () => {
  const markdown = readFileSync(planMdPath, "utf8");
  for (const decision of plan.humanDecisionsBeforeImplementation) {
    assert.ok(markdown.includes(decision), `missing decision: ${decision}`);
  }
  assert.match(markdown, /Do not overwrite|does not write to live `~\/\.codex`/u);
  assert.match(markdown, /Dry-Run Render And Validation Strategy/u);
});
