# AGENTS.md

Loom is a curated, harness-agnostic agent skill pack. The repo source of truth is the flat `skills/` tree plus the shared contract in `docs/agent-contract.md`; runtime state, live harness configuration, secrets, and operator-local data stay outside the repo.

## Commands

- `npm run check` - full gate: validators, then unit tests. Run before completing any task that changes the pack.
- `npm run validate` - runs every `scripts/validate-*.mjs` validator.
- `npm run lint` - alias for `npm run validate`.
- `npm test` - unit tests only (`node --test tests/*.test.mjs`).
- `npm run bench` - benchmark harness.
- `npm run loop` - offline loop entrypoint.
- `npm run guard:worktree` - confirms work starts in the intended checkout.
- `npm run install:skills` - interactive or flag-driven installer that links or copies `skills/` into harness skill directories.

Node >= 20, ESM (`type: module`), no external runtime dependencies.

## Layout

- `skills/<name>/` - canonical skill packages. **Edit here in place.**
- `docs/agent-contract.md` - shared agent contract, request modes, lens policy, packet contract, and roster reference.
- `retro/` - retrospectives and packet evidence.
- `template/` - reusable templates for pack consumers.
- `scripts/` - validators and offline repo maintenance commands.
- `tests/` - Node test suites for skills, docs drift, guards, and scripts.

## Agent roster

Use the roster in `docs/agent-contract.md` to resolve the skill, request mode, and lens before acting. The shipped skills are the seven roster agents (`belt`, `biters`, `blueprint`, `lab`, `repair-pack`, `roboports`, `rocket-launch`) plus four utilities (`assembler`, `prospect`, `space-age`, `map-seed`).

## Hard rules

- One issue, one branch/worktree, one PR. Linear is the tracker; use LOO-* issue ids in branches, worktrees, PRs, and commits.
- Never merge PRs or close Linear issues autonomously; launch gates record evidence, and the tracker bridge owns closeout.
- No live-HOME writes from this repo. Do not write `~/.omp`, `~/.codex`, `~/.claude`, `~/.agents`, `~/.cursor`, `~/.factory`, or any real HOME path while working from the repo.
- No secrets, tokens, private home paths, account ids, runtime state, caches, logs, or local-only data in tracked source or plan data.
- Keep skill behavior versions in `skills/<name>/SKILL.md` frontmatter aligned with `docs/skills/skill-versioning.md`.

## Verification

Before finishing: `npm run check` must pass.

## Cursor Cloud specific instructions

- This repo has **zero runtime dependencies** and no build step. `npm ci` is essentially a no-op but keeps things clean; it is the update script.
- There is **no dev server, GUI, database, or container**. "Running the app" means invoking the CLI scripts in `## Commands` and running the test/validate gates — all fully offline and hermetic.
- `npm test` / `npm run check` runs the full Node test suite and takes ~60–90s; do not assume it hung.
- **Evals on cloud VMs:** run from the **loom repo root**. `.cursor/environment.json` installs `agent` and `codex` CLIs on boot and prints an eval-readiness summary; the judge backend comes from the committed `benchmarks/judge/judge.config.json` default (`LOOM_JUDGE_BACKEND` secret overrides; `none` disables). Judge auth persists via Cloud Agents Secrets — `CURSOR_API_KEY` for the `agent` CLI, `CODEX_AUTH_JSON` (base64 of `~/.codex/auth.json`) for codex — so every new thread is eval-ready with no per-thread setup; `npm run bench -- --judge` just works. Full cadence: [`docs/operator/evals.md`](docs/operator/evals.md).
