# Installing, applying, verifying, and rolling back the harness nucleus

Use this runbook when you are changing local harness installation state. Daily
issue work stays in [`daily-workflow.md`](daily-workflow.md); this page is only
for moving reviewed Loom nucleus output from dry-run to scratch proof to an
explicit live apply.

## Architecture in one screen

- `loom` is the version-controlled nucleus repo. It owns canonical source under
  `nucleus/`, harness adapters under `adapters/`, generated/checkable output
  under `distributions/`, renderers, validators, and operator docs.
- The Factorio workflow kit is authored under `nucleus/skills/` and rendered to
  `.agents/skills/` as the OMP compatibility surface.
- OMP, Codex, and Claude are target harnesses. They consume rendered or linked
  surfaces; their runtime state stays local-only.
- `scripts/render-nucleus.mjs` renders the OMP/Codex/Claude adapter nucleus and
  applies only approved `track` / `adapt` HOME-scoped candidates.
- `scripts/render-plugin-bridge.mjs` renders the `loom-nucleus` Codex/Claude
  plugin bridge and reuses the same render -> gate -> marker apply engine.

The safety model is always:

```text
dry-run -> review -> scratch-HOME proof -> explicit live apply -> verify
```

Never skip straight to `--write` against the real HOME. A live apply requires a
clean dry-run manifest, human review of the destinations, and explicit approval
for the concrete target HOME.

## Current live baseline

The historical pre-cutover live inventory is recorded in
[`docs/harness/live-nucleus-inventory-2026-06-25.md`](../harness/live-nucleus-inventory-2026-06-25.md).
It is superseded by ADR 0004 and the LOO-107..111 layout cutover; use it only as
reference context. The current operator distinction:

- Already effective:
  - `.agents/skills` is rendered from `nucleus/skills/` and `nucleus/utilities/`.
  - OMP defaults are copied once from `adapters/omp/source/`; live copies are operator-owned after first apply.
- Planned or gated:
  - generated Codex config/profile fragments;
  - generated Claude instruction/settings/agent/skill candidates;
  - the `loom-nucleus` plugin bridge under `~/.agents/plugins/`;
  - marker-owned apply records under `~/.loom-harness/applied-manifest.json`.

Do not treat planned config files as live until the specific dry-run -> review
-> explicit apply gate has passed.

## Non-goals and hard boundaries

- Do not write live `~/.omp`, `~/.codex`, `~/.claude`, `~/.agents`, or repo
  config except through the explicit commands below after review.
- Do not read or copy secrets, tokens, auth/cache data, sessions, histories,
  runtime databases, browser state, plugin caches, local settings, logs, or
  private runtime files.
- Do not duplicate private local config values into docs, commits, PRs, issues,
  or marker notes.
- Do not publish a plugin, install marketplace content, enable hooks, or change
  provider/model/auth/telemetry/default-profile settings in this runbook.
- Do not overwrite user files. The apply engine is create-missing-only for
  unmarked files; marker-owned drift is backed up before update.

## Common preflight

Run these from the repo root before any lane-specific apply:

```sh
npm run doctor
npm run check
```

Machine-readable dry-runs are preferred for saved evidence:

```sh
npm run render-nucleus -- --json
node scripts/render-plugin-bridge.mjs --json
```

Both dry-runs render into temporary output, run the safety gate, print candidate
manifests, and write nothing to live HOME.

## OMP lane

Owner chain:

- Parent lane: LOO-35 (`FN-M03: Scan and onboarding`).
- OMP mirror/config split: `adapters/omp/source/` and
  `docs/harness/resource-manifest.*`.
- Live apply runbook: LOO-91.

### Dry-run

```sh
npm run render-nucleus -- --json
```

Review the JSON:

- `result` must be `pass`;
- `findings` must be empty;
- OMP destinations must be expected `track` / `adapt` surfaces;
- local-only runtime patterns must be reported, not appliable.

### Scratch-HOME apply proof

```sh
SCRATCH_HOME="$(mktemp -d)"
node scripts/render-nucleus.mjs --home "$SCRATCH_HOME" --write --json
node scripts/render-nucleus.mjs --home "$SCRATCH_HOME" --write --json
node scripts/render-nucleus.mjs --home "$SCRATCH_HOME" --json
```

Expected proof:

- first `--write` returns `result: "pass"`;
- second `--write` reports already-applied or skipped actions and
  `markerChanged: false`;
- final dry-run still returns `result: "pass"` and shows marker-owned live
  status under the scratch HOME.

### Live apply

Only after the reviewed scratch proof:

```sh
npm run install-nucleus -- --json
```

