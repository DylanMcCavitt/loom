import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const manifestPath = new URL("../docs/harness/resource-manifest.json", import.meta.url).pathname;
const baseManifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const harnessSafetyModule = await import("../scripts/lib/harness-safety.mjs").catch((error) => ({ importError: error }));
const renderModule = await import("../scripts/render-harness-nucleus.mjs").catch((error) => ({ importError: error }));

async function importRequired(modulePath, exportName) {
  const module = await import(modulePath);
  assert.equal(
    typeof module[exportName],
    "function",
    `${modulePath} must export function ${exportName}`,
  );
  return module[exportName];
}

function requireFunction(module, exportName, modulePath) {
  assert.ifError(module.importError);
  assert.equal(
    typeof module[exportName],
    "function",
    `${modulePath} must export function ${exportName}`,
  );
  return module[exportName];
}

function fakeSecretToken() {
  return ["sk", "test".repeat(6)].join("-");
}

function privateKeyHeader() {
  return ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
}

function privateKeyFooter() {
  return ["-----END", "PRIVATE KEY-----"].join(" ");
}

function codexAuthPath() {
  return ["~/.codex", "auth.json"].join("/");
}

function unsafeFixtureText() {
  return [
    `token: ${fakeSecretToken()}`,
    `credentialPath: ${codexAuthPath()}`,
    privateKeyHeader(),
    "not-a-real-key",
    privateKeyFooter(),
    "",
  ].join("\n");
}

function errorsFrom(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.errors)) return result.errors;
  assert.fail(`validator must return an errors array or an object with errors; got ${JSON.stringify(result)}`);
}

function assertSafetyRejection(errors, label) {
  assert.ok(errors.length > 0, `${label} should reject the unsafe fixture`);
  const joined = errors.join("\n");
  assert.match(joined, /API-key|token|secret-looking|secret/i, `${label} should report the fake sk-style token`);
  assert.match(joined, /auth\.json|auth\/cache|local-only|dangerous/i, `${label} should report the Codex auth path`);
  assert.match(joined, /PRIVATE KEY|private key|credential/i, `${label} should report the private key header`);
}

function cloneManifest() {
  return JSON.parse(JSON.stringify(baseManifest));
}

function withTempDir(callback) {
  const root = mkdtempSync(path.join(tmpdir(), "harness-safety-lib-"));
  try {
    return callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath, text) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, text);
}

function codexFixture(root) {
  const planPath = path.join(root, "codex-plan.json");
  const planMdPath = path.join(root, "codex-plan.md");
  const sourcePath = path.join(root, "source.json");
  const portabilityPath = path.join(root, "portability.json");
  const templateDir = path.join(root, "codex-templates");
  mkdirSync(templateDir, { recursive: true });
  writeJson(planPath, {
    schemaVersion: 1,
    generatedForIssue: 41,
    officialCodexDocs: [],
    ompAgentMappings: [],
    skillCandidateMappings: [],
    templateBoundaries: [],
    localOnlyCodexSurfaces: [],
    generatedCandidateSurfaces: [],
    sourceInputs: ["~/.omp/agent/workflow-kit"],
    repositoryWorkflowNucleus: {
      source: "~/.omp/agent/workflow-kit",
      status: "reference-only",
      portablePolicy: [],
      codexTranslation: [],
    },
    dryRunValidationStrategy: [],
    humanDecisionsBeforeImplementation: [],
    unsafeFixture: unsafeFixtureText(),
  });
  writeText(planMdPath, `# Codex plan\n\n${unsafeFixtureText()}`);
  writeJson(sourcePath, { expectedBundledAgents: [] });
  writeJson(portabilityPath, { commands: [] });
  return { planPath, planMdPath, sourcePath, portabilityPath, templateDir };
}

function claudeFixture(root) {
  const planPath = path.join(root, "claude-plan.json");
  const planMdPath = path.join(root, "claude-plan.md");
  const sourcePath = path.join(root, "source.json");
  const portabilityPath = path.join(root, "portability.json");
  const templateDir = path.join(root, "claude-templates");
  writeJson(path.join(templateDir, "skill-symlinks.template.json"), {
    dryRunOnly: true,
    candidates: [],
    bulkRootActionsForbidden: [],
  });
  writeJson(planPath, {
    schemaVersion: 1,
    generatedForIssue: 42,
    localClaudeConventionInputs: [],
    declarativeCandidateSurfaces: [],
    ompAgentMappings: [],
    skillCandidateMappings: [],
    templateBoundaries: [],
    localOnlyClaudeSurfaces: [],
    generatedCandidateSurfaces: [],
    repositoryWorkflowNucleus: {
      source: "~/.omp/agent/workflow-kit",
      status: "reference-only",
      portablePolicy: [],
      claudeTranslation: [],
    },
    dryRunValidationStrategy: [],
    humanDecisionsBeforeImplementation: [],
    unsafeFixture: unsafeFixtureText(),
  });
  writeText(planMdPath, `# Claude plan\n\n${unsafeFixtureText()}`);
  writeJson(sourcePath, { expectedBundledAgents: [] });
  writeJson(portabilityPath, { commands: [] });
  return { planPath, planMdPath, sourcePath, portabilityPath, templateDir };
}

