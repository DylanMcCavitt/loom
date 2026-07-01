import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { configKeys, renderAndGate } from "../scripts/lib/harness-render-gate.mjs";

const inlineForbidden = new URL("./fixtures/toml-inline-forbidden.toml", import.meta.url);
const multilineFakeKey = new URL("./fixtures/toml-multiline-fake-key.toml", import.meta.url);

function tomlCandidate(content) {
  return {
    id: "codex:test.toml",
    harness: "codex",
    boundaryId: null,
    forbiddenKeys: [],
    source: "tests/fixtures/test.toml",
    content,
    renderedRelPath: "codex/test.toml",
    destination: "~/.codex/test.toml",
    disposition: "reference-only",
    operation: "merge-config",
    appliable: false,
  };
}

test("TOML forbidden-key scan catches inline-table smuggling", () => {
  const content = readFileSync(inlineForbidden, "utf8");
  const keys = configKeys(content, "toml");
  assert.ok(keys.has("profile.model"), `expected profile.model in ${[...keys].join(",")}`);

  const findings = renderAndGate([tomlCandidate(content)], []);
  assert.ok(
    findings.some((finding) => finding.includes("forbidden key model")),
    findings.join("\n"),
  );
});

test("TOML forbidden-key scan ignores key-shaped text inside multiline strings", () => {
  const content = readFileSync(multilineFakeKey, "utf8");
  const keys = configKeys(content, "toml");
  assert.equal(keys.has("model"), false, `unexpected model key in ${[...keys].join(",")}`);

  assert.deepEqual(renderAndGate([tomlCandidate(content)], []), []);
});
