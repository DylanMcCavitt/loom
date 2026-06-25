import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { SECRET_PATTERNS, PRIVATE_HOME_PATH_PATTERN } from "../scripts/lib/harness-safety.mjs";

// FN-47 invariants for the opt-in live-smoke CI workflow. These prove acceptance
// #1 (manual-dispatch only; default `check` unchanged and still skips live smoke)
// and #2 (credentials from secrets; no secrets in tracked files) in-repo, under
// the default `npm run check`. Acceptance #3 (an actual dispatch run against the
// disposable sandboxes) is operator-triggered and out of scope for a hermetic
// test. We assert on the raw YAML text (the repo ships no YAML parser dependency)
// and reuse the safety gate's secret patterns rather than reimplementing them.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

const LIVE_WORKFLOW = ".github/workflows/live-smoke.yml";
const DEFAULT_WORKFLOW = ".github/workflows/check.yml";

test("live-smoke workflow triggers ONLY on manual dispatch (no push/PR/schedule/etc.)", () => {
  const wf = read(LIVE_WORKFLOW);
  // Allowlist, not a denylist: workflow_dispatch must be the SOLE trigger. Pull
  // the keys directly under `on:` (2-space indent, before `jobs:`) and assert
  // exactly one — so a future push/pull_request/schedule/workflow_run trigger fails.
  const onBlock = wf.slice(wf.search(/^on:/mu), wf.search(/^jobs:/mu));
  const triggers = [...onBlock.matchAll(/^ {2}([A-Za-z_]+):/gmu)].map((m) => m[1]);
  assert.deepEqual(
    triggers,
    ["workflow_dispatch"],
    `workflow_dispatch must be the only trigger; found: ${triggers.join(", ") || "(none)"}`,
  );
});

test("live-smoke workflow opts in and runs only the live-smoke test file", () => {
  const wf = read(LIVE_WORKFLOW);
  assert.match(wf, /LOO_LIVE_SMOKE:\s*["']?1["']?/u, "sets the LOO_LIVE_SMOKE opt-in flag");
  assert.match(
    wf,
    /node --test tests\/factory-nucleus-live-smoke\.test\.mjs/u,
    "runs only the live-smoke test file, not the whole suite",
  );
});

test("live-smoke workflow sources every credential from secrets, with no inline secret", () => {
  const wf = read(LIVE_WORKFLOW);
  // Credentials come from the secrets context (PAT for the cross-repo GitHub half).
  assert.match(wf, /LINEAR_API_KEY:\s*\$\{\{\s*secrets\./u, "LINEAR_API_KEY from secrets");
  assert.match(wf, /GITHUB_TOKEN:\s*\$\{\{\s*secrets\.LIVE_SMOKE_GITHUB_PAT\s*\}\}/u, "GITHUB_TOKEN from the cross-repo PAT secret");
  assert.doesNotMatch(wf, /GITHUB_TOKEN:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/u, "never the default Actions GITHUB_TOKEN (cannot write to a different sandbox repo)");
  // No secret-looking literal or absolute private home path in the tracked file.
  for (const pattern of SECRET_PATTERNS) {
    assert.doesNotMatch(wf, pattern, `live-smoke workflow must hold no secret-looking literal: ${pattern}`);
  }
  assert.doesNotMatch(wf, PRIVATE_HOME_PATH_PATTERN, "live-smoke workflow must hold no absolute private home path");
});

test("default check workflow stays push/PR-triggered and never opts into live smoke", () => {
  const wf = read(DEFAULT_WORKFLOW);
  assert.match(wf, /^\s*push:/mu, "default check still triggers on push");
  assert.match(wf, /^\s*pull_request:/mu, "default check still triggers on pull_request");
  assert.doesNotMatch(wf, /LOO_LIVE_SMOKE/u, "default check never opts into live smoke (stays hermetic)");
});
