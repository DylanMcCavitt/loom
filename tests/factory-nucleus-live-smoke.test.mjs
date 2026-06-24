import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";

import { LIVE_SMOKE_ENV, normalizeGithubIssue, normalizeLinearIssue, resolveLiveSmokeConfig } from "../scripts/factory-nucleus/live-smoke.mjs";
import { createGithubTracker } from "../scripts/factory-nucleus/tracker-github.mjs";
import { createLinearTracker } from "../scripts/factory-nucleus/tracker-linear.mjs";
import { GHOST_STATES } from "../scripts/factory-nucleus/tracker.mjs";

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

test("normalizeLinearIssue maps Linear GraphQL JSON onto the Linear adapter shape", () => {
  // Linear GraphQL nests the workflow state under state{name,type}, the project
  // under project{id}, and labels under a labels{nodes{name}} connection; the
  // ghost id is the human identifier (e.g. "SBX-12"), not the internal UUID.
  const raw = {
    identifier: "SBX-12",
    title: "live smoke",
    state: { name: "Todo", type: "unstarted" },
    project: { id: "prj-sbx", name: "Smoke" },
    labels: { nodes: [{ name: "factory-live-smoke" }, { name: "feature" }] },
  };
  assert.deepEqual(normalizeLinearIssue(raw), {
    id: "SBX-12",
    title: "live smoke",
    projectId: "prj-sbx",
    status: "Todo",
    statusType: "unstarted",
    labels: ["factory-live-smoke", "feature"],
  });
  const tracker = createLinearTracker({ projects: [{ id: "prj-sbx", name: "Smoke" }], issues: [normalizeLinearIssue(raw)] });
  const ghost = tracker.getGhost("SBX-12");
  assert.equal(ghost.id, "SBX-12", "Linear identifier becomes the ghost id");
  assert.equal(ghost.projectId, "prj-sbx", "the project is the ghost's project");
  assert.equal(ghost.state, "ready", "unstarted statusType -> ready");
  assert.deepEqual(ghost.labels, ["factory-live-smoke", "feature"]);

  // A completed issue maps to done; an empty label connection yields no labels.
  const done = normalizeLinearIssue({ identifier: "SBX-13", title: "x", project: { id: "prj-sbx" }, state: { name: "Done", type: "completed" }, labels: { nodes: [] } });
  assert.deepEqual(done.labels, []);
  assert.equal(createLinearTracker({ projects: [{ id: "prj-sbx" }], issues: [done] }).getGhost("SBX-13").state, "done");
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

// Opt-in live Linear smoke (FN-46). SKIPPED unless opted in for Linear
// (LOO_LIVE_SMOKE=1 plus a complete Linear sandbox env, i.e.
// resolveLiveSmokeConfig().linearReady), so the default `npm run check` path never
// authenticates or writes to Linear and a GitHub-only opt-in run never trips it.
// Transport (FN-46 decision): a thin Linear GraphQL client over the personal API
// key (LINEAR_API_KEY in the Authorization header RAW, not "Bearer"), called via
// fetch from `node --test` — the test process cannot reach the agent's MCP tools,
// so an automated/CI-runnable smoke needs the token client. Resolves the
// disposable sandbox team/project (LOO_LIVE_LINEAR_TEAM/LOO_LIVE_LINEAR_PROJECT)
// by id, key, or name, creates a throwaway issue, resolves it through the Linear
// adapter, then deletes it in a `finally` so a failed assertion still tears it
// down (best-effort; logs residue). Targets come only from the environment (never
// hardcoded), never the real planning team. See docs/factory-nucleus/live-smoke.md.
test(
  "live Linear smoke (opt-in): disposable-sandbox create -> verify -> delete",
  {
    skip: resolveLiveSmokeConfig().linearReady
      ? false
      : `set ${LIVE_SMOKE_ENV.optIn}=1 plus the Linear sandbox env (${LIVE_SMOKE_ENV.linearTeam} + ${LIVE_SMOKE_ENV.linearProject} + ${LIVE_SMOKE_ENV.linearToken}) to run the live Linear smoke`,
  },
  async () => {
    const config = resolveLiveSmokeConfig();
    const { team: teamRef, project: projectRef } = config.linear;
    const apiKey = process.env[LIVE_SMOKE_ENV.linearToken];

    // Thin Linear GraphQL client: personal API key in the Authorization header
    // RAW (not "Bearer"); hard 30s timeout per request.
    const graphql = async (query, variables) => {
      const res = await fetch("https://api.linear.app/graphql", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: apiKey },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(30000),
      });
      const json = await res.json();
      assert.ok(res.ok && !json.errors, `Linear GraphQL error (${res.status}): ${JSON.stringify(json.errors ?? json)}`);
      return json.data;
    };

    // Resolve the disposable sandbox team + project by id, key, or name.
    const { teams } = await graphql("query { teams(first: 250) { nodes { id key name } } }");
    const team = teams.nodes.find((t) => t.id === teamRef || t.key === teamRef || t.name === teamRef);
    assert.ok(team, `sandbox Linear team not found for ${LIVE_SMOKE_ENV.linearTeam}=${teamRef}`);
    const projectData = await graphql(
      "query($teamId: String!) { team(id: $teamId) { projects(first: 250) { nodes { id name } } } }",
      { teamId: team.id },
    );
    const project = projectData.team.projects.nodes.find((p) => p.id === projectRef || p.name === projectRef);
    assert.ok(project, `sandbox Linear project not found for ${LIVE_SMOKE_ENV.linearProject}=${projectRef}`);

    const title = `factory-live-smoke ${new Date().toISOString()} (pid ${process.pid})`;
    // Track the created issue by its internal UUID so the `finally` deletes it even
    // if a later step throws — once the issue exists in Linear the self-clean
    // contract is unconditional.
    let issueId = null;
    try {
      const created = await graphql(
        "mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier } } }",
        { input: { teamId: team.id, projectId: project.id, title, description: "Disposable Factory Nucleus live smoke issue; safe to delete." } },
      );
      assert.ok(created.issueCreate?.success, "Linear issueCreate did not succeed");
      issueId = created.issueCreate.issue.id;
      const identifier = created.issueCreate.issue.identifier;

      const fetched = await graphql(
        "query($id: String!) { issue(id: $id) { identifier title state { name type } project { id name } labels { nodes { name } } } }",
        { id: issueId },
      );
      const raw = fetched.issue;
      assert.ok(raw, `Linear did not return the created issue ${identifier}`);

      // Resolve the live issue through the Linear adapter and assert the neutral contract.
      const tracker = createLinearTracker({
        projects: [{ id: raw.project.id, name: raw.project.name }],
        issues: [normalizeLinearIssue(raw)],
      });
      const ghost = tracker.getGhost(identifier);
      assert.ok(ghost, `adapter did not resolve ghost ${identifier}`);
      assert.equal(ghost.id, identifier, "Linear issue identifier becomes the ghost id");
      assert.equal(ghost.projectId, project.id, "the sandbox project is the ghost's project");
      assert.equal(ghost.title, title, "issue title carries to the ghost");
      assert.ok(GHOST_STATES.includes(ghost.state), `a fresh live issue maps to a neutral state (got ${ghost.state})`);

      // GitHub-bridge closeout representation resolves for the live ghost id.
      const bridge = tracker.planBridge({ ghostId: identifier, branchPrefix: "dylanmccavitt2015" });
      assert.equal(bridge.closingKeyword, `Closes ${identifier}`, "closeout keyword carries the live issue id");
      assert.ok(bridge.branch.includes(identifier.toLowerCase()), "bridge branch carries the live issue id");
    } finally {
      if (issueId) {
        try {
          // issueDelete trashes the issue (removed from views immediately, auto-
          // purged after Linear's grace period); permanentlyDelete is admin-only,
          // so the default delete is the portable choice for a disposable sandbox.
          const deleted = await graphql("mutation($id: String!) { issueDelete(id: $id) { success } }", { id: issueId });
          if (!deleted.issueDelete?.success) {
            console.error(`live Linear smoke: issueDelete returned not-success for ${issueId}`);
          }
        } catch (err) {
          // Best-effort cleanup: surface the residue for manual removal.
          console.error(`live Linear smoke: failed to delete issue ${issueId}: ${err?.message ?? err}`);
        }
      }
    }
  },
);