function skillsFixture(root) {
  const skillsDir = path.join(root, "skills");
  writeText(
    path.join(skillsDir, "unsafe-skill", "SKILL.md"),
    [
      "---",
      "name: unsafe-skill",
      "description: Use when testing the shared safety scan",
      "---",
      "# Unsafe skill",
      unsafeFixtureText(),
    ].join("\n"),
  );
  return {
    skillsDir,
    globalSkillsDirs: [],
    reservedNames: new Set(),
    checkCompat: false,
    compatSkillsDir: path.join(root, "compat-skills"),
  };
}

test("shared safety scan rejects each unsafe fixture fragment", () => {
  const scanHarnessSafety = requireFunction(
    harnessSafetyModule,
    "scanHarnessSafety",
    "../scripts/lib/harness-safety.mjs",
  );
  assertSafetyRejection(scanHarnessSafety("fixture", unsafeFixtureText()), "scanHarnessSafety");
});

test("manifest validator preserves currentLivePath/discoverySource union rules", () => {
  const validateHarnessManifestLib = requireFunction(
    harnessSafetyModule,
    "validateHarnessManifest",
    "../scripts/lib/harness-safety.mjs",
  );
  const stringPathManifest = cloneManifest();
  const firstResource = stringPathManifest.resources[0];
  firstResource.currentLivePath = firstResource.currentLivePath[0];
  assert.deepEqual(errorsFrom(validateHarnessManifestLib(stringPathManifest)), []);

  const discoveryOnlyManifest = cloneManifest();
  discoveryOnlyManifest.resources[0].currentLivePath = [];
  discoveryOnlyManifest.resources[0].discoverySource = "documented manually in tests";
  assert.deepEqual(errorsFrom(validateHarnessManifestLib(discoveryOnlyManifest)), []);

  const missingUnionManifest = cloneManifest();
  missingUnionManifest.resources[0].currentLivePath = [];
  missingUnionManifest.resources[0].discoverySource = "";
  assert.match(
    errorsFrom(validateHarnessManifestLib(missingUnionManifest)).join("\n"),
    /must provide currentLivePath or discoverySource/u,
  );
});

test("all exported validation entrypoints reject the same unsafe fixture", async () => {
  const validateHarnessManifestEntrypoint = await importRequired(
    "../scripts/validate-harness-manifest.mjs",
    "validateHarnessManifest",
  );
  const validateCodexAdapterPlan = await importRequired(
    "../scripts/validate-codex-adapter-plan.mjs",
    "validateCodexAdapterPlan",
  );
  const validateClaudeAdapterPlan = await importRequired(
    "../scripts/validate-claude-adapter-plan.mjs",
    "validateClaudeAdapterPlan",
  );
  const validateSkills = await importRequired("../scripts/validate-skills.mjs", "validateSkills");

  const unsafeManifest = cloneManifest();
  unsafeManifest.resources[0].migrationNotes = unsafeFixtureText();
  unsafeManifest.resources[0].currentLivePath = [codexAuthPath()];
  assertSafetyRejection(errorsFrom(validateHarnessManifestEntrypoint(unsafeManifest)), "validate-harness-manifest");

  withTempDir((root) => {
    assertSafetyRejection(errorsFrom(validateCodexAdapterPlan(codexFixture(root))), "validate-codex-adapter-plan");
  });

  withTempDir((root) => {
    assertSafetyRejection(errorsFrom(validateClaudeAdapterPlan(claudeFixture(root))), "validate-claude-adapter-plan");
  });

  withTempDir((root) => {
    assertSafetyRejection(errorsFrom(validateSkills(skillsFixture(root))), "validate-skills");
  });

  withTempDir((root) => {
    const gateRenderedOutput = requireFunction(
      renderModule,
      "gateRenderedOutput",
      "../scripts/render-harness-nucleus.mjs",
    );
    const candidate = {
      id: "codex:unsafe-auth",
      harness: "codex",
      boundaryId: null,
      forbiddenKeys: [],
      source: "tests/unsafe.md",
      content: unsafeFixtureText(),
      renderedRelPath: "codex/user/unsafe.md",
      destination: codexAuthPath(),
      disposition: "adapt",
      operation: "create-file",
      appliable: true,
    };
    assertSafetyRejection(
      gateRenderedOutput([candidate], [codexAuthPath()], root),
      "render gate",
    );
  });
});
