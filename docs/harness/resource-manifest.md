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
- OMP user/project resources and workflow-kit categories are represented as `track`, with personal OMP config overlays separated as `local-only`.
- Codex config/profile surfaces are `reference-only`, while Codex agents and skill roots are `adapt`; issue #41 documents the Codex-side adapter plan in `docs/harness/codex-adapter-plan.md`.
- Claude agents, skills, and settings are `adapt`, with local settings and runtime state separated as `local-only`; issue #42 documents the Claude-side adapter plan in `docs/harness/claude-adapter-plan.md`.
- Duplicate skill roots across shared, Codex, Claude, OMP workflow-kit, and repo-local skill locations are represented at category level for a later audit.
- Cross-harness plugin and marketplace surfaces are installed through the `loom-nucleus` plugin bridge; issue LOO-8 documents the bridge in `docs/harness/plugin-bridge/` and `scripts/render-plugin-bridge.mjs`. The personal marketplace root `~/.agents/plugins/` is `adapt`/appliable; the repo Claude marketplace is `track`/reported; plugin caches stay `local-only`.

## OMP Built-ins Snapshot

Issue #39 adds a versioned, non-live reference snapshot at `docs/harness/omp-builtins/`:

- `agents/`: portable bundled task agents exported with `omp agents unpack --dir <target> --json`.
- `source.json`: OMP package/version metadata, expected agent names, file hashes, and refresh commands.
- `commands.json`: built-in slash command registry indexed by command name, aliases, source type, and portability class.
- `resource-index.json`: built-in prompt category hashes, built-in default rule hashes, and runtime-only surface classifications.

Offline snapshot validation is part of `npm run check` from the repo root. Live OMP refresh and compare commands are intentionally outside CI:

```sh
node scripts/refresh-omp-builtins-snapshot.mjs
node scripts/refresh-omp-builtins-snapshot.mjs --write
node scripts/validate-omp-builtins-snapshot.mjs --check-live
```

## Explicit Local-Only Surfaces

The manifest marks runtime sessions, database files, blobs, terminal state, auth/cache data, plugin cache, logs, local settings, and private history as `local-only`. The dry-run inventory may report path patterns and dispositions, but it does not read or copy those contents.

## OMP Agent Config Split

Issue #52 records `adapters/omp/source/` as parameterized appliable source: the portable base remains tracked, while operator-specific overlay values are local-only.

- `adapters/omp/source/config.yml`: tracked portable base config.
- `adapters/omp/source/config.example.yml`: tracked overlay shape with no personal values.
- `adapters/omp/source/config.local.yml`: gitignored local-only overlay for `modelRoles`, `skills.ignoredSkills`, and `dev.autoqa.consent`.

The reference-only snapshot alternative is rejected in `docs/decisions/0001-omp-agent-parameterized-source.md` because future render/apply tooling needs an explicit source/overlay boundary.

## Codex Adapter Plan

Issue #41 adds `docs/harness/codex-adapter-plan.md` and structured plan data under `docs/harness/codex-adapter-plan/`. The plan now keeps direct OMP bundled-agent custom-agent ports as superseded context, records future skill candidates from the issue #40 portability matrix, defines TOML template boundaries, and marks live `~/.codex` auth, sessions, caches, plugin cache, generated artifacts, app state, logs, databases, and private memory as local-only.

The Codex adapter plan is dry-run-only. It includes active templates for future base config, the optional profile, and `skills.config` entries. Superseded `omp-*` custom-agent templates remain parseable historical fixtures only; future shared agent activation points to per-agent Vercel-shaped packages with canonical names and no harness prefixes.

## Claude Adapter Plan

Issue #42 adds `docs/harness/claude-adapter-plan.md` and structured plan data under `docs/harness/claude-adapter-plan/`. The plan maps OMP bundled agents into Claude agent candidates, native/default keep decisions, or drop decisions; records future shared skill candidates from the issue #40 portability matrix; defines Markdown and JSON template boundaries; documents duplicate skill-root risks across Claude, Codex, shared, and repo-local skill roots; and marks live `~/.claude` project/session/history/cache/daemon/auth-adjacent/local settings surfaces as local-only.

The Claude adapter plan is dry-run-only. It includes parseable templates for future instruction, settings, agent, skill, and per-skill symlink candidate surfaces, but this issue does not write or merge those templates into live `~/.claude` or project `.claude`.

