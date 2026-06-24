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
// list of missing required variable NAMES (never values), and whether a full run
// is `ready`. Pure: no filesystem, no network, no auth.
export function resolveLiveSmokeConfig(env = process.env) {
  const enabled = env[LIVE_SMOKE_ENV.optIn] === "1";
  const team = env[LIVE_SMOKE_ENV.linearTeam] || null;
  const project = env[LIVE_SMOKE_ENV.linearProject] || null;
  const repo = env[LIVE_SMOKE_ENV.githubRepo] || null;
  const hasLinearToken = Boolean(env[LIVE_SMOKE_ENV.linearToken]);
  const hasGithubToken = Boolean(env[LIVE_SMOKE_ENV.githubToken]);

  // Required for a full run; report absent variables by NAME only.
  const required = [
    [LIVE_SMOKE_ENV.linearTeam, Boolean(team)],
    [LIVE_SMOKE_ENV.linearProject, Boolean(project)],
    [LIVE_SMOKE_ENV.linearToken, hasLinearToken],
    [LIVE_SMOKE_ENV.githubRepo, Boolean(repo)],
    [LIVE_SMOKE_ENV.githubToken, hasGithubToken],
  ];
  const missing = required.filter(([, present]) => !present).map(([name]) => name);

  return {
    enabled,
    linear: team && project ? { team, project } : null,
    github: repo ? { repo } : null,
    hasLinearToken,
    hasGithubToken,
    missing,
    ready: enabled && missing.length === 0,
  };
}
