# AGENTS.md

Loom (oh-my-pi-config) is a declarative, dry-run-safe nucleus harness unifying OMP, Codex, and Claude agent configuration. The repo tracks only portable declarative surfaces; runtime state stays in `~/.omp`, `~/.codex`, `~/.claude` and is never written by default.

## Commands

- `npm run check` - full gate: surviving validators, then unit tests. Run before completing any task.
- `npm test` - unit tests only (`node --test tests/*.test.mjs`)
- `npm run validate` - surviving validators
- `npm run render` - regenerate `.agents/skills/` compatibility output from nucleus source

Node >= 20, ESM (`type: module`), no external runtime dependencies.

## Layout

- `nucleus/` - canonical, model-agnostic source for agents and skills. **Edit here first.**
  - `nucleus/skills/<agent>/` - one Vercel-shaped package per canonical agent (SKILL.md, AGENTS.md, references/ with lens files, exemplars/). Exactly 7 roster agents: `blueprint` (shape), `roboports` (implement), `biters` (review), `lab` (prove), `repair-pack` (repair), `rocket-launch` (launch), `belt` (handoffs). Behavioral variants are lens references selected by the packet `lens` field.
  - `nucleus/utilities/<skill>/` - four repo-owned kit utilities (`assembler`, `prospect`, `space-age`, `map-seed`). Cited engines such as `tdd` and `debug-tools` are operator-local under `~/.agents/skills/` (see `docs/skills/operator-local-manifest.md`).
  - `nucleus/agents/shared-nucleus-agents.md` - shared agent contract: request modes, pipeline DAG, lens policy, packet contract, decision authority
- `.agents/skills/` - rendered compatibility surface generated from `nucleus/skills/` and `nucleus/utilities/` via `node scripts/render-skills-compat.mjs`; edit nucleus source instead.
- `scripts/` - validators, renderers, and offline repo maintenance commands.

## Agent roster

When work matches a canonical agent role (see the roster table in `nucleus/agents/shared-nucleus-agents.md`), load that agent's package from `nucleus/skills/<agent>/` and follow its mode boundaries. Resolve request mode (`shape`, `implement`, `review`, `prove`, `repair`, `launch`) and lens before acting; when the packet names a lens, load only that lens reference.

## Hard rules

- No live writes to `~/.omp`, `~/.codex`, `~/.claude`, or real HOME from this repo; any live-HOME change is an operator action with human approval.
- `local-only` surfaces (auth, sessions, histories, caches, DBs, logs) must never be read into the repo or committed.
- No secrets, private home paths, or runtime state in tracked source or plan data.
- One issue, one branch/worktree, one PR. Linear is the tracker (LOO-* issues); prefix commits with the issue id, e.g. `LOO-151: ...`.
- Never merge PRs or close Linear issues autonomously; launch gates record evidence, the tracker bridge owns closeout.
- Generated compatibility skill output is derived from nucleus source at render time; fix the source, then re-render.

## Verification

Before finishing: `npm run check` must pass. For nucleus skill changes also confirm `npm run render` succeeds.

## Cursor Cloud specific instructions

- This repo has **zero runtime dependencies** and no build step. `npm ci` is essentially a no-op but keeps things clean; it is the update script.
- There is **no dev server, GUI, database, or container**. "Running the app" means invoking the CLI scripts in `## Commands` and running the test/validate gates — all fully offline and hermetic.
- `npm test` / `npm run check` runs the full Node test suite and takes ~60–90s; do not assume it hung.
- The environment ships Node 22, which satisfies the `>=20` engine requirement even though `.nvmrc` pins `20`.
