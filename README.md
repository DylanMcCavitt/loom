# oh-my-pi-config

This repo is a single declarative, dry-run-safe nucleus harness for unifying OMP, Codex, and Claude agent configuration. Runtime state stays in `~/.omp`, `~/.codex`, and `~/.claude`; the repo tracks only portable declarative surfaces, plans, validators, fixtures, and documentation.

## Tri-Harness Layers

The intended shape is symmetric: OMP, Codex, and Claude are three layers of the same nucleus, each separated into tracked source, adapter plans, reference material, and local-only runtime state.

- OMP is the present hand-mirrored layer under [`omp/.omp/agent/`](omp/.omp/agent/). It carries repo-facing OMP agent instructions, rules, config, and extensions while runtime state remains outside the repo.
- Codex is plan-stage. [`docs/harness/codex-adapter-plan.md`](docs/harness/codex-adapter-plan.md) defines how the OMP workflow nucleus maps into Codex config templates, custom agents, shared skills, and dry-run-only candidates.
- Claude is also plan-stage, with the adapter plan merged through issue #42 / PR #50. [`docs/harness/claude-adapter-plan.md`](docs/harness/claude-adapter-plan.md) and [`docs/harness/claude-adapter-plan/`](docs/harness/claude-adapter-plan/) define Claude instruction, settings, agent, skill, and symlink candidates without writing live Claude state.

## Dispositions

The canonical source is [`docs/harness/resource-manifest.md`](docs/harness/resource-manifest.md). It uses four dispositions:

- `track`: declarative resources the repo may own directly.
- `adapt`: reusable resources that need an adapter plan or redaction before tracking.
- `reference-only`: surfaces that should be inspected or snapshotted later without treating the live source as repo-owned.
- `local-only`: runtime state, private history, auth/cache data, plugin cache, blobs, terminal state, logs, and databases that must stay out of the repo.

At category level, OMP user/project resources and workflow-kit categories are `track`; OMP built-ins and installed package resources are `reference-only` with snapshots under [`docs/harness/omp-builtins/`](docs/harness/omp-builtins/). Codex config/profile surfaces are `reference-only`, while Codex agents and skill roots are `adapt`. Claude agents, skills, and settings are `adapt`; Claude local settings and runtime state are `local-only`. Cross-harness duplicate skill roots are recorded for later audit rather than normalized here.

## Dry-Run To Apply Model

Every harness change is planned and validated as a dry run before any future live write. The read-only pre-write gate is [`scripts/dry-run-harness-safety-gate.mjs`](scripts/dry-run-harness-safety-gate.mjs), driven by [`docs/harness/dry-run-link-plan.json`](docs/harness/dry-run-link-plan.json) from issue #45.

The gate reports planned OMP, Codex, and Claude candidate paths, generated config destinations, local-only skips, panel/prototype exclusions, duplicate paths, and overwrite risk. It rejects dangerous destinations, local-only write targets, secret-looking values, private home paths in plan data, auth/cache files, runtime databases, sessions, logs, histories, and whole-root Claude skill symlinks.

The apply/render executor is intentionally not implemented yet. This README documents the model and the current dry-run safety boundary; it does not claim a working installer for `~/.omp`, `~/.codex`, `~/.claude`, or repo config.

## Target Directory Layout

- [`omp/.omp/agent/`](omp/.omp/agent/) - tracked OMP mirror layer; declarative agent instructions, rules, config, and extensions; `track`.
- [`docs/harness/`](docs/harness/) - manifest, dry-run link plan, OMP snapshots, Codex plan, and Claude plan; mixed `track`, `adapt`, `reference-only`, and `local-only` documentation by category.
- [`.agents/skills/`](.agents/skills/) - repo-local shared workflow skills with one `SKILL.md` per skill; `adapt`.
- [`scripts/`](scripts/) - validators, refreshers, safety gate, inventory, and benchmark commands; `track`.
- [`tests/`](tests/) - Node `node:test` suites and fixtures covering validators, plans, skills, and gates; `track`.
- [`docs/issues/`](docs/issues/) - issue-shaping and workflow research notes; `reference-only`.
- [`autoresearch.sh`](autoresearch.sh) - full-flow traceability benchmark script; `reference-only`.
- [`.gitignore`](.gitignore) - excludes runtime state, local overlays, common credential files, logs, databases, sessions, blobs, and caches; `track`.

