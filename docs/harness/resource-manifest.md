# Unified Harness Resource Manifest

Issue #38 adds a read-only manifest for OMP, Codex, and Claude resource surfaces. The canonical machine-readable file is `docs/harness/resource-manifest.json`.

The manifest is category-level by design. It records source harness, resource category, current live path or discovery source, intended repo target, disposition, and migration notes without copying runtime state.

## Dispositions

- `track`: Declarative resources the repo may own directly.
- `adapt`: Reusable resources that need an adapter plan or redaction before tracking.
- `reference-only`: Surfaces that should be inspected or snapshotted later without treating the live source as repo-owned.
- `local-only`: Runtime state, private history, auth/cache data, plugin cache, blobs, terminal state, logs, and databases that must stay out of the repo.

## Coverage

- OMP built-ins and installed package resources are represented as `reference-only`.
- OMP bundled agents, built-in command sources, prompt categories, and built-in default rules are snapshotted under `docs/harness/omp-builtins/` by issue #39.
- OMP user/project resources and workflow-kit categories are represented as `track`.
- Codex config/profile surfaces are `reference-only`, while Codex agents and skill roots are `adapt`; issue #41 documents the Codex-side adapter plan in `docs/harness/codex-adapter-plan.md`.
- Claude agents, skills, and settings are `adapt`, with local settings and runtime state separated as `local-only`; issue #42 documents the Claude-side adapter plan in `docs/harness/claude-adapter-plan.md`.
- Duplicate skill roots across shared, Codex, Claude, OMP workflow-kit, and repo-local skill locations are represented at category level for a later audit.

## OMP Built-ins Snapshot

Issue #39 adds a versioned, non-live reference snapshot at `docs/harness/omp-builtins/`:

- `agents/`: portable bundled task agents exported with `omp agents unpack --dir <target> --json`.
- `source.json`: OMP package/version metadata, expected agent names, file hashes, and refresh commands.
- `commands.json`: built-in slash command registry indexed by command name, aliases, source type, and portability class.
- `resource-index.json`: built-in prompt category hashes, built-in default rule hashes, and runtime-only surface classifications.

Refresh or compare the snapshot from the repo root:

```sh
node scripts/refresh-omp-builtins-snapshot.mjs
node scripts/refresh-omp-builtins-snapshot.mjs --write
node scripts/validate-omp-builtins-snapshot.mjs --check-live
```

## Explicit Local-Only Surfaces

The manifest marks runtime sessions, database files, blobs, terminal state, auth/cache data, plugin cache, logs, local settings, and private history as `local-only`. The dry-run inventory may report path patterns and dispositions, but it does not read or copy those contents.

## Codex Adapter Plan

Issue #41 adds `docs/harness/codex-adapter-plan.md` and structured plan data under `docs/harness/codex-adapter-plan/`. The plan maps OMP bundled agents into Codex custom-agent candidates, native agents, or drop decisions; records future skill candidates from the issue #40 portability matrix; defines TOML template boundaries; and marks live `~/.codex` auth, sessions, caches, plugin cache, generated artifacts, app state, logs, databases, and private memory as local-only.

The Codex adapter plan is dry-run-only. It includes parseable TOML templates for future base config, optional profile, project/user custom agents under `.codex/agents/` or `~/.codex/agents/`, and `skills.config` entries, but this issue does not write or merge those templates into live `~/.codex`.

## Claude Adapter Plan

Issue #42 adds `docs/harness/claude-adapter-plan.md` and structured plan data under `docs/harness/claude-adapter-plan/`. The plan maps OMP bundled agents into Claude agent candidates, native/default keep decisions, or drop decisions; records future shared skill candidates from the issue #40 portability matrix; defines Markdown and JSON template boundaries; documents duplicate skill-root risks across Claude, Codex, shared, and repo-local skill roots; and marks live `~/.claude` project/session/history/cache/daemon/auth-adjacent/local settings surfaces as local-only.

The Claude adapter plan is dry-run-only. It includes parseable templates for future instruction, settings, agent, skill, and per-skill symlink candidate surfaces, but this issue does not write or merge those templates into live `~/.claude` or project `.claude`.

## Dry-Run Safety Gate

Issue #45 adds `docs/harness/dry-run-link-plan.json` and `scripts/dry-run-harness-safety-gate.mjs` as the read-only gate before any future live install, link, or render operation. It reads both the Codex adapter plan and the Claude adapter plan so generated-surface reporting stays aligned with issues #41 and #42.

The gate reports OMP, Codex, and Claude candidate live paths, planned repo targets, generated config destinations, local-only skipped surfaces, panel/prototype exclusions, duplicate candidate paths, and overwrite risk. It exits non-zero when a plan proposes runtime databases, blobs, sessions, histories, auth/cache files, local settings, logs, secret-looking values, local-only paths as symlink targets, or whole-root Claude skill symlinks.

The gate does not modify live `~/.omp`, `~/.codex`, `~/.claude`, `.agents`, or repo config. With `--check-live`, it only reads path metadata and symlink targets.

## Excluded Surface

Active panel, side-panel, and prototype work is listed under `excludedSurfaces`. It is intentionally ignored for this harness manifest and remains owned by its own issue sequence.

## Checks

Run these checks from the repo root:

```sh
node scripts/validate-harness-manifest.mjs
node scripts/validate-codex-adapter-plan.mjs
node scripts/validate-claude-adapter-plan.mjs
node scripts/dry-run-harness-inventory.mjs
node scripts/dry-run-harness-safety-gate.mjs --check-live
node --test tests/harness-manifest.test.mjs
node --test tests/codex-adapter-plan.test.mjs
node --test tests/claude-adapter-plan.test.mjs
node --test tests/harness-safety-gate.test.mjs
```