`install-nucleus` is `node scripts/render-nucleus.mjs --write`. It
refuses on safety findings, creates only missing unowned files, skips existing
unmarked files with `reason: "exists"`, backs up marker-owned drift as
`*.loom-bak-<timestamp>`, and records ownership in
`~/.loom-harness/applied-manifest.json`.

OMP tracked defaults (`adapters/omp/source/AGENTS.md`, `RULES.md`, and
`config.yml`) are **copied, not linked**, on first apply. After that copy lands,
the live files are **operator-owned**: a plain `--write` skips them with
`reason: "exists"` unless they are already marker-owned kit surfaces. Divergence
from tracked neutral defaults is expected and is not an error.

If you are migrating from an older repo-mirror symlink layout, convert the live
paths to real files before relying on create-missing-only semantics. The tracked
repo sources remain public neutral templates only.

### Verify

```sh
npm run render-nucleus -- --json
node scripts/dry-run-harness-inventory.mjs --check-live
node scripts/dry-run-harness-safety-gate.mjs --check-live
```

The `--check-live` commands read path metadata and symlink targets only. They do
not read local-only runtime contents and do not write.

### Rollback

There is no broad rollback script. Roll back only the concrete paths listed in
the live apply JSON.

For a file created by the apply:

```sh
rm -- "<created-live-path-from-actions>"
```

For a marker-owned file updated with a backup:

```sh
cp -- "<backup-path-from-actions>" "<live-path-from-actions>"
```

After rollback, verify again:

```sh
npm run render-nucleus -- --json
node scripts/dry-run-harness-inventory.mjs --check-live
node scripts/dry-run-harness-safety-gate.mjs --check-live
```

Leave `~/.loom-harness/applied-manifest.json` in place as audit evidence unless
the reviewed rollback specifically says to remove a marker entry. Do not edit
the marker by hand in routine rollback.

## Codex lane

Owner chain:

- Codex adapter plan: `docs/harness/codex-adapter-plan.md`.
- Shared-agent source/rendering: LOO-96 through LOO-105.
- Plugin bridge scratch activation proof: LOO-102.
- Live apply runbook: LOO-91.

Codex consumes the shared `loom-nucleus` package through the personal plugin
marketplace catalog at `~/.agents/plugins/marketplace.json`. The rendered plugin
source stays under `~/.agents/plugins/loom-nucleus/`.

### Dry-run

```sh
node scripts/render-plugin-bridge.mjs --json
```

Review the JSON:

- `result` must be `pass`;
- appliable destinations must be limited to
  `~/.agents/plugins/marketplace.json` and
  `~/.agents/plugins/loom-nucleus/**`;
- no Codex provider, model, auth, telemetry, notification, profile, or plugin
  cache path may be generated.

### Scratch-HOME apply proof

```sh
SCRATCH_HOME="$(mktemp -d)"
node scripts/render-plugin-bridge.mjs --home "$SCRATCH_HOME" --write --json
node scripts/render-plugin-bridge.mjs --home "$SCRATCH_HOME" --write --json
node adapters/plugin-bridge/loom-nucleus/hooks/verify-loom-install.mjs \
  --root "$SCRATCH_HOME/.agents/plugins/loom-nucleus" \
  --home "$SCRATCH_HOME" \
  --marketplace "$SCRATCH_HOME/.agents/plugins/marketplace.json" \
  --json
```

Expected proof:

- the first apply creates only the marketplace catalog, plugin source, and
  marker entries under the scratch HOME;
- the second apply reports `already-applied` and `markerChanged: false`;
- the verifier exits 0 and reports JSON success.

### Live apply

Only after review:

```sh
node scripts/render-plugin-bridge.mjs --write --json
```

This does not install or enable the plugin in Codex. It only creates the
personal marketplace catalog and co-located plugin source if missing.

### Verify

```sh
node adapters/plugin-bridge/loom-nucleus/hooks/verify-loom-install.mjs \
  --root "$HOME/.agents/plugins/loom-nucleus" \
  --home "$HOME" \
  --marketplace "$HOME/.agents/plugins/marketplace.json" \
  --json
node scripts/render-plugin-bridge.mjs --json
```

Codex auto-discovery of `~/.agents/plugins/marketplace.json` was verified in
the bridge design. If a later reviewed step chooses to inspect marketplace
registration in Codex, use the official marketplace command:

```sh
codex plugin marketplace list
```

Plugin installation through Codex is separate from this live apply gate.

### Rollback

Use the live apply JSON actions:

```sh
rm -- "$HOME/.agents/plugins/marketplace.json"
rm -rf -- "$HOME/.agents/plugins/loom-nucleus"
```
…

…
`LOO-89` was superseded by LOO-102 and is not a live apply owner.

[Showing lines 1-300 of 429. Use :301 to continue]
