// Opt-in live tracker smoke configuration for Factory Nucleus (FN-36).
//
// Live Linear/GitHub smoke tests are OUTSIDE the default checks: they require
// real auth and write to live trackers, so the default `npm run check` stays
// hermetic and offline (the dry-run and adapter-contract evals are the default
// coverage). This module is the reviewable *config* layer for the optional live
// smoke — it is pure (no network, no auth): it reads the opt-in flag and the
// operator-provided disposable sandbox targets from the environment and reports
// what is configured and what is missing. It never performs a live call and
// never returns secret token VALUES (only presence booleans), so it is safe to
// log. The live create -> verify -> delete steps are designed in
// docs/factory-nucleus/live-smoke.md and implemented in a separate issue.

// Environment variables that gate and target the optional live smoke. Sandbox
// identifiers are operator-provided and disposable; nothing here is hardcoded.
export const LIVE_SMOKE_ENV = Object.freeze({
  optIn: "LOO_LIVE_SMOKE",
  linearTeam: "LOO_LIVE_LINEAR_TEAM",
  linearProject: "LOO_LIVE_LINEAR_PROJECT",
  linearToken: "LINEAR_API_KEY",
  githubRepo: "LOO_LIVE_GITHUB_REPO",
  githubToken: "GITHUB_TOKEN",
});

// Resolve the live-smoke config from an environment map (defaults to process.env).
// Returns sandbox identifiers (not secrets) plus token *presence* booleans, the
// list of missing required variable NAMES (never values), and readiness flags:
// `githubReady`/`linearReady` per adapter and `ready` (both). Pure: no
// filesystem, no network, no auth.
export function resolveLiveSmokeConfig(env = process.env) {
  const enabled = env[LIVE_SMOKE_ENV.optIn] === "1";
  const team = env[LIVE_SMOKE_ENV.linearTeam] || null;
  const project = env[LIVE_SMOKE_ENV.linearProject] || null;
  const repo = env[LIVE_SMOKE_ENV.githubRepo] || null;
  const hasLinearToken = Boolean(env[LIVE_SMOKE_ENV.linearToken]);
  const hasGithubToken = Boolean(env[LIVE_SMOKE_ENV.githubToken]);

  // Per-adapter required variables; report absent ones by NAME only. Readiness is
  // reported per adapter (`githubReady`/`linearReady`) so each live smoke gates on
  // its own transport: the GitHub smoke opts in on `LOO_LIVE_SMOKE=1` and fails
  // fast when its own sandbox vars are missing, independent of Linear's config.
  const linearRequired = [
    [LIVE_SMOKE_ENV.linearTeam, Boolean(team)],
    [LIVE_SMOKE_ENV.linearProject, Boolean(project)],
    [LIVE_SMOKE_ENV.linearToken, hasLinearToken],
  ];
  const githubRequired = [
    [LIVE_SMOKE_ENV.githubRepo, Boolean(repo)],
    [LIVE_SMOKE_ENV.githubToken, hasGithubToken],
  ];
  const linearMissing = linearRequired.filter(([, present]) => !present).map(([name]) => name);
  const githubMissing = githubRequired.filter(([, present]) => !present).map(([name]) => name);
  const linearReady = enabled && linearMissing.length === 0;
  const githubReady = enabled && githubMissing.length === 0;

  return {
    enabled,
    linear: team && project ? { team, project } : null,
    github: repo ? { repo } : null,
    hasLinearToken,
    hasGithubToken,
    linearMissing,
    githubMissing,
    missing: [...linearMissing, ...githubMissing],
    linearReady,
    githubReady,
    ready: linearReady && githubReady,
  };
}

// Normalize a `gh issue view --json number,title,state,labels,stateReason`
// payload into the GitHub adapter's fixture issue shape
// (scripts/factory-nucleus/tracker-github.mjs). The gh CLI returns an uppercase
// state/stateReason (e.g. "OPEN"/"CLOSED"/"NOT_PLANNED") and label objects,
// whereas the adapter expects REST-style lowercase state and string labels; this
// bridges the live `gh` shape to the adapter contract. Pure: no network.
export function normalizeGithubIssue(raw = {}) {
  const labels = (raw.labels ?? [])
    .map((label) => (typeof label === "string" ? label : label?.name))
    .filter((name) => name != null);
  const issue = {
    number: raw.number,
    title: raw.title,
    state: raw.state ? String(raw.state).toLowerCase() : raw.state,
    labels,
  };
  if (raw.stateReason != null) issue.stateReason = String(raw.stateReason).toLowerCase();
  return issue;
}
