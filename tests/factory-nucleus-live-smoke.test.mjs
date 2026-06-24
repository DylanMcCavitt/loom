import assert from "node:assert/strict";
import { test } from "node:test";

import { LIVE_SMOKE_ENV, resolveLiveSmokeConfig } from "../scripts/factory-nucleus/live-smoke.mjs";

// A fully-configured environment for the optional live smoke (hermetic fixture —
// never used to make a live call; only to exercise the pure config reader).
const FULL_ENV = Object.freeze({
  [LIVE_SMOKE_ENV.optIn]: "1",
  [LIVE_SMOKE_ENV.linearTeam]: "Sandbox",
  [LIVE_SMOKE_ENV.linearProject]: "Smoke",
  [LIVE_SMOKE_ENV.linearToken]: "linear-token-sentinel-not-a-secret",
  [LIVE_SMOKE_ENV.githubRepo]: "acme/sandbox",
  [LIVE_SMOKE_ENV.githubToken]: "github-token-sentinel-not-a-secret",
});

test("default environment opts out of live smoke", () => {
  const config = resolveLiveSmokeConfig({});
  assert.equal(config.enabled, false);
  assert.equal(config.ready, false);
  assert.equal(config.linear, null);
  assert.equal(config.github, null);
  // Every required variable is reported missing, by name.
  assert.deepEqual(
    config.missing.sort(),
    [
      LIVE_SMOKE_ENV.githubRepo,
      LIVE_SMOKE_ENV.githubToken,
      LIVE_SMOKE_ENV.linearProject,
      LIVE_SMOKE_ENV.linearTeam,
      LIVE_SMOKE_ENV.linearToken,
    ].sort(),
  );
});

test("opt-in flag without sandbox targets is enabled but not ready", () => {
  const config = resolveLiveSmokeConfig({ [LIVE_SMOKE_ENV.optIn]: "1" });
  assert.equal(config.enabled, true);
  assert.equal(config.ready, false);
  assert.ok(config.missing.includes(LIVE_SMOKE_ENV.linearTeam));
  assert.ok(config.missing.includes(LIVE_SMOKE_ENV.githubRepo));
});

test("a fully-configured environment is ready with parsed sandbox targets", () => {
  const config = resolveLiveSmokeConfig(FULL_ENV);
  assert.equal(config.enabled, true);
  assert.equal(config.ready, true);
  assert.deepEqual(config.missing, []);
  assert.deepEqual(config.linear, { team: "Sandbox", project: "Smoke" });
  assert.deepEqual(config.github, { repo: "acme/sandbox" });
  assert.equal(config.hasLinearToken, true);
  assert.equal(config.hasGithubToken, true);
});

test("config exposes token presence only, never the token values", () => {
  const config = resolveLiveSmokeConfig(FULL_ENV);
  const serialized = JSON.stringify(config);
  assert.doesNotMatch(serialized, /linear-token-sentinel-not-a-secret/u);
  assert.doesNotMatch(serialized, /github-token-sentinel-not-a-secret/u);
});

// Opt-in live tracker smoke. SKIPPED unless LOO_LIVE_SMOKE=1, so the default
// test path (CI and hermetic runs) never authenticates or writes to a live
// tracker. The live create -> verify -> delete steps against the operator's
// disposable Linear/GitHub sandboxes are a separate implementation issue; this
// scaffold pins the opt-in gate and the config contract without performing any
// live call or creating any live object (FN-36 non-goals). See
// docs/factory-nucleus/live-smoke.md.
test(
  "live tracker smoke (opt-in): disposable-sandbox create -> verify -> delete [deferred]",
  {
    skip: process.env[LIVE_SMOKE_ENV.optIn] === "1"
      ? false
      : `set ${LIVE_SMOKE_ENV.optIn}=1 (plus sandbox env) to run live tracker smoke`,
  },
  () => {
    const config = resolveLiveSmokeConfig();
    // Fail fast with the exact missing variable names if the opt-in is incomplete.
    assert.equal(config.ready, true, `live smoke is missing: ${config.missing.join(", ") || "(nothing)"}`);
    // Designed flow (see docs/factory-nucleus/live-smoke.md), deferred to its
    // implementation issue so this issue creates no live objects:
    //   1. create a disposable ghost in the Linear sandbox + an issue in the GitHub sandbox
    //   2. verify each adapter resolves it through the tracker-neutral contract
    //   3. delete both in a finally block (self-cleanup; best-effort on failure)
    assert.fail("live tracker smoke create -> verify -> delete is deferred; see docs/factory-nucleus/live-smoke.md");
  },
);
