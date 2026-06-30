import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  DETERMINISTIC_RULES,
  validateSharedAgentPackages,
} from "../scripts/validate-shared-agent-packages.mjs";

const script = new URL("../scripts/validate-shared-agent-packages.mjs", import.meta.url).pathname;
const contract = JSON.parse(readFileSync(new URL("../docs/harness/shared-nucleus-agents.json", import.meta.url), "utf8"));

test("shared agent package validator passes for checked-in plugin packages", () => {
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
