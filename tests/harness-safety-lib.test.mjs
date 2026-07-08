import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const harnessSafetyModule = await import("../scripts/lib/harness-safety.mjs").catch((error) => ({ importError: error }));

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

function withTempDir(callback) {
  const root = mkdtempSync(path.join(tmpdir(), "harness-safety-lib-"));
  try {
    return callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function writeText(filePath, text) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, text);
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

test("kept exported validation entrypoints reject the same unsafe fixture", async () => {
  const validateSkills = await importRequired("../scripts/validate-skills.mjs", "validateSkills");

  withTempDir((root) => {
    assertSafetyRejection(errorsFrom(validateSkills(skillsFixture(root))), "validate-skills");
  });
});
