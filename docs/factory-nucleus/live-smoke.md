# Factory Nucleus optional live tracker smoke

Factory Nucleus is validated **offline by default**: the dry-run and
adapter-contract evals exercise the Linear and GitHub Issues adapters against
local fixtures, and plan mode never executes anything (fixtures in, inert plans
out). This page designs the **optional, opt-in** live tracker smoke that
exercises the real trackers end to end — and explains why it stays out of the
default checks.

Status: this issue (FN-36) ships the **design + config + a skipped scaffold**.
The live `create → verify → delete` implementation is deferred to a separate
issue; nothing here authenticates, calls a tracker, or creates a live object.

## Why live smoke is outside the default checks

- **Hermetic CI.** `npm run check` must pass with no network and no credentials.
  Live smoke needs real Linear/GitHub auth and writes to live trackers, so it can
  never run in the default path.
- **No live writes in the default lane.** The default coverage is fixture-backed;
  the live smoke is the only lane that mutates a real tracker, so it is gated.
- **Precedent.** This mirrors the existing opt-in live probe
  (`tests/runtime-adapter.test.mjs`, gated by `LOO_OMP_LIVE=1`): skipped by
  default, safe operations only, hard timeouts, explicit teardown.

## Required disposable sandbox targets

Targets are **operator-provided via the environment and never hardcoded** — no
ids, repos, or tokens live in tracked files. Both targets MUST be **disposable**
(throwaway), never a real planning team or a production repo.

| Variable | Role | Notes |
| --- | --- | --- |
| `LOO_LIVE_SMOKE` | Opt-in flag | Live smoke runs only when set to `1`; otherwise skipped. |
| `LOO_LIVE_LINEAR_TEAM` | Disposable Linear team | Sandbox team key/id; never the real planning team. |
| `LOO_LIVE_LINEAR_PROJECT` | Disposable Linear project | Sandbox project under that team. |
| `LINEAR_API_KEY` | Linear auth | Token for the sandbox; from the environment, never tracked. |
| `LOO_LIVE_GITHUB_REPO` | Throwaway GitHub repo | `owner/name`; a disposable sandbox repo, never production. |
| `GITHUB_TOKEN` | GitHub auth | Token for the sandbox repo; from the environment, never tracked. |

`scripts/factory-nucleus/live-smoke.mjs` (`resolveLiveSmokeConfig`) is the
reviewable config reader for these: it is pure (no network), returns the parsed
sandbox identifiers plus token **presence** booleans (never token values), and
lists any missing required variables by name.

## Opt-in invocation

```
LOO_LIVE_SMOKE=1 \
LOO_LIVE_LINEAR_TEAM=<sandbox-team> LOO_LIVE_LINEAR_PROJECT=<sandbox-project> LINEAR_API_KEY=<token> \
LOO_LIVE_GITHUB_REPO=<owner>/<sandbox-repo> GITHUB_TOKEN=<token> \
node --test tests/factory-nucleus-live-smoke.test.mjs
```

Without `LOO_LIVE_SMOKE=1` the live smoke test is **skipped**, so the default
`npm run check` path stays hermetic. If the flag is set but a required variable
is missing, the run fails fast with the exact missing variable names (it never
falls back to a real or "current" tracker).

## Cleanup expectations (self-cleanup per run)

The live smoke **owns and removes everything it creates**:

1. **Create** a disposable ghost in the Linear sandbox project and an issue in
   the GitHub sandbox repo (clearly marked, e.g. a `factory-live-smoke` label and
   a timestamped title).
2. **Verify** each adapter resolves the created object through the
   tracker-neutral contract (identity, state, labels, dependency, the branch/PR
   bridge representation).
3. **Delete** both in a `finally` block so a failed assertion still tears the
   objects down (best-effort on delete failure, logged for manual cleanup). The
   run is idempotent and safe to repeat; it must leave no residue in the sandbox.

Non-goals: no GitHub Projects; live smoke is never the default path; this issue
does not execute live smoke or create live objects.
