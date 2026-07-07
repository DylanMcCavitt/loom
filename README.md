# Loom

Loom is a cross-harness agent pack: seven roster agents plus kit utilities shipped as portable Agent-Skills-shaped packages, with validators and offline tests. It is for operators running OMP, Codex, or Claude Code-class coding agents who want one repo-owned workflow nucleus without copying private runtime state.

## Install per harness

**Universal skill path (all harnesses).** Repo skills live under [`.agents/skills/`](.agents/skills/), rendered from [`nucleus/skills/`](nucleus/skills/) and [`nucleus/utilities/`](nucleus/utilities/) via `npm run render`. Symlink or copy one directory per skill into your harness skill root:

```sh
ln -s "$(pwd)/.agents/skills/blueprint" ~/.agents/skills/blueprint
```

Harness-specific roots also work: `~/.codex/skills/<name>/`, `~/.claude/skills/<name>/`, or project-local `.agents/skills/<name>/`.


## Try one skill in 5 minutes

```sh
git clone https://github.com/DylanMcCavitt/loom.git && cd loom
npm run check
ln -s "$(pwd)/.agents/skills/blueprint" ~/.agents/skills/blueprint
```

Invoke the `blueprint` skill in your harness (shape/spec work). Roster agents: `belt`, `biters`, `blueprint`, `lab`, `repair-pack`, `roboports`, `rocket-launch`. Kit utilities: `assembler`, `prospect`, `space-age`, `map-seed`.

## Harness matrix

| Harness | Skill root | Install route | Status |
| --- | --- | --- | --- |
| OMP | `~/.agents/skills/` (shared); repo [`.agents/skills/`](.agents/skills/) | Per-skill symlink or copy from the rendered compatibility surface | Rendered skills effective in shared skill roots |
| Codex | `~/.codex/skills/`, `~/.agents/skills/` | Per-skill symlink or copy from [`.agents/skills/`](.agents/skills/) | Skills available through skill roots |
| Claude Code | `~/.claude/skills/`, `~/.agents/skills/` | Per-skill symlink or copy from [`.agents/skills/`](.agents/skills/) | Skills available through skill roots |

## Glossary

| Term | Meaning |
| --- | --- |
| Loom | This repo and the cross-harness agent pack it ships |
| nucleus | Canonical source under [`nucleus/`](nucleus/) (agents, skills, utilities, schemas) |

## Validators and tests

```sh
npm run check
```

### Validators

| Area | Command | Purpose |
| --- | --- | --- |
| Check (all) | `npm run check` | Runs `npm run validate` then the full test suite |
| Validate | `npm run validate` | Runs surviving `scripts/validate-*.mjs` validators |
| Test | `npm test` | Runs the full Node test suite |
| Bench | `npm run bench` | Runs the benchmark harness |
| Worktree guard | `npm run guard:worktree` | Confirms agent work starts in the intended checkout |
| Render skills compat | `npm run render` | Regenerates `.agents/skills/` from nucleus after edits |
| Loop | `npm run loop` | Runs the operator loop entrypoint |
| Skills | `node scripts/validate-skills.mjs` | Skill shape, frontmatter, naming, secret-like content |
| Docs drift | `node scripts/validate-nucleus-docs-drift.mjs` | README identity, command docs, roster, and table sync |

### Test Suites

| Area | Command |
| --- | --- |
| Assembler skill | `node --test tests/assembler-skill.test.mjs` |
| Benchmarks | `node --test tests/benchmarks-bench.test.mjs` |
| Biters skill | `node --test tests/biters-skill.test.mjs` |
| Blueprint skill | `node --test tests/blueprint-skill.test.mjs` |
| Factorio kit golden path | `node --test tests/factorio-kit-goldenpath.test.mjs` |
| Loop entrypoint | `node --test tests/loop-entrypoint.test.mjs` |
| Map seed skill | `node --test tests/map-seed-skill.test.mjs` |
| Nucleus docs drift | `node --test tests/nucleus-docs-drift.test.mjs` |
| Prospect skill | `node --test tests/prospect-skill.test.mjs` |
| Roboports skill | `node --test tests/roboports-skill.test.mjs` |
| Rocket launch skill | `node --test tests/rocket-launch-skill.test.mjs` |
| Retro packet | `node --test tests/retro-packet.test.mjs` |
| Skill validation | `node --test tests/skill-validation.test.mjs` |
| Space age skill | `node --test tests/space-age-skill.test.mjs` |
| Worktree guard | `node --test tests/worktree-guard.test.mjs` |

## Links

**Operator runbooks:** [`docs/operator/daily-workflow.md`](docs/operator/daily-workflow.md) · [`docs/operator/loop.md`](docs/operator/loop.md)

**Governance (sibling PR):** [`LICENSE`](LICENSE) · [`SECURITY.md`](SECURITY.md) · [`template/`](template/)
