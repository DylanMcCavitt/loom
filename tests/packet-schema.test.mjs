import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import {
  PACKET_KINDS,
  PACKET_SCHEMAS,
  validatePacket,
  validateTaggedPacket,
} from "../scripts/lib/packet-schema.mjs";
import {
  extractFencedJsonBlocks,
  scanMarkdownPackets,
  scanJsonPackets,
  validateRetroPackets,
} from "../scripts/validate-packets.mjs";

const validator = new URL("../scripts/validate-packets.mjs", import.meta.url).pathname;
const repoRoot = new URL("../", import.meta.url).pathname;

const validRepairFinding = Object.freeze({
  packet: "repair-finding",
  file: "src/config.js",
  symbol: "parseConfig",
  scope: "null-guard on empty file only",
  concreteRisk: "empty config dereferences null and crashes startup",
  minimalExpectedFix: "return defaults when file content is empty",
  proofCheck: "node --test tests/config.test.mjs",
  ruleSourceId: "rule/null-guard-empty-input",
  nonGoals: ["refactor adjacent parsers", "change config schema"],
  allowedFiles: ["src/config.js"],
  context: "validation",
});

const validAgentInput = Object.freeze({
  packet: "agent-input",
  mode: "review",
  context: "live",
  lenses: ["correctness", "security"],
  targetSurface: "skills/biters",
  scope: "diff-only review of the open PR",
  issueId: "LOO-000",
  prId: "42",
});

const validAgentOutput = Object.freeze({
  packet: "agent-output",
  mode: "prove",
  lens: "command-proof",
  targetSurface: "skills/lab",
  loadedReferences: ["references/rules.md"],
  ruleIds: ["rule/proof-before-launch"],
  proofRun: "npm test",
  proofResult: "pass",
  unresolvedCoverageGaps: [],
  changedFiles: [],
});

test("PACKET_SCHEMAS covers every declared kind", () => {
  assert.deepEqual(Object.keys(PACKET_SCHEMAS).sort(), [...PACKET_KINDS].sort());
});

test("validatePacket accepts a complete repair-finding packet", () => {
  const result = validatePacket("repair-finding", validRepairFinding);
  assert.deepEqual(result, { ok: true, errors: [] });
});

test("validatePacket rejects repair-finding packets missing required fields", () => {
  const result = validatePacket("repair-finding", { packet: "repair-finding", file: "a.js" });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /symbol: missing required field/u);
  assert.match(result.errors.join("\n"), /concreteRisk: missing required field/u);
  assert.match(result.errors.join("\n"), /allowedFiles: missing required field/u);
});

test("validatePacket accepts agent-input with mode defaults for absent lens and context", () => {
  const result = validatePacket("agent-input", {
    packet: "agent-input",
    mode: "shape",
    targetSurface: "skills/blueprint",
  });
  assert.deepEqual(result, { ok: true, errors: [] });
});

