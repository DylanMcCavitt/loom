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
- OMP user/project resources and workflow-kit categories are represented as `track`.
- Codex config/profile surfaces are `reference-only`, while Codex agents and skill roots are `adapt`.
- Claude agents, skills, and settings are `adapt`, with local settings and runtime state separated as `local-only`.
- Duplicate skill roots across shared, Codex, Claude, OMP workflow-kit, and repo-local skill locations are represented at category level for a later audit.

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
