# Installing or updating the harness nucleus

The harness install path is separate from daily issue work. It changes local
harness configuration, not project code.

## Dry run

```sh
npm run render-nucleus
```

Review the candidate manifest. The dry run writes nothing to live `~/.omp`,
`~/.codex`, `~/.claude`, `.agents`, or repo config.

## Apply after review

```sh
npm run install-nucleus
```

The apply path is strict-manual, create-missing-only, backed up for kit-owned
markers, and idempotent against `~/.loom-harness/applied-manifest.json`.

## Plugin bridge

The plugin bridge has its own renderer:

```sh
node scripts/render-plugin-bridge.mjs
node scripts/render-plugin-bridge.mjs --write
```

Use it only when installing/updating the Codex/Claude plugin surfaces. It reuses
the same safety gate and marker model.

## Before and after

```sh
npm run doctor
npm run check
```
