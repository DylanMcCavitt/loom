import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";

import { LIVE_SMOKE_ENV, normalizeGithubIssue, resolveLiveSmokeConfig } from "../scripts/factory-nucleus/live-smoke.mjs";
import { createGithubTracker } from "../scripts/factory-nucleus/tracker-github.mjs";

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

test("per-adapter readiness gates GitHub and Linear independently", () => {
  // GitHub sandbox configured, Linear absent: githubReady only, never `ready`.
  const githubOnly = resolveLiveSmokeConfig({
    [LIVE_SMOKE_ENV.optIn]: "1",
    [LIVE_SMOKE_ENV.githubRepo]: "acme/sandbox",
    [LIVE_SMOKE_ENV.githubToken]: "github-token-sentinel-not-a-secret",
  });
  assert.equal(githubOnly.githubReady, true);
  assert.equal(githubOnly.linearReady, false);
  assert.equal(githubOnly.ready, false);
  assert.deepEqual(githubOnly.githubMissing, []);
  assert.deepEqual(githubOnly.linearMissing.sort(), [
    LIVE_SMOKE_ENV.linearProject,
    LIVE_SMOKE_ENV.linearTeam,
    LIVE_SMOKE_ENV.linearToken,
  ].sort());

  // Opted in but no GitHub sandbox: not githubReady; names the missing GitHub vars.
  const noGithub = resolveLiveSmokeConfig({ [LIVE_SMOKE_ENV.optIn]: "1" });
  assert.equal(noGithub.githubReady, false);
  assert.deepEqual(noGithub.githubMissing.sort(), [
    LIVE_SMOKE_ENV.githubRepo,
    LIVE_SMOKE_ENV.githubToken,
  ].sort());

  // Not opted in: neither adapter is ready even when fully configured.
  const notOptedIn = resolveLiveSmokeConfig({ ...FULL_ENV, [LIVE_SMOKE_ENV.optIn]: "0" });
  assert.equal(notOptedIn.githubReady, false);
  assert.equal(notOptedIn.linearReady, false);
});

test("normalizeGithubIssue maps gh CLI JSON onto the GitHub adapter shape", () => {
  // gh returns uppercase state + label objects; an open issue with a readiness label.
  const open = normalizeGithubIssue({
    number: 7,
    title: "live smoke",
    state: "OPEN",
    labels: [{ name: "in-progress" }, { name: "feature" }],
    stateReason: null,
  });
  assert.deepEqual(open, { number: 7, title: "live smoke", state: "open", labels: ["in-progress", "feature"] });
  const openGhost = createGithubTracker({ repo: "acme/sandbox", issues: [open] }).getGhost("#7");
  assert.equal(openGhost.state, "in-progress");
  assert.deepEqual(openGhost.labels, ["in-progress", "feature"]);

  // Closed as not planned -> canceled; bare string labels pass through unchanged.
  const canceled = normalizeGithubIssue({ number: 8, title: "x", state: "CLOSED", labels: ["wontfix"], stateReason: "NOT_PLANNED" });
  assert.equal(canceled.state, "closed");
  assert.equal(canceled.stateReason, "not_planned");
  assert.equal(createGithubTracker({ repo: "acme/sandbox", issues: [canceled] }).getGhost("#8").state, "canceled");
});

