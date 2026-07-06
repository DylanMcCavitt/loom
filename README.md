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

The intended shape is symmetric: OMP, Codex, and Claude are three layers of the same nucleus, each separated into canonical source, harness adapters, generated/checkable distributions, reference material, and local-only runtime state.

- OMP tracked source lives under [`adapters/omp/source/`](adapters/omp/source/). It carries repo-facing OMP agent instructions, rules, config, and extensions while runtime state remains outside the repo.
- Codex has live plugin surfaces through the `loom-nucleus` bridge and dry-run config/profile adapter candidates. [`docs/harness/codex-adapter-plan.md`](docs/harness/codex-adapter-plan.md) defines how the shared nucleus maps into Codex config templates, shared skills, and dry-run-only candidates.
- Claude has the same live plugin package surface plus dry-run instruction/settings/agent/skill adapter candidates. [`docs/harness/claude-adapter-plan.md`](docs/harness/claude-adapter-plan.md) and [`docs/harness/claude-adapter-plan/`](docs/harness/claude-adapter-plan/) define Claude candidates without writing live Claude state.

## Dispositions

The canonical source is [`docs/harness/resource-manifest.md`](docs/harness/resource-manifest.md). It uses four dispositions:

- `track`: declarative resources the repo may own directly.
- `adapt`: reusable resources that need an adapter plan or redaction before tracking.
- `reference-only`: surfaces that should be inspected or snapshotted later without treating the live source as repo-owned.
- `local-only`: runtime state, private history, auth/cache data, plugin cache, blobs, terminal state, logs, and databases that must stay out of the repo.

At category level, OMP user/project resources and workflow-kit categories are `track`; OMP built-ins and installed package resources are `reference-only` with snapshots under [`distributions/snapshots/omp-builtins/`](distributions/snapshots/omp-builtins/). Codex and Claude adapter candidates are `adapt` or `reference-only` as marked in the manifest; plugin caches and runtime state stay `local-only`. Cross-harness duplicate skill roots are recorded for later audit rather than normalized here.

## Dry-Run To Apply Model

Every harness change is planned and validated as a dry run before any future live write. The read-only pre-write gate is [`scripts/dry-run-harness-safety-gate.mjs`](scripts/dry-run-harness-safety-gate.mjs), driven by [`docs/harness/dry-run-link-plan.json`](docs/harness/dry-run-link-plan.json) from issue #45.

The gate reports planned OMP, Codex, and Claude candidate paths, generated config destinations, local-only skips, duplicate paths, overwrite risk, and tracked-source hygiene. It rejects dangerous destinations, local-only write targets, secret-looking values, private home paths in plan data or tracked source, auth/cache files, runtime databases, sessions, logs, histories, and whole-root Claude skill symlinks.

