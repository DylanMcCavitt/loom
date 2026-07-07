# Loom

Loom is a cross-harness agent pack: seven roster agents plus kit utilities shipped as portable Agent-Skills-shaped packages, with validators, a dry-run-gated installer, and drift radar. It is for operators running OMP, Codex, or Claude Code-class coding agents who want one repo-owned workflow nucleus without copying private runtime state.

## Install per harness

**Universal skill path (all harnesses).** Repo skills live under [`.agents/skills/`](.agents/skills/), rendered from [`nucleus/skills/`](nucleus/skills/) and [`nucleus/utilities/`](nucleus/utilities/) via `npm run render`. Symlink or copy one directory per skill into your harness skill root:

```sh
ln -s "$(pwd)/.agents/skills/blueprint" ~/.agents/skills/blueprint
```

Harness-specific roots also work: `~/.codex/skills/<name>/`, `~/.claude/skills/<name>/`, or project-local `.agents/skills/<name>/`.

**OMP surfaces (gated).** Dry-run render and safety gate first; apply only after review:

```sh
npm run render-nucleus
npm run install-nucleus
```

`install-nucleus` is `node scripts/render-nucleus.mjs --write`: create-missing-only, marker-tracked, backed up. See [`docs/operator/install-update.md`](docs/operator/install-update.md).

**Codex / Claude plugin route (gated).** The `loom-nucleus` bridge renders dual Codex/Claude plugin manifests plus OMP skill candidates and shared-agent packages. Dry-run, then apply:

```sh
node scripts/render-plugin-bridge.mjs
node scripts/render-plugin-bridge.mjs --write
```

This writes only `~/.agents/plugins/marketplace.json` and `~/.agents/plugins/loom-nucleus/**` (not provider auth, caches, or profiles). After apply, enable in Codex with `codex plugin add loom-nucleus@loom-nucleus-plugins`. Claude plugin enablement is a separate harness step. Repo reference catalog: [`distributions/loom-nucleus/.claude-plugin/marketplace.json`](distributions/loom-nucleus/.claude-plugin/marketplace.json) (`source` is repo-relative; live install uses the rendered HOME paths above).

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
| OMP | `~/.agents/skills/` (shared); repo [`.agents/skills/`](.agents/skills/) | Per-skill symlink; `npm run render-nucleus` → `npm run install-nucleus` for adapter mirrors | OMP mirrors + rendered skills effective; gated apply for live `~/.omp` |
| Codex | `~/.codex/skills/`, `~/.agents/skills/` | Per-skill symlink; `node scripts/render-plugin-bridge.mjs --write` then `codex plugin add loom-nucleus@loom-nucleus-plugins` | Plugin bridge + marketplace apply gated; config/profile fragments planned |
| Claude Code | `~/.claude/skills/`, `~/.agents/skills/` | Per-skill symlink; `node scripts/render-plugin-bridge.mjs --write` then harness plugin enable | Plugin bridge apply gated; instruction/settings candidates planned |

## Glossary

| Term | Meaning |
| --- | --- |
| Loom | This repo and the cross-harness agent pack it ships |
| nucleus | Canonical source under [`nucleus/`](nucleus/) (agents, skills, utilities, schemas) |
| adapters | Harness translators under [`adapters/`](adapters/) (OMP, Codex, Claude, plugin-bridge) |
| distributions | Generated, checkable output under [`distributions/`](distributions/) |
| loom-nucleus | Plugin distribution bridging Codex/Claude marketplace surfaces |
| Factory Nucleus | Envelope and tracker subsystem (`npm run factory`, `~/.loom/`) |

## Validators and tests

```sh
npm run check
```

### Validators

| Area | Command | Purpose |
| --- | --- | --- |
| Check (all) | `npm run check` | Runs `npm run validate` then the full test suite |
| Doctor | `npm run doctor` | Read-only operator status: git, tracker hint, install marker, key validators |
| Manifest | `node scripts/validate-harness-manifest.mjs` | Resource manifest categories, dispositions, and hygiene |
| Manifest inventory | `node scripts/dry-run-harness-inventory.mjs` | Manifest classifications without mutation |
| Safety gate | `node scripts/dry-run-harness-safety-gate.mjs` | Offline read-only gate over harness plan data |
| OMP snapshot | `node scripts/validate-omp-builtins-snapshot.mjs` | Snapshotted OMP built-ins and portability rows |
| OMP snapshot drift | `node scripts/radar-snapshot-drift.mjs` | Advisory OMP package version vs npm `latest` (always exits 0) |
| Codex plan | `node scripts/validate-codex-adapter-plan.mjs` | Codex adapter plan templates and mappings |
| Claude plan | `node scripts/validate-claude-adapter-plan.mjs` | Claude adapter plan templates and unsafe surfaces |
| Skills | `node scripts/validate-skills.mjs` | Skill shape, frontmatter, naming, secret-like content |
| Skills compat render | `npm run render` | Regenerates `.agents/skills/` from nucleus after edits |
| Shared agents | `node scripts/validate-shared-agent-contract.mjs` | Shared nucleus agent contract |
| Shared agent packages | `node scripts/validate-shared-agent-packages.mjs` | Vercel-shaped per-agent packages |
| Factory Nucleus | `node scripts/validate-factory-nucleus-schemas.mjs` (+ docs, dry-run, evals validators) | Envelope schemas, docs, and eval guards |
| Docs drift | `node scripts/validate-nucleus-docs-drift.mjs` | README identity, command docs, roster, and table sync |
| Render nucleus | `npm run render-nucleus` | Dry-run OMP/Codex/Claude adapter render + safety gate |
| Install nucleus | `npm run install-nucleus` | Gated apply for reviewed nucleus candidates |
| Plugin bridge | `node scripts/render-plugin-bridge.mjs` | Dry-run `loom-nucleus` plugin/marketplace render + gate |

