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
- Codex config/profile surfaces are `reference-only`, while Codex agents and skill roots are `adapt`.
- Claude agents, skills, and settings are `adapt`, with local settings and runtime state separated as `local-only`.
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

## Excluded Surface

Active panel, side-panel, and prototype work is listed under `excludedSurfaces`. It is intentionally ignored for this harness manifest and remains owned by its own issue sequence.

## Checks

Run these checks from the repo root:

```sh
node scripts/validate-harness-manifest.mjs
node scripts/dry-run-harness-inventory.mjs
node --test tests/harness-manifest.test.mjs
```
