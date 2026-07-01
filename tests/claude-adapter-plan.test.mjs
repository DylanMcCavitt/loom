import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const planPath = new URL("../docs/harness/claude-adapter-plan/adapter-plan.json", import.meta.url).pathname;
const planMdPath = new URL("../docs/harness/claude-adapter-plan.md", import.meta.url).pathname;
const sourcePath = new URL("../distributions/snapshots/omp-builtins/source.json", import.meta.url).pathname;
const portabilityPath = new URL("../distributions/snapshots/omp-builtins/portability-matrix.json", import.meta.url).pathname;
const templatesDir = new URL("../docs/harness/claude-adapter-plan/templates/", import.meta.url).pathname;
const validator = new URL("../scripts/validate-claude-adapter-plan.mjs", import.meta.url).pathname;

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

function runValidatorWithTemplateMutation(relativePath, mutate) {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "claude-adapter-plan-test-"));
  const tempTemplates = path.join(tempRoot, "templates");
  cpSync(templatesDir, tempTemplates, { recursive: true });
  const target = path.join(tempTemplates, relativePath);
  writeFileSync(target, mutate(readFileSync(target, "utf8")));
  const result = spawnSync(process.execPath, [validator], {
    encoding: "utf8",
    env: {
      ...process.env,
      CLAUDE_ADAPTER_PLAN_TEMPLATE_DIR: tempTemplates,
    },
  });
  rmSync(tempRoot, { recursive: true, force: true });
  return result;
}