## Plugin Bridge

Issue LOO-8 adds `docs/harness/plugin-bridge/` and `scripts/render-plugin-bridge.mjs`: the cross-harness plugin bridge that installs the `loom-nucleus` skill, canonical shared-agent package, and hook nucleus into the Codex and Claude plugin and marketplace surfaces. The renderer reuses the issue #56 render -> gate -> apply executor verbatim; it adds only a new candidate source (the tracked plugin templates) and never forks the safety gate or marker model.

- `docs/harness/plugin-bridge/plan.json`: maps each tracked template to its install destination, kind, consuming harness, and disposition harness, and records the resolved packaging decisions.
- `docs/harness/plugin-bridge/loom-nucleus/`: the dual-manifest plugin component root (`.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, six OMP command-derived `skills/*/SKILL.md` entries, canonical shared-agent Vercel-shaped packages under `skills/{agent-name}/`, `hooks/hooks.json` Stop handler, and the read-only `hooks/verify-loom-install.mjs`).
- `docs/harness/plugin-bridge/.agents/plugins/marketplace.json` and `docs/harness/plugin-bridge/.claude-plugin/marketplace.json`: the Codex personal and Claude repo marketplace catalogs.

Two new manifest rows make the personal marketplace root `~/.agents/plugins/` (catalog plus co-located `loom-nucleus/` plugin source) `adapt`/appliable and the repo Claude marketplace `track`/reported. The plugin caches (`~/.codex/plugins/cache/`, `~/.claude/plugins/cache/`, `~/.claude/plugins/data/`) stay `local-only` and are rejected as write targets by the gate. The Stop verifier ships dormant and requires a one-time `/hooks` trust step before it arms.

```sh
node scripts/render-plugin-bridge.mjs            # dry-run render + gate (no writes)
node scripts/render-plugin-bridge.mjs --write    # strict-manual apply to safe ~/ targets
```

## Dry-Run Safety Gate

Issue #45 adds `docs/harness/dry-run-link-plan.json` and `scripts/dry-run-harness-safety-gate.mjs` as the read-only gate before any future live install, link, or render operation. It reads both the Codex adapter plan and the Claude adapter plan so generated-surface reporting stays aligned with issues #41 and #42.

The gate reports OMP, Codex, and Claude candidate live paths, planned repo targets, generated config destinations, local-only skipped surfaces, duplicate candidate paths, overwrite risk, and the tracked-source content scan. It exits non-zero when a plan proposes runtime databases, blobs, sessions, histories, auth/cache files, local settings, logs, secret-looking values, local-only paths as symlink targets, or whole-root Claude skill symlinks. It also exits non-zero when in-scope tracked source contains absolute private home paths or secret-looking values.

The gate does not modify live `~/.omp`, `~/.codex`, `~/.claude`, `.agents`, or repo config. With `--check-live`, it only reads path metadata and symlink targets.

## Checks

Run the offline validator and test suite from the repo root:

```sh
npm run check
```

`npm run validate` discovers every `scripts/validate-*.mjs` file and then runs the offline dry-run inventory and safety gate. `refresh-*` scripts, `--check-live` checks, and benchmarks are intentionally excluded from CI. Optional live metadata checks remain manual:

```sh
node scripts/dry-run-harness-inventory.mjs --check-live
node scripts/dry-run-harness-safety-gate.mjs --check-live
```

The render-to-write executor renders the planned templates plus the decided OMP source into a temp directory, runs the dry-run safety gate over the rendered output, and prints a candidate manifest keyed by disposition:

```sh
node scripts/render-harness-nucleus.mjs            # dry-run render + gate (no writes)
node scripts/render-harness-nucleus.mjs --write    # strict-manual apply (create-missing-only, gated)
```

The dry-run is AFK-safe and writes nothing; only `track`/`adapt` surfaces are appliable, while `reference-only` and `local-only` surfaces are reported and skipped. The `--write` path is HITL: it runs only after a clean dry-run + gate pass, never overwrites an existing non-marker live file, backs up kit-owned markers before updating, and applies idempotently against `~/.loom-harness/applied-manifest.json`.

Full-flow traceability benchmark, distinct from the dry-run gate:

```sh
bash scripts/autoresearch.sh
```