The apply/render executor is [`scripts/render-nucleus.mjs`](scripts/render-nucleus.mjs). It is dry-run by default and only writes under an explicit, strict-manual `--write` approval. See [Installing the harness nucleus](#installing-the-harness-nucleus) for the gated flow.

## Installing the harness nucleus

The harness nucleus is installed with a single gated flow built around [`scripts/render-nucleus.mjs`](scripts/render-nucleus.mjs). The dry run is the default; the apply step is opt-in.

1. **Dry-run (default).** Render every candidate into an ephemeral temp dir, run the read-only safety gate over the rendered output, and print the candidate manifest. Nothing is written to live `~/.omp`, `~/.codex`, `~/.claude`, or repo config.

   ```sh
   npm run render-nucleus
   ```

2. **Review.** Read the printed candidate manifest. The `[appliable candidates]` block lists the create-missing-only files `--write` would add; `[reported candidates]` and `[skipped local-only surfaces]` are rendered and validated but never written. Confirm the destinations, dispositions, and that `Result: passed`.

3. **Approve and apply.** Only after reviewing the dry-run output, run the gated apply:

   ```sh
   npm run install-nucleus
   ```

   `install-nucleus` is `render-nucleus.mjs --write`: a strict-manual apply that refuses unless the dry-run render and safety gate pass clean. It is **create-missing-only** (never overwrites an existing non-marker live file), **backed-up** (any kit-owned marker is backed up before it is updated), and **idempotent** (a second run against the applied marker manifest is a clean no-op).

Scope a different live HOME with `--home <dir>` (default `$HOME`); see `node scripts/render-nucleus.mjs --help` for the full option list.

## Target Directory Layout

- [`nucleus/`](nucleus/) - model-agnostic canonical source for agents, skills, rules, workflows, and schemas; `track`.
- [`adapters/`](adapters/) - harness-specific source, templates, and renderer entrypoints; `track` / `adapt` by manifest row.
- [`distributions/`](distributions/) - generated/checkable output, including `loom-nucleus` plugin output and OMP reference snapshots.
- [`docs/operator/`](docs/operator/) - operator-facing daily workflow and install/update flows.
- [`docs/architecture/`](docs/architecture/) - compact architecture maps for Factory Nucleus and the harness bridge.
- [`docs/harness/`](docs/harness/) - manifests, adapter plans, and bridge/reference context only; no active source templates or generated payloads.
- [`.agents/skills/`](.agents/skills/) - rendered compatibility surface generated from `nucleus/skills/` and `nucleus/utilities/`; edit nucleus source first.
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
| OMP snapshot drift radar | `node scripts/radar-snapshot-drift.mjs` | Advisory check: compares the pinned OMP package version in the snapshot against npm `latest` (always exits 0). |
| Codex plan | `node scripts/validate-codex-adapter-plan.mjs` | Validates Codex adapter plan data, templates, mappings, and forbidden keys. |
| Claude plan | `node scripts/validate-claude-adapter-plan.mjs` | Validates Claude adapter plan data, templates, mappings, and unsafe surfaces. |
| Skills | `node scripts/validate-skills.mjs` | Validates repo skill shape, frontmatter, naming, and secret-like content. |
| Skills compat render | `npm run render` | Regenerates `.agents/skills/` from `nucleus/skills/` and `nucleus/utilities/` after nucleus edits. |
| Docs drift | `node scripts/validate-nucleus-docs-drift.mjs` | Guards README/operator commands, stale active-path claims, and the Factorio kit roster. |

### Test Suites

| Area | Command |
| --- | --- |
| Assembler skill | `node --test tests/assembler-skill.test.mjs` |
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
| Map seed skill | `node --test tests/map-seed-skill.test.mjs` |
| Nucleus docs drift | `node --test tests/nucleus-docs-drift.test.mjs` |
| OMP built-ins snapshot | `node --test tests/omp-builtins-snapshot.test.mjs` |
| OMP contracts | `node --test tests/omp-contracts.test.mjs` |
| Plugin bridge | `node --test tests/plugin-bridge.test.mjs` |
| Prospect skill | `node --test tests/prospect-skill.test.mjs` |
| Render harness nucleus | `node --test tests/render-harness-nucleus.test.mjs` |
| Roboports skill | `node --test tests/roboports-skill.test.mjs` |
| Rocket launch skill | `node --test tests/rocket-launch-skill.test.mjs` |
| Runtime adapter | `node --test tests/runtime-adapter.test.mjs` |
| Runtime adapter extension | `node --test tests/runtime-adapter-extension.test.mjs` |
| Shared-agent contract validator | `node --test tests/shared-agent-contract-validator.test.mjs` |
| Shared-agent evals | `node --test tests/shared-agent-evals.test.mjs` |
| Shared-agent package validation | `node --test tests/shared-agent-package-validation.test.mjs` |
| Shared nucleus agents | `node --test tests/shared-nucleus-agents.test.mjs` |
| Skill validation | `node --test tests/skill-validation.test.mjs` |
| Space age skill | `node --test tests/space-age-skill.test.mjs` |


## Canonical References

- [`docs/harness/resource-manifest.md`](docs/harness/resource-manifest.md) - resource categories, dispositions, dry-run gate, and checks.
- [`docs/harness/codex-adapter-plan.md`](docs/harness/codex-adapter-plan.md) - Codex adapter maturity, template boundaries, and dry-run strategy.
- [`docs/harness/claude-adapter-plan.md`](docs/harness/claude-adapter-plan.md) - Claude adapter maturity, template boundaries, and dry-run strategy.
- [`distributions/snapshots/omp-builtins/README.md`](distributions/snapshots/omp-builtins/README.md) - OMP built-in snapshot overview.
- [`distributions/snapshots/omp-builtins/portability-matrix.md`](distributions/snapshots/omp-builtins/portability-matrix.md) - OMP command portability classes and runtime boundary.
