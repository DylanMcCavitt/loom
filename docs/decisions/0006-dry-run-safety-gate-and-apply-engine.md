# ADR 0006: Dry-Run Safety Gate and Apply Engine

## Status

Accepted.

## Context

Harness renderers (`scripts/render-nucleus.mjs`, `scripts/render-plugin-bridge.mjs`) target live HOME and repo compatibility surfaces. Runtime auth, sessions, caches, and personal overlays are `local-only` per `docs/harness/resource-manifest.json`. Prior incidents showed that writing without review risks overwriting operator-owned files or leaking private paths.

The apply engine lives in `scripts/lib/harness-apply-engine.mjs`; gating lives in `scripts/lib/harness-render-gate.mjs` and `scripts/lib/harness-safety.mjs`. Read-only validators (`scripts/dry-run-harness-inventory.mjs`, `scripts/dry-run-harness-safety-gate.mjs`) scan tracked sources and manifest dispositions without mutation.

## Decision

1. **Dry-run default.** Renderers write only to a temp candidate tree unless `--write` is passed. Default output is a deterministic manifest for human review.
2. **Read-only gate.** Before any apply, rendered bytes pass secret scanning, private-home-path rejection, dangerous-path rules, local-only pattern matching, and forbidden provider/model/auth key scans.
3. **Strict-manual `--write`.** Apply refuses unless dry-run render and gate pass clean; plugin-bridge adds destination allowlist and symlink-escape guards. OMP repo-owned symlink replacement requires an explicit approval flag.
4. **Create-missing-only.** For unmarked live files, apply creates missing destinations and skips existing user files. Marked kit-owned drift may update with timestamped `.loom-bak-*` backups.
5. **Markers and idempotency.** Successful writes record content hashes in `~/.loom-harness/applied-manifest.json`. Repeat apply against unchanged content reports `already-applied`.

## Rejected Alternative

Overwrite-in-place apply for all candidates is rejected. Existing live Codex/Claude/OMP files are operator property until explicitly claimed through the narrow OMP repo-owned gate or marker-tracked kit ownership.

## Consequences

Every live promotion follows **dry-run → review → explicit apply → verify**. Operators use `npm run render-nucleus`, `node scripts/render-plugin-bridge.mjs`, and `npm run install-nucleus` only after reviewing gated manifests. If a renderer needs blind overwrite semantics, this ADR must be superseded.

