# Per-VM Factory Nucleus envelope bootstrap

Factory Nucleus keeps **durable workflow policy** in VM-local state. That envelope
is never committed to the repo. The tracked `.loom.yml` at the repo root is a
**pointer only** — it carries factory identity (`factory: loom`) so `scan` and
cloud agents can detect setup intent without reading private policy.

## What lives where

| Surface | Location | Committed? |
| --- | --- | --- |
| Factory pointer | `.loom.yml` (repo root) | Yes — identity only |
| Factory envelope | `~/.loom/factory-nucleus/<factory-id>/envelope/envelope.yaml` | **No** — per-VM local state |
| Scan snapshots (optional) | `~/.loom/factory-nucleus/<factory-id>/scan/` | **No** |

For this repo, `<factory-id>` is derived from the directory name (`loom`).

Policy fields (tracker binding, proof commands, delivery defaults, agent caps)
belong in the local envelope. Do **not** put tracker tokens, team maps, or
command overrides in `.loom.yml` — `scan` ignores policy-bearing pointer files.

## Fresh VM bootstrap

Run from a checkout of this repo (`<repo>` is the git root):

### 1. Initialize the local envelope

```sh
npm run factory -- init-envelope --root <repo>
```

This writes only under `~/.loom/factory-nucleus/…` and leaves the repo tree
unchanged (`tracker.provider` starts as `none`).

### 2. Bind the tracker (explicit user choice)

Present options if needed:

```sh
npm run choose-tracker -- --root <repo>
```

Bind Linear for the Loom planning lane:

```sh
npm run factory -- bind-tracker --root <repo> \
  --provider linear --team Loom --project "Workflow Nucleus"
```

Or bind GitHub Issues when that is the project's tracker:

```sh
npm run factory -- bind-tracker --root <repo> \
  --provider github --repo <owner/name>
```

`bind-tracker` updates the local envelope only. It does **not** call Linear or
GitHub APIs and does not require API keys for the bind step itself. Live tracker
smoke (`npm run smoke:live`) is separate and opt-in.

### 3. Verify

```sh
npm run doctor
npm run factory -- scan --root <repo>
```

Expect:

- `doctor`: tracker picker available (binding is recorded in the local envelope).
- `scan`: `Pointer: loom` when `.loom.yml` is present; science unlock
  `factory envelope` when the pointer is valid or `.agents/envelope/` exists.

Confirm the repo stayed clean:

```sh
git status --porcelain
```

## Cloud agents

On a fresh cloud VM:

1. Clone the repo (includes `.loom.yml`).
2. Run the bootstrap commands above against the checkout path.
3. Never commit `~/.loom/` or copy envelope YAML into the repo.

If `init-envelope` reports the envelope already exists, the VM already has
local state — verify the path under `~/.loom/factory-nucleus/loom/envelope/`
instead of overwriting.

## Related docs

- [Daily workflow](./daily-workflow.md) — operating the workflow lane after bootstrap
- [Factory Nucleus architecture](../architecture/factory-nucleus.md) — contract and commands
- [Tracker modes](../factory-nucleus/tracker-modes.md) — Linear vs GitHub adapter semantics
