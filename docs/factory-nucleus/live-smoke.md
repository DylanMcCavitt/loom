# Factory Nucleus optional live tracker smoke

Factory Nucleus is validated **offline by default**: the dry-run and
adapter-contract evals exercise the Linear and GitHub Issues adapters against
local fixtures, and plan mode never executes anything (fixtures in, inert plans
out). This page designs the **optional, opt-in** live tracker smoke that
exercises the real trackers end to end — and explains why it stays out of the
default checks.

Status: FN-36 shipped the **design + config + a skipped scaffold**. FN-45 ships
the **running GitHub Issues smoke** (`gh`-backed, opt-in, self-cleaning). FN-46
ships the **running Linear smoke** (Linear GraphQL client over `LINEAR_API_KEY`,
opt-in, self-cleaning) — see the transport decision below. Both halves gate
independently via `resolveLiveSmokeConfig` (`githubReady` / `linearReady`), so a
default `npm run check` skips both and a single-adapter opt-in run runs only its
half.

## Transport decision (FN-46): Linear GraphQL client over a personal API key

The running Linear smoke talks to Linear over its **GraphQL API**
(`POST https://api.linear.app/graphql`) with a personal API key in the
`Authorization` header **raw** (not `Bearer`), called via Node's built-in `fetch`
directly from `node --test`. The alternative — driving the live writes through the
agent's Linear **MCP** tools — was **rejected**: the `node --test` process is a
plain Node process with no access to the agent harness's MCP tools, so an
automated, CI-runnable smoke (FN-47 dispatches it) must be self-contained. The
GraphQL loop is `issueCreate` → `issue(id)` → `issueDelete`; the sandbox
team/project are resolved from `LOO_LIVE_LINEAR_TEAM` / `LOO_LIVE_LINEAR_PROJECT`
by id, key, or name. This mirrors the FN-45 GitHub half (a self-contained client
inside the test — `gh` there, `fetch` GraphQL here), keeping all network code out
of the pure `resolveLiveSmokeConfig` module (`scripts/factory-nucleus/live-smoke.mjs`);
only the pure GraphQL→adapter normalizer `normalizeLinearIssue` lives there.

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

Either half can run alone with only its own sandbox env. GitHub only (`gh` reads
`GITHUB_TOKEN` from the environment; the Linear half skips):

```
LOO_LIVE_SMOKE=1 LOO_LIVE_GITHUB_REPO=<owner>/<sandbox-repo> GITHUB_TOKEN="$(gh auth token)" \
node --test tests/factory-nucleus-live-smoke.test.mjs
```

Linear only (the GitHub half is skipped/fails fast — see gating below):

```
LOO_LIVE_SMOKE=1 \
LOO_LIVE_LINEAR_TEAM=<sandbox-team> LOO_LIVE_LINEAR_PROJECT=<sandbox-project> LINEAR_API_KEY=<token> \
node --test tests/factory-nucleus-live-smoke.test.mjs
```

Without `LOO_LIVE_SMOKE=1` both live tests are **skipped**, so the default
`npm run check` path stays hermetic. Per-adapter gating differs by design: the
**Linear** test gates on `linearReady` — it runs only when opted in *and* the full
Linear sandbox env is present, and otherwise **skips** (so a GitHub-only opt-in run
never trips it). The **GitHub** test gates on the opt-in flag and then **fails
fast** naming any missing GitHub variable (it never falls back to a real or
"current" repo), so a Linear-only opt-in run will report the absent GitHub vars.

## Cleanup expectations (self-cleanup per run)

The live smoke **owns and removes everything it creates**:

1. **Create** a disposable ghost in the Linear sandbox project and an issue in
   the GitHub sandbox repo, each clearly marked by a timestamped
   `factory-live-smoke` title and a "safe to delete" body.
2. **Verify** each adapter resolves the created object through the
   tracker-neutral contract (identity, state, labels, dependency, the branch/PR
   bridge representation).
3. **Delete** both in a `finally` block so a failed assertion still tears the
   objects down (best-effort on delete failure, logged for manual cleanup). The
   run is idempotent and safe to repeat; it must leave no residue in the sandbox.
   The Linear half uses `issueDelete`, which trashes the issue (removed from views
   immediately and auto-purged after Linear's grace period; `permanentlyDelete` is
   admin-only, so the default delete stays portable for any sandbox key).

Non-goals: no GitHub Projects; live smoke is never the default path and never
targets a real planning team or production repo.
