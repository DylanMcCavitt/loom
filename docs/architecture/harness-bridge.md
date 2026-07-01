# Harness bridge architecture

Loom tracks declarative harness surfaces and keeps runtime state local-only.

## Layers

- `adapters/omp/source/` — tracked OMP adapter source.
- `docs/harness/resource-manifest.{md,json}` — resource ownership and disposition.
- `docs/harness/*-adapter-plan.md` — Codex and Claude adapter boundaries.
- `adapters/plugin-bridge/` — packaged plugin bridge templates; `docs/harness/plugin-bridge/` keeps design docs only.
- `scripts/render-harness-nucleus.mjs` — dry-run/apply renderer.
- `scripts/render-plugin-bridge.mjs` — plugin bridge renderer.

## Safety model

Every live write goes through:

1. render into a temp candidate tree;
2. run the safety gate;
3. print the manifest;
4. require explicit `--write`;
5. create missing files only and record the applied marker.

Runtime sessions, auth/cache, logs, databases, histories, plugin caches, and
personal overlays stay `local-only`.

## Operator commands

```sh
npm run doctor
npm run render-nucleus
npm run install-nucleus
node scripts/render-plugin-bridge.mjs
```
