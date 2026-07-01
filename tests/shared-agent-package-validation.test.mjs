import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import path from "node:path";
import { tmpdir } from "node:os";

import {
  DETERMINISTIC_RULES,
  validateSharedAgentPackages,
} from "../scripts/validate-shared-agent-packages.mjs";

const script = new URL("../scripts/validate-shared-agent-packages.mjs", import.meta.url).pathname;
const contract = JSON.parse(readFileSync(new URL("../docs/harness/shared-nucleus-agents.json", import.meta.url), "utf8"));

test("shared agent package validator passes for checked-in canonical packages and derived plugin candidates", () => {
  const result = spawnSync(process.execPath, [script], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`Shared agent package checks passed: ${contract.agents.length} packages, \\d+ rule blocks, ${DETERMINISTIC_RULES.length} deterministic checks`, "u"));
});

test("shared agent package validator covers mechanical LOO-104 rules", () => {
  const result = validateSharedAgentPackages();
  assert.deepEqual(result.failures, []);
  assert.equal(result.packagesChecked, contract.agents.length);
  assert.equal(result.deterministicRules, DETERMINISTIC_RULES.length);
  assert.ok(result.rulesChecked >= contract.agents.length, "each package should carry at least one stable rule");

  const coveredRules = new Set(DETERMINISTIC_RULES.map((rule) => rule.id));
  assert.deepEqual(coveredRules, new Set(["package-structure", "rule-schema", "canonical-names", "skill-sections"]));
  for (const rule of DETERMINISTIC_RULES) {
    assert.ok(rule.reason, `${rule.id} must explain why deterministic checking is appropriate`);
    assert.ok(rule.fix, `${rule.id} must name a concrete fix`);
  }
});

test("shared agent package validator fails when canonical packages are missing", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "shared-agent-packages-"));
  try {
    const result = validateSharedAgentPackages({ skillsDir: dir });
    assert.ok(
      result.failures.some((failure) => failure.includes("canonical .agents/skills directory missing shared packages")),
      result.failures.join("\n"),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("shared agent package validator fails when plan agents bypass canonical source", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "shared-agent-plan-"));
  try {
    const planPath = path.join(dir, "plan.json");
    const plan = JSON.parse(readFileSync(new URL("../adapters/plugin-bridge/plan.json", import.meta.url), "utf8"));
    plan.agents[0].packageRoot = `loom-nucleus/skills/${plan.agents[0].name}`;
    writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);

    const result = validateSharedAgentPackages({ plan: planPath });
    assert.ok(
      result.failures.some((failure) => failure.includes(`plan packageRoot must be .agents/skills/${plan.agents[0].name}`)),
      result.failures.join("\n"),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("shared agent package validator fails when a derived candidate diverges from canonical source", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "shared-agent-derived-"));
  try {
    const skillsDir = path.join(dir, "skills");
    cpSync(new URL("../.agents/skills", import.meta.url), skillsDir, { recursive: true });
    writeFileSync(path.join(skillsDir, "blueprint", "SKILL.md"), "---\nname: blueprint\n---\n\n# Drifted\n");

    const result = validateSharedAgentPackages({ skillsDir });
    assert.ok(
      result.failures.some((failure) => failure.includes("blueprint: derived plugin package SKILL.md must match canonical .agents/skills source")),
      result.failures.join("\n"),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
