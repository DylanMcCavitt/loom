# oh-my-pi-config

This repo is a single declarative, dry-run-safe nucleus harness for unifying OMP, Codex, and Claude agent configuration. Runtime state stays in `~/.omp`, `~/.codex`, and `~/.claude`; the repo tracks only portable declarative surfaces, plans, validators, fixtures, and documentation.

## Operator quick start

- Daily project workflow: [`docs/operator/daily-workflow.md`](docs/operator/daily-workflow.md)
- Harness install/update: [`docs/operator/install-update.md`](docs/operator/install-update.md)
- Factory Nucleus architecture: [`docs/architecture/factory-nucleus.md`](docs/architecture/factory-nucleus.md)
- Harness bridge architecture: [`docs/architecture/harness-bridge.md`](docs/architecture/harness-bridge.md)

Useful commands:

```sh
npm run doctor
npm run factory -- scan --root <repo>
npm run factory -- init-envelope --root <repo>
npm run choose-tracker -- --root <repo>
npm run render-nucleus
npm run check
```

## Tri-Harness Layers

The intended shape is symmetric: OMP, Codex, and Claude are three layers of the same nucleus, each separated into tracked source, adapter plans, reference material, and local-only runtime state.

- OMP is the present hand-mirrored layer under [`adapters/omp/source/`](adapters/omp/source/). It carries repo-facing OMP agent instructions, rules, config, and extensions while runtime state remains outside the repo.
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

The gate reports planned OMP, Codex, and Claude candidate paths, generated config destinations, local-only skips, duplicate paths, overwrite risk, and tracked-source hygiene. It rejects dangerous destinations, local-only write targets, secret-looking values, private home paths in plan data or tracked source, auth/cache files, runtime databases, sessions, logs, histories, and whole-root Claude skill symlinks.

The apply/render executor is [`scripts/render-harness-nucleus.mjs`](scripts/render-harness-nucleus.mjs). It is dry-run by default and only writes under an explicit, strict-manual `--write` approval. See [Installing the harness nucleus](#installing-the-harness-nucleus) for the gated flow.

## Installing the harness nucleus

The harness nucleus is installed with a single gated flow built around [`scripts/render-harness-nucleus.mjs`](scripts/render-harness-nucleus.mjs). The dry run is the default; the apply step is opt-in.

1. **Dry-run (default).** Render every candidate into an ephemeral temp dir, run the read-only safety gate over the rendered output, and print the candidate manifest. Nothing is written to live `~/.omp`, `~/.codex`, `~/.claude`, or repo config.

   ```sh
   npm run render-nucleus
   ```

2. **Review.** Read the printed candidate manifest. The `[appliable candidates]` block lists the create-missing-only files `--write` would add; `[reported candidates]` and `[skipped local-only surfaces]` are rendered and validated but never written. Confirm the destinations, dispositions, and that `Result: passed`.

3. **Approve and apply.** Only after reviewing the dry-run output, run the gated apply:

   ```sh
   npm run install-nucleus
   ```

   `install-nucleus` is `render-harness-nucleus.mjs --write`: a strict-manual apply that refuses unless the dry-run render and safety gate pass clean. It is **create-missing-only** (never overwrites an existing non-marker live file), **backed-up** (any kit-owned marker is backed up before it is updated), and **idempotent** (a second run against the applied marker manifest is a clean no-op).

Scope a different live HOME with `--home <dir>` (default `$HOME`); see `node scripts/render-harness-nucleus.mjs --help` for the full option list.

## Target Directory Layout

- [`adapters/omp/source/`](adapters/omp/source/) - tracked OMP mirror layer; declarative agent instructions, rules, config, and extensions; `track`.
- [`docs/operator/`](docs/operator/) - operator-facing daily workflow and install/update flows.
- [`docs/architecture/`](docs/architecture/) - compact architecture maps for Factory Nucleus and the harness bridge.
- [`docs/harness/`](docs/harness/) - manifest, dry-run link plan, OMP snapshots, Codex plan, Claude plan, and plugin bridge details; mixed `track`, `adapt`, `reference-only`, and `local-only` documentation by category.
- [`.agents/skills/`](.agents/skills/) - repo-local shared workflow skills with one `SKILL.md` per skill; `adapt`.
- [`scripts/`](scripts/) - validators, refreshers, safety gate, inventory, benchmark, and doctor commands; `track`.
- [`tests/`](tests/) - Node `node:test` suites and fixtures covering validators, plans, skills, and gates; `track`.
- [`scripts/autoresearch.sh`](scripts/autoresearch.sh) - full-flow traceability benchmark script; `reference-only`.
- [`.gitignore`](.gitignore) - excludes runtime state, local overlays, common credential files, logs, databases, sessions, blobs, and caches; `track`.

## Validators And Tests

Use the package runner from the repo root for the normal offline validation path:

```sh
npm run check
```

### Scripts

| Area | Command | Purpose |
| --- | --- | --- |
| Doctor | `npm run doctor` | Read-only operator status: git state, tracker picker hint, install marker, live-smoke env presence, and key validators. |
| Tracker picker | `npm run choose-tracker -- --root <repo>` | Prints Linear/GitHub Issues binding options without selecting a tracker. |
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
| Automation routing fixtures | `node --test tests/automation-routing.test.mjs` |
| Automation workflow benchmark | `node --test tests/automation-workflow-benchmark.test.mjs` |
| Claude adapter plan | `node --test tests/claude-adapter-plan.test.mjs` |
| Codex adapter plan | `node --test tests/codex-adapter-plan.test.mjs` |
| Execute-plan skill | `node --test tests/execute-plan-skill.test.mjs` |
| Harness manifest | `node --test tests/harness-manifest.test.mjs` |
| Harness safety gate | `node --test tests/harness-safety-gate.test.mjs` |
| Install command | `node --test tests/install-command.test.mjs` |
| OMP built-ins snapshot | `node --test tests/omp-builtins-snapshot.test.mjs` |
| Render harness nucleus | `node --test tests/render-harness-nucleus.test.mjs` |
| Runtime adapter | `node --test tests/runtime-adapter.test.mjs` |
| Runtime adapter extension | `node --test tests/runtime-adapter-extension.test.mjs` |
| Skill validation | `node --test tests/skill-validation.test.mjs` |
| Thread-control skill | `node --test tests/thread-control-skill.test.mjs` |

## Canonical References

- [`docs/harness/resource-manifest.md`](docs/harness/resource-manifest.md) - resource categories, dispositions, dry-run gate, and checks.
- [`docs/harness/codex-adapter-plan.md`](docs/harness/codex-adapter-plan.md) - Codex adapter maturity, template boundaries, and dry-run strategy.
- [`docs/harness/claude-adapter-plan.md`](docs/harness/claude-adapter-plan.md) - Claude adapter maturity, template boundaries, and dry-run strategy.
- [`docs/harness/omp-builtins/README.md`](docs/harness/omp-builtins/README.md) - OMP built-in snapshot overview.
- [`docs/harness/omp-builtins/portability-matrix.md`](docs/harness/omp-builtins/portability-matrix.md) - OMP command portability classes and runtime boundary.