test("validatePacket rejects agent-input with unknown mode or context", () => {
  const result = validatePacket("agent-input", {
    packet: "agent-input",
    mode: "audit",
    context: "staging",
    targetSurface: "skills/biters",
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /mode: must be one of/u);
  assert.match(result.errors.join("\n"), /context: must be one of/u);
});

test("validatePacket accepts a complete agent-output packet", () => {
  const result = validatePacket("agent-output", validAgentOutput);
  assert.deepEqual(result, { ok: true, errors: [] });
});

test("validatePacket rejects agent-output missing proof and coverage fields", () => {
  const result = validatePacket("agent-output", {
    packet: "agent-output",
    mode: "review",
    targetSurface: "skills/biters",
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /loadedReferences: missing required field/u);
  assert.match(result.errors.join("\n"), /proofRun: missing required field/u);
  assert.match(result.errors.join("\n"), /unresolvedCoverageGaps: missing required field/u);
  assert.match(result.errors.join("\n"), /changedFiles: missing required field/u);
});

test("validatePacket rejects unknown kinds and non-objects", () => {
  assert.match(validatePacket("nope", {}).errors.join("\n"), /unknown packet kind/u);
  assert.match(validatePacket("agent-input", null).errors.join("\n"), /expected a plain object/u);
  assert.match(validatePacket("agent-input", []).errors.join("\n"), /expected a plain object/u);
});

test("validateTaggedPacket reads the packet kind tag", () => {
  const ok = validateTaggedPacket(validAgentInput);
  assert.equal(ok.ok, true);
  assert.equal(ok.kind, "agent-input");

  const missing = validateTaggedPacket({ mode: "review" });
  assert.equal(missing.ok, false);
  assert.match(missing.errors.join("\n"), /missing required kind tag/u);
});

test("extractFencedJsonBlocks finds json fences in markdown", () => {
  const markdown = [
    "# Evidence",
    "",
    "```json",
    JSON.stringify(validAgentOutput, null, 2),
    "```",
    "",
    "```js",
    "const x = 1;",
    "```",
    "",
    "```json",
    '{"packet":"agent-input","mode":"launch","targetSurface":"skills/rocket-launch"}',
    "```",
  ].join("\n");
  const blocks = extractFencedJsonBlocks(markdown);
  assert.equal(blocks.length, 2);
  assert.match(blocks[0].body, /"agent-output"/u);
  assert.match(blocks[1].body, /"agent-input"/u);
});

test("scanMarkdownPackets validates tagged fences and ignores untagged JSON", () => {
  const markdown = [
    "```json",
    JSON.stringify(validRepairFinding, null, 2),
    "```",
    "",
    "```json",
    '{"note":"legacy evidence without packet tag"}',
    "```",
    "",
    "```json",
    '{"packet":"agent-input","mode":"nope","targetSurface":"x"}',
    "```",
  ].join("\n");
  const result = scanMarkdownPackets("retro/example.md", markdown);
  assert.equal(result.checked, 2);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /retro\/example\.md:\d+: agent-input\.mode: must be one of/u);
});

test("scanJsonPackets validates tagged standalone JSON and skips untagged", () => {
  const tagged = scanJsonPackets("retro/p.json", JSON.stringify(validAgentInput));
  assert.deepEqual(tagged, { checked: 1, errors: [] });

  const untagged = scanJsonPackets("retro/legacy.json", JSON.stringify({ entries: [] }));
  assert.deepEqual(untagged, { checked: 0, errors: [] });

  const bad = scanJsonPackets(
    "retro/bad.json",
    JSON.stringify({ packet: "repair-finding", file: "only.js" }),
  );
  assert.equal(bad.checked, 1);
  assert.ok(bad.errors.length > 0);
});

test("validateRetroPackets passes when retro has no tagged packets", () => {
  const root = mkdtempSync(path.join(tmpdir(), "packet-schema-empty-"));
  try {
    mkdirSync(path.join(root, "retro"), { recursive: true });
    writeFileSync(path.join(root, "retro", "notes.md"), "# empty\n");
    writeFileSync(path.join(root, "retro", "legacy.json"), "{\"entries\":[]}\n");
    const result = validateRetroPackets({ root });
    assert.deepEqual(result.errors, []);
    assert.equal(result.checked, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("validateRetroPackets fails on invalid tagged packets under retro/", () => {
  const root = mkdtempSync(path.join(tmpdir(), "packet-schema-bad-"));
  try {
    const dir = path.join(root, "retro", "pr-1");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, "finding.md"),
      ["```json", JSON.stringify({ packet: "repair-finding", file: "a.js" }, null, 2), "```", ""].join("\n"),
    );
    const result = validateRetroPackets({ root });
    assert.ok(result.errors.length > 0);
    assert.match(result.errors.join("\n"), /missing required field/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("validate-packets.mjs exits 0 on the repo retro tree", () => {
  const result = spawnSync(process.execPath, [validator], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Packet validation passed/u);
});

test("validate-packets.mjs exits 0 when retro has no tagged packets", () => {
  const root = mkdtempSync(path.join(tmpdir(), "packet-schema-cli-empty-"));
  try {
    mkdirSync(path.join(root, "retro"), { recursive: true });
    writeFileSync(path.join(root, "retro", "notes.md"), "# none\n");
    const result = spawnSync(process.execPath, [validator, "--root", root], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /0 packets checked/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("validate-packets.mjs exits nonzero when a retro fixture is invalid", () => {
  const root = mkdtempSync(path.join(tmpdir(), "packet-schema-cli-"));
  try {
    const dir = path.join(root, "retro");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, "bad.json"),
      JSON.stringify({ packet: "agent-output", mode: "review", targetSurface: "x" }),
    );
    const result = spawnSync(process.execPath, [validator, "--root", root], {
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Packet validation failed/u);
    assert.match(result.stderr, /missing required field/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
