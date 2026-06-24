# Factory Nucleus tracker modes

Factory Nucleus plans delivery against a **tracker-neutral contract**
(`scripts/factory-nucleus/tracker.mjs`): ids, states, projects, and the
branch/PR bridge are neutral primitives, and the contract "knows" neither
Linear nor GitHub. Concrete trackers are thin adapters that map a provider's
native objects onto that contract. Comment, status-update, and bridge actions
are planned as **inert data**; the V1 adapters perform no live writes —
fixtures in, inert plans out.

Two adapters ship in V1:

- **GitHub Issues — the public baseline.** The portable default any repo can
  use without Linear (`scripts/factory-nucleus/tracker-github.mjs`).
- **Linear — the preferred/private planning control plane.** The curated loom
  kit's planning system of record (`scripts/factory-nucleus/tracker-linear.mjs`;
  see [ADR 0003](../decisions/0003-factorio-workflow-kit.md)).

Both satisfy the same contract, so the planning surface (`plan`, readiness,
the branch/PR bridge, closeout verification) is identical regardless of which
tracker is bound. Picking GitHub does not change *what* Factory Nucleus plans —
only *where* the ghosts live.

## GitHub Issues baseline semantics

The GitHub adapter maps GitHub Issues onto the neutral contract:

- **Ghost = issue**, keyed by its `#<number>` reference, so the close-keyword
  bridge (`Closes #N`) and the branch id work directly.
- **State** is derived from `open`/`closed` plus readiness labels:
  - a `closed` issue is `done`, unless it was closed as *not planned*
    (`stateReason: not_planned`), which is `canceled`;
  - an `open` issue takes the first matching readiness label —
    `in-review` / `ready-for-human` → in-review, `in-progress` → in-progress,
    `ready-for-agent` / `ready` → ready, `triage` / `needs-triage` → triage —
    and otherwise falls back to `backlog`.
- **Labels** and **blocked-by** references carry over (numeric `blockedBy`
  entries are normalized to `#N`); a `parentNumber` becomes the parent `#N`.
- **Project = the repo.** The repo (`owner/name`) is the ghost's project.
  **GitHub Projects is deliberately unused.**
- **Bridge & closeout** — the close-keyword + branch-id bridge and closeout
  verification come from the shared contract, identically to Linear.

Example input: [`tests/fixtures/adapter-github.json`](../../tests/fixtures/adapter-github.json).

## Linear as the preferred/private planning control plane

Linear is the operator's preferred, private control plane for planning
(initiatives, projects, milestones, issues/sub-issues, cycles, triage state,
docs, status). The Linear adapter maps that vocabulary onto the same contract:

- **Ghost = issue**; the Linear `project` is the ghost's project.
- **State** is derived from the workflow `statusType`: `triage` → triage,
  `backlog` → backlog, `unstarted` → ready, `started` → in-progress
  (or in-review when the workflow state name contains "review"),
  `completed` → done, `canceled` → canceled.
- **Labels** and **blocked-by** relations carry over; a `parentId` is preserved.
- **Closeout follows Linear's native GitHub bridge:** a branch carrying the
  issue id plus a PR body that closes it.

Example input: [`tests/fixtures/adapter-linear.json`](../../tests/fixtures/adapter-linear.json).

The split is intentional: **GitHub Issues is the public baseline** so the kit
works for anyone, while **Linear is the preferred/private control plane** for
the curated loom workflow. Neither tracker is the sole planning system — the
neutral contract supports both, with GitHub as the public default and Linear
as the private control plane.

## Binding a tracker

A tracker is **inactive until explicitly bound** with `bind-tracker`; scan and
onboarding never silently pick a provider.

- **Linear:** binding records the adapter and the project identity
  (`--team`, `--project`).
- **GitHub:** binding records the adapter and the source-repo bridge
  (`--repo owner/name`). GitHub defaults the tracker repo to the detected
  source repo **only after GitHub is explicitly selected**.

```
node scripts/factory-nucleus/factory.mjs bind-tracker --provider <linear|github> \
  [--team <team>] [--project <project>] [--repo <owner/name>] [--root <path>] [--json]
```

## Commands

The repo-internal CLI is invoked via `npm run factory <command>` (or
`node scripts/factory-nucleus/factory.mjs <command>`). Current commands:

| Command | Purpose |
| --- | --- |
| `scan` | Zero-footprint repo scan: reads local files and Git only, writes nothing by default. |
| `init-envelope` | Initialize the repo-local envelope (durable workflow policy). |
| `bind-tracker` | Explicitly bind a tracker provider (see above). |
| `plan` | Plan the `ghost-to-launch` recipe for a ready ghost from a tracker fixture. |
| `radar` | Check-only drift detection and next-route suggestion. |

Every structured command accepts `--json` for parseable, prose-free output
(see [FN-41](https://github.com/DylanMcCavitt/loom/pull/109)). `plan` selects the
adapter with `--provider <linear|github>` against a `--tracker <fixture.json>`:

```
node scripts/factory-nucleus/factory.mjs plan --provider <linear|github> \
  --tracker <fixture.json> --ghost <id> [--branch-prefix <prefix>] \
  [--blueprint <ref>] [--no-save] [--json]
```

## Public CLI deferral

A public, externally distributed Factory Nucleus CLI is a **V1 non-goal
(deferred)**. The commands above are the repo-internal planning/dry-run surface:
they run offline against fixtures, plan actions as inert data, and never perform
live tracker or network writes. A packaged public CLI, if pursued, is future
work and does not change the V1 contract documented here.

## V1 non-goals

- **GitHub Projects** — the GitHub adapter uses the repo as the ghost's project
  and never reads or writes GitHub Projects.
- **Live tracker writes / live adapter calls** — V1 adapters are fixture-backed
  and emit inert plans only.
- **Live smoke tests as the default path** — optional live Linear/GitHub smoke
  is opt-in and designed separately ([FN-36](https://linear.app/dylanmccavitt/issue/LOO-69));
  the default test/check path explicitly skips it.
- **A public/distributed CLI** — see *Public CLI deferral* above.
