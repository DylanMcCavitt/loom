import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  buildRetroPacket,
  validateEvidenceIntakeEntry,
  validateRetroPacket,
  writeRetroPacketFiles,
} from "../scripts/retro-packet.mjs";

function readJson(relativePath) {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));
}

const validFixture = readJson("fixtures/retro-packet-valid.json");
const malformedFixture = readJson("fixtures/retro-packet-malformed.json");

test("retro packet fixture satisfies the evidence-intake practiced core", () => {
  const result = validateRetroPacket(validFixture);
  assert.deepEqual(result, { ok: true, errors: [] });
  for (const entry of validFixture.entries) {
    assert.equal(validateEvidenceIntakeEntry(entry).ok, true, entry.kind);
  }
});

test("retro packet validator rejects malformed candidate entries", () => {
  const result = validateEvidenceIntakeEntry(malformedFixture.entries[0]);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /missing targetFile/u);
  assert.match(result.errors.join("\n"), /missing candidate/u);
  assert.match(result.errors.join("\n"), /status must be pending-human-review/u);
});

test("retro packet builder writes schema-valid nucleus files", () => {
  const root = mkdtempSync(path.join(tmpdir(), "retro-packet-test-"));
  try {
    const packet = buildRetroPacket({
      number: 215,
      title: "LOO-206: archive write-only docs",
      body: "## Summary\n- Move archive docs.\n## Test plan\n- [x] npm run check",
      labels: [],
      files: [
        { path: "docs/archive/README.md", additions: 3, deletions: 0, changeType: "ADDED" },
        { path: "docs/operator/daily-workflow.md", additions: 1, deletions: 1, changeType: "MODIFIED" },
      ],
      mergedAt: "2026-07-07T14:17:52Z",
      author: { login: "DylanMcCavitt" },
      url: "https://github.com/DylanMcCavitt/loom/pull/215",
      baseRefName: "main",
      headRefName: "loo-206",
    }, { generatedAt: "2026-07-07T00:00:00.000Z" });
    const written = writeRetroPacketFiles(packet, { root }).written;
    assert.deepEqual(written, [
      "nucleus/retro/pr-215/decision-log.json",
      "nucleus/retro/pr-215/candidate-exemplar.json",
      "nucleus/retro/pr-215/candidate-rule.json",
      "nucleus/retro/pr-215/candidate-coverage-gap.json",
      "nucleus/retro/pr-215/pr-body.md",
    ]);
    const saved = JSON.parse(readFileSync(path.join(root, "nucleus/retro/pr-215/candidate-rule.json"), "utf8"));
    assert.equal(validateEvidenceIntakeEntry(saved).ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