test("Claude adapter plan validator accepts checked-in plan and templates", () => {
  const result = spawnSync(process.execPath, [validator], { encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Claude adapter plan validation passed/u);
  assert.match(result.stdout, /Dry-run candidate surfaces/u);
});

test("Claude adapter plan maps every bundled OMP agent once", () => {
  const expected = source.expectedBundledAgents.toSorted();
  const actual = plan.ompAgentMappings.map(mapping => mapping.ompAgent).toSorted();
  assert.deepEqual(actual, expected);
  assert.deepEqual(new Set(plan.ompAgentMappings.map(mapping => mapping.recommendation)), new Set(["adapt", "drop", "keep"]));
  for (const mapping of plan.ompAgentMappings) {
    assert.ok(mapping.claudeSurface, `${mapping.ompAgent} missing Claude surface`);
    assert.ok(mapping.rationale, `${mapping.ompAgent} missing rationale`);
    if (mapping.candidateTemplate) {
      assert.ok(readFileSync(new URL(`../${mapping.candidateTemplate}`, import.meta.url), "utf8").includes(`name: ${mapping.claudeCandidate}`));
    }
  }
});

test("Claude adapter plan maps issue 40 skill-class commands to future Claude skills", () => {
  const expected = portability.commands
    .filter(command => command.portabilityClass === "skill")
    .map(command => command.name)
    .toSorted();
  const actual = plan.skillCandidateMappings.map(mapping => mapping.ompCommand).toSorted();
  assert.deepEqual(actual, expected);
  for (const mapping of plan.skillCandidateMappings) {
    assert.equal(mapping.claudeSurface, "skill");
    assert.match(mapping.futureSkillName, /^omp-/u);
    assert.match(mapping.sharedWorkflowSource, /^\.agents\/skills\//u);
    assert.match(mapping.adapterMode, /review/u);
    if (mapping.generatedClaudeAdapter) {
      assert.notEqual(mapping.generatedClaudeAdapter, mapping.sharedWorkflowSource);
    }
  }
});

test("Claude adapter plan records local Claude conventions without runtime contents", () => {
  const inputs = JSON.stringify(plan.localClaudeConventionInputs);
  for (const marker of ["authoring-agents.md", "authoring-skills.md", "architecture.md", "frontmatter", "Use when"]) {
    assert.match(inputs, new RegExp(marker, "u"));
  }
  for (const input of plan.localClaudeConventionInputs) {
    assert.ok(input.inspection);
    assert.ok(input.usedFor);
  }
});

test("Claude adapter templates parse as JSON or Markdown frontmatter", () => {
  const files = walkFiles(templatesDir, file => file.endsWith(".json") || file.endsWith(".md"));
  assert.ok(files.length >= 9);
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    if (file.endsWith(".json")) {
      assert.doesNotThrow(() => JSON.parse(text), file);
    } else if (file.endsWith("CLAUDE.md.template.md")) {
      assert.match(text, /@AGENTS\.md/u, file);
    } else {
      assert.match(text, /^---\n[\s\S]*?\n---\n\n?# /u, file);
    }
  }

  const allTemplateText = files.map(file => readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(allTemplateText, /github_pat_|gh[pousr]_|sk-[A-Za-z0-9_-]{20,}|\/Users\//u);
  assert.doesNotMatch(allTemplateText, /"sharedSource"\s*:\s*"~\/\.claude"/u);
  assert.doesNotMatch(allTemplateText, /"source"\s*:\s*"~\/\.claude"/u);
});

test("Claude agent templates are read-heavy and match local metadata shape", () => {
  const agentFiles = walkFiles(path.join(templatesDir, "agents"), file => file.endsWith(".md"));
  assert.ok(agentFiles.length >= 5);
  for (const file of agentFiles) {
    const text = readFileSync(file, "utf8");
    assert.match(text, /^name: omp-/mu);
    assert.match(text, /^description: /mu);
    assert.match(text, /^tools: \[Read, Glob, Grep\]/mu);
    assert.doesNotMatch(text, /\b(Edit|Write|Bash)\b/u);
    assert.doesNotMatch(text, /^model:/mu);
    assert.match(text, /Do not read Claude runtime/u);
  }
});

test("Claude local-only surfaces and generated candidates stay dry-run only", () => {
  const localOnly = JSON.stringify(plan.localOnlyClaudeSurfaces);
  for (const marker of [
    ".credentials.json",
    "history.jsonl",
    "projects",
    "sessions",
    "session-env",
    "shell-snapshots",
    "tasks",
    "teams",
    "jobs",
    "file-history",
    "cache",
    "paste-cache",
    "plugins/cache",
    "plugins/data",
    "daemon",
    "daemon-auth",
    "settings.local.json",
    "backups",
    "workflows",
  ]) {
    assert.match(localOnly, new RegExp(marker.replace("/", "\\/"), "u"));
  }
  assert.ok(plan.generatedCandidateSurfaces.every(surface => surface.status === "dry-run-only"));
  assert.ok(plan.generatedCandidateSurfaces.some(surface => surface.surface === "~/.claude/agents/*.md"));
  assert.ok(plan.generatedCandidateSurfaces.some(surface => surface.surface === "per-skill symlink manifest"));
});

test("Claude adapter plan documents duplicate skill risk without dedupe action", () => {
  const risks = JSON.stringify(plan.duplicateSkillRootRisks);
  for (const marker of ["~/.claude/skills", "~/.codex/skills", "~/.agents/skills", "repo:.agents/skills"]) {
    assert.match(risks, new RegExp(marker.replace("/", "\\/"), "u"));
  }
  assert.match(risks, /document-only/u);
  assert.match(risks, /forbid-bulk-symlink/u);
  assert.doesNotMatch(risks, /issue42Action":"delete|issue42Action":"move|issue42Action":"rewrite/u);
});

test("Claude adapter validator rejects write-capable reviewer agent tools", () => {
  const result = runValidatorWithTemplateMutation("agents/omp-reviewer.md", text =>
    text.replace("tools: [Read, Glob, Grep]", "tools: [Read, Glob, Grep, Write]"),
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must not grant Write/u);
});

test("Claude adapter validator rejects unsafe settings keys", () => {
  const result = runValidatorWithTemplateMutation("settings.template.json", text => {
    const data = JSON.parse(text);
    data.env = { ANTHROPIC_API_KEY: "from-shell" };
    return `${JSON.stringify(data, null, 2)}\n`;
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /forbidden key env/u);
});

test("Claude adapter validator rejects bulk Claude root symlink sources", () => {
  const result = runValidatorWithTemplateMutation("skill-symlinks.template.json", text => {
    const data = JSON.parse(text);
    data.candidates[0].sharedSource = "~/.claude";
    return `${JSON.stringify(data, null, 2)}\n`;
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /whole Claude home as source|per-skill shared source/u);
});

test("Claude adapter plan markdown includes reviewable human decisions", () => {
  const markdown = readFileSync(planMdPath, "utf8");
  for (const decision of plan.humanDecisionsBeforeImplementation) {
    assert.ok(markdown.includes(decision), `missing decision: ${decision}`);
  }
  assert.match(markdown, /Claude Conventions Used/u);
  assert.match(markdown, /Dry-Run Render And Validation Strategy/u);
  assert.match(markdown, /does not write to live `~\/\.claude`/u);
  assert.match(markdown, /Skill Root Duplication Risks/u);
  assert.doesNotMatch(markdown, /Official Claude Docs Used/u);
});