// Opt-in live GitHub Issues smoke (FN-45). SKIPPED unless opted in
// (LOO_LIVE_SMOKE=1), so the default `npm run check` path never authenticates or
// writes to GitHub. When opted in but the GitHub sandbox env is incomplete it
// FAILS FAST naming the missing vars (never falls back to a real/"current"
// repo). Uses the `gh` CLI against the operator's disposable sandbox repo
// (LOO_LIVE_GITHUB_REPO): create a throwaway issue, resolve it through the
// GitHub adapter, then delete it in a `finally` so a failed assertion still
// tears it down (idempotent; no residue). Repo/token come only from the
// environment (never hardcoded), and `gh` reads GITHUB_TOKEN from the env. See
// docs/factory-nucleus/live-smoke.md.
test(
  "live GitHub Issues smoke (opt-in): disposable-sandbox create -> verify -> delete",
  {
    skip: resolveLiveSmokeConfig().enabled
      ? false
      : `set ${LIVE_SMOKE_ENV.optIn}=1 (plus ${LIVE_SMOKE_ENV.githubRepo} + ${LIVE_SMOKE_ENV.githubToken}) to run the live GitHub smoke`,
  },
  () => {
    const config = resolveLiveSmokeConfig();
    // Fail fast naming any missing GitHub var if opted in without a complete sandbox env.
    assert.ok(config.githubReady, `live GitHub smoke is missing: ${config.githubMissing.join(", ") || "(nothing)"}`);
    const repo = config.github.repo;
    const gh = (args) => spawnSync("gh", args, { encoding: "utf8", timeout: 30000 });

    const title = `factory-live-smoke ${new Date().toISOString()} (pid ${process.pid})`;
    // Track the created issue by ref (the URL until the number is parsed) so the
    // `finally` tears it down even if a later step throws — once the issue exists
    // on GitHub the self-clean contract is unconditional.
    let issueRef = null;
    try {
      const created = gh(["issue", "create", "--repo", repo, "--title", title, "--body", "Disposable Factory Nucleus live smoke issue; safe to delete."]);
      assert.equal(created.status, 0, `gh issue create failed: ${created.stderr || created.stdout}`);
      const createdUrl = created.stdout.trim();
      issueRef = createdUrl; // delete by URL even if the number parse below fails
      const issueNumber = Number(createdUrl.match(/\/issues\/(\d+)\b/u)?.[1]);
      assert.ok(Number.isInteger(issueNumber) && issueNumber > 0, `could not parse issue number from gh output: ${createdUrl}`);
      issueRef = String(issueNumber); // prefer the bare number once known

      const viewed = gh(["issue", "view", String(issueNumber), "--repo", repo, "--json", "number,title,state,labels,stateReason"]);
      assert.equal(viewed.status, 0, `gh issue view failed: ${viewed.stderr || viewed.stdout}`);
      const raw = JSON.parse(viewed.stdout);

      // Resolve the live issue through the GitHub adapter and assert the neutral contract.
      const tracker = createGithubTracker({ repo, issues: [normalizeGithubIssue(raw)] });
      const ghost = tracker.getGhost(`#${issueNumber}`);
      assert.ok(ghost, `adapter did not resolve ghost #${issueNumber}`);
      assert.equal(ghost.id, `#${issueNumber}`, "GitHub issue number becomes the #N ghost id");
      assert.equal(ghost.projectId, repo, "the repo is the ghost's project");
      assert.equal(ghost.title, title, "issue title carries to the ghost");
      assert.equal(ghost.state, "backlog", "a fresh open issue with no readiness label maps to backlog");
    } finally {
      if (issueRef) {
        const deleted = gh(["issue", "delete", issueRef, "--repo", repo, "--yes"]);
        if (deleted.status !== 0) {
          // Best-effort cleanup: surface the residue for manual removal.
          console.error(`live GitHub smoke: failed to delete issue ${issueRef} in ${repo}: ${deleted.stderr || deleted.stdout}`);
        }
      }
    }
  },
);

// Linear half of the live smoke is deferred to LOO-83 / FN-46 (transport decision
// pending: API-token client vs MCP agent). It stays SKIPPED unless the Linear
// sandbox is opted in and configured, so a GitHub-only live run never trips it.
test(
  "live Linear smoke (opt-in): disposable-sandbox create -> verify -> delete [deferred to LOO-83]",
  {
    skip: resolveLiveSmokeConfig().linearReady
      ? false
      : `set ${LIVE_SMOKE_ENV.optIn}=1 plus the Linear sandbox env to run the live Linear smoke (deferred to LOO-83)`,
  },
  () => {
    assert.fail("live Linear smoke create -> verify -> delete is deferred to LOO-83 / FN-46; see docs/factory-nucleus/live-smoke.md");
  },
);