### Test Suites

| Area | Command |
| --- | --- |
| Assembler skill | `node --test tests/assembler-skill.test.mjs` |
| Benchmarks | `node --test tests/benchmarks-bench.test.mjs` |
| Biters skill | `node --test tests/biters-skill.test.mjs` |
| Blueprint skill | `node --test tests/blueprint-skill.test.mjs` |
| Claude adapter plan | `node --test tests/claude-adapter-plan.test.mjs` |
| Codex adapter plan | `node --test tests/codex-adapter-plan.test.mjs` |
| Factorio kit golden path | `node --test tests/factorio-kit-goldenpath.test.mjs` |
| Factory Nucleus adapter contract | `node --test tests/factory-nucleus-adapter-contract.test.mjs` |
| Factory Nucleus dry run | `node --test tests/factory-nucleus-dry-run.test.mjs` |
| Factory Nucleus envelope | `node --test tests/factory-nucleus-envelope.test.mjs` |
| Factory Nucleus golden factory | `node --test tests/factory-nucleus-golden-factory.test.mjs` |
| Factory Nucleus JSON | `node --test tests/factory-nucleus-json.test.mjs` |
| Factory Nucleus live smoke CI | `node --test tests/factory-nucleus-live-smoke-ci.test.mjs` |
| Factory Nucleus live smoke | `node --test tests/factory-nucleus-live-smoke.test.mjs` |
| Factory Nucleus prune | `node --test tests/factory-nucleus-prune.test.mjs` |
| Factory Nucleus radar | `node --test tests/factory-nucleus-radar.test.mjs` |
| Factory Nucleus recipe | `node --test tests/factory-nucleus-recipe.test.mjs` |
| Factory Nucleus run | `node --test tests/factory-nucleus-run.test.mjs` |
| Factory Nucleus scan | `node --test tests/factory-nucleus-scan.test.mjs` |
| Factory Nucleus schema evals | `node --test tests/factory-nucleus-schema-evals.test.mjs` |
| Factory Nucleus schema | `node --test tests/factory-nucleus-schema.test.mjs` |
| Factory Nucleus science | `node --test tests/factory-nucleus-science.test.mjs` |
| Factory Nucleus tracker GitHub | `node --test tests/factory-nucleus-tracker-github.test.mjs` |
| Factory Nucleus tracker Linear | `node --test tests/factory-nucleus-tracker-linear.test.mjs` |
| Factory Nucleus tracker picker | `node --test tests/factory-nucleus-tracker-picker.test.mjs` |
| Factory Nucleus tracker | `node --test tests/factory-nucleus-tracker.test.mjs` |
| Harness manifest | `node --test tests/harness-manifest.test.mjs` |
| Harness safety gate | `node --test tests/harness-safety-gate.test.mjs` |
| Install command | `node --test tests/install-command.test.mjs` |
| Loop entrypoint | `node --test tests/loop-entrypoint.test.mjs` |
| Map seed skill | `node --test tests/map-seed-skill.test.mjs` |
| Nucleus docs drift | `node --test tests/nucleus-docs-drift.test.mjs` |
| OMP built-ins snapshot portability | `node --test tests/omp-builtins-snapshot-portability.test.mjs` |
| OMP built-ins snapshot | `node --test tests/omp-builtins-snapshot.test.mjs` |
| OMP contracts | `node --test tests/omp-contracts.test.mjs` |
| Plugin bridge | `node --test tests/plugin-bridge.test.mjs` |
| Prospect skill | `node --test tests/prospect-skill.test.mjs` |
| Render harness nucleus | `node --test tests/render-harness-nucleus.test.mjs` |
| Roboports skill | `node --test tests/roboports-skill.test.mjs` |
| Rocket launch skill | `node --test tests/rocket-launch-skill.test.mjs` |
| Retro packet | `node --test tests/retro-packet.test.mjs` |
| Runtime adapter extension | `node --test tests/runtime-adapter-extension.test.mjs` |
| Runtime adapter | `node --test tests/runtime-adapter.test.mjs` |
| Shared agent contract validator | `node --test tests/shared-agent-contract-validator.test.mjs` |
| Shared agent evals | `node --test tests/shared-agent-evals.test.mjs` |
| Shared agent package validation | `node --test tests/shared-agent-package-validation.test.mjs` |
| Shared nucleus agents | `node --test tests/shared-nucleus-agents.test.mjs` |
| Skill validation | `node --test tests/skill-validation.test.mjs` |
| Space age skill | `node --test tests/space-age-skill.test.mjs` |
| Worktree guard | `node --test tests/worktree-guard.test.mjs` |

## Links

**Operator runbooks:** [`docs/operator/daily-workflow.md`](docs/operator/daily-workflow.md) · [`docs/operator/loop.md`](docs/operator/loop.md) · [`docs/operator/install-update.md`](docs/operator/install-update.md) · [`docs/operator/envelope-bootstrap.md`](docs/operator/envelope-bootstrap.md)

**Architecture:** [`docs/architecture/factory-nucleus.md`](docs/architecture/factory-nucleus.md) · [`docs/architecture/harness-bridge.md`](docs/architecture/harness-bridge.md)

**Governance (sibling PR):** [`LICENSE`](LICENSE) · [`SECURITY.md`](SECURITY.md) · [`template/`](template/)
