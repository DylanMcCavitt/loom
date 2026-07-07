# ADR 0005: Plugin Bridge Distribution (Render-at-Install)

## Status

Accepted.

## Context

ADR 0004 placed generated output under `distributions/` and canonical agent packages under `nucleus/skills/{agent-name}/`. The cross-harness plugin bridge (`docs/harness/plugin-bridge/design.md`) must install the shared nucleus into Codex and Claude plugin/marketplace surfaces without duplicating roster bytes inside the tracked plugin tree.

`scripts/render-plugin-bridge.mjs` reuses the shared render → gate → apply executor from `scripts/render-nucleus.mjs`. The plugin plan lists bridge-owned templates under `adapters/plugin-bridge/`; shared roster packages are expanded at render time from `nucleus/skills/` via `expandedPlanTemplates()` and are not committed as static copies under the plugin source directory.

## Decision

1. **Render-at-install.** The `loom-nucleus` plugin is produced by rendering tracked bridge templates plus live reads from `nucleus/skills/` into an ephemeral candidate tree, gating the bytes, and applying only on explicit `--write`.
2. **Canonical source stays in nucleus.** Roster agent packages remain authoritative under `nucleus/skills/{agent-name}/`. The renderer copies them into `~/.agents/plugins/loom-nucleus/skills/` at apply time; the plugin tree under `adapters/plugin-bridge/` holds manifests, hooks, and bridge templates only.
3. **Dual consumer manifests.** One component tree is fronted by `.codex-plugin/plugin.json` and `.claude-plugin/plugin.json` so Codex and Claude load the same rendered skills; provider/model/auth keys stay forbidden in rendered output.
4. **Containment.** Appliable writes are limited to the personal marketplace catalog and the co-located `loom-nucleus` plugin root; template paths must resolve under the bridge dir or `nucleus/skills/`.
5. **Marker identity.** Plugin-bridge apply records `generatedBy: render-plugin-bridge` in `~/.loom-harness/applied-manifest.json`.

## Rejected Alternative

Committing rendered roster packages into `adapters/plugin-bridge/loom-nucleus/skills/` is rejected. That would create a second canonical source, violate ADR 0004's lane map, and reintroduce the byte-equality drift the layout cutover removed.

## Consequences

Roster edits land in `nucleus/skills/` and reach live plugin installs only through re-render and gated apply. Validators (`validate-shared-agent-packages.mjs`, scratch-HOME verifier proof) must pass before promotion. If the bridge ever needs checked-in roster snapshots, this ADR must be superseded.