## Validators And Tests

There is no package runner yet; run commands directly from the repo root.

### Scripts

| Area | Command | Purpose |
| --- | --- | --- |
| Manifest | `node scripts/validate-harness-manifest.mjs` | Validates [`docs/harness/resource-manifest.json`](docs/harness/resource-manifest.json), required categories, local-only coverage, and secret/path hygiene in manifest data. |
| Manifest inventory | `node scripts/dry-run-harness-inventory.mjs` | Prints manifest classifications without mutation. |
| Manifest inventory live metadata | `node scripts/dry-run-harness-inventory.mjs --check-live` | Adds path-only live existence metadata without reading private contents. |
| Safety gate | `node scripts/dry-run-harness-safety-gate.mjs` | Runs the offline read-only gate over harness plan data. |
| Safety gate live metadata | `node scripts/dry-run-harness-safety-gate.mjs --check-live` | Adds path metadata and symlink-target checks without modifying live state. |
| OMP snapshot validation | `node scripts/validate-omp-builtins-snapshot.mjs` | Validates snapshotted OMP built-ins, command registry, resources, and portability rows. |
| OMP snapshot live compare | `node scripts/validate-omp-builtins-snapshot.mjs --check-live` | Compares the snapshot against installed OMP metadata. |
| OMP snapshot refresh | `node scripts/refresh-omp-builtins-snapshot.mjs` | Dry-runs an OMP built-ins refresh. |
| OMP snapshot write refresh | `node scripts/refresh-omp-builtins-snapshot.mjs --write` | Regenerates the checked-in OMP snapshot after review. |
| Codex plan | `node scripts/validate-codex-adapter-plan.mjs` | Validates Codex adapter plan data, templates, mappings, and forbidden keys. |
| Claude plan | `node scripts/validate-claude-adapter-plan.mjs` | Validates Claude adapter plan data, templates, mappings, and unsafe surfaces. |
| Skills | `node scripts/validate-skills.mjs` | Validates repo skill shape, frontmatter, naming, and secret-like content. |
| Workflow benchmark | `node scripts/automation-workflow-benchmark.mjs` | Runs the full-flow traceability benchmark; not a dry-run gate. |

### Test Suites

| Area | Command |
| --- | --- |
| Agent recipe skill | `node --test tests/agent-recipes-skill.test.mjs` |
| Automation routing fixtures | `node --test tests/automation-routing.test.mjs` |
| Automation workflow benchmark | `node --test tests/automation-workflow-benchmark.test.mjs` |
| Claude adapter plan | `node --test tests/claude-adapter-plan.test.mjs` |
| Codex adapter plan | `node --test tests/codex-adapter-plan.test.mjs` |
| Execute-plan skill | `node --test tests/execute-plan-skill.test.mjs` |
| Harness manifest | `node --test tests/harness-manifest.test.mjs` |
| Harness safety gate | `node --test tests/harness-safety-gate.test.mjs` |
| Issue autopilot skill | `node --test tests/issue-autopilot-skill.test.mjs` |
| OMP built-ins snapshot | `node --test tests/omp-builtins-snapshot.test.mjs` |
| Skill validation | `node --test tests/skill-validation.test.mjs` |
| Split diff overlay | `node --test tests/split-diff.test.mjs` |
| Thread-control skill | `node --test tests/thread-control-skill.test.mjs` |
| Workflow cockpit panel (excluded/non-nucleus coverage) | `node --test tests/workflow-cockpit.test.mjs` |

## Canonical References

- [`docs/harness/resource-manifest.md`](docs/harness/resource-manifest.md) - resource categories, dispositions, dry-run gate, and checks.
- [`docs/harness/codex-adapter-plan.md`](docs/harness/codex-adapter-plan.md) - Codex adapter maturity, template boundaries, and dry-run strategy.
- [`docs/harness/claude-adapter-plan.md`](docs/harness/claude-adapter-plan.md) - Claude adapter maturity, template boundaries, and dry-run strategy.
- [`docs/harness/omp-builtins/README.md`](docs/harness/omp-builtins/README.md) - OMP built-in snapshot overview.
- [`docs/harness/omp-builtins/portability-matrix.md`](docs/harness/omp-builtins/portability-matrix.md) - OMP command portability classes and runtime boundary.
