---
name: roboports
description: The implement coordinator. Runs one tracked Linear issue end-to-end as code — one issue to one branch/worktree to one PR — with localized subagent fanout and a minimal diff, and covers behavior-preserving refactors and measured performance work through lenses. Use when the user asks to start, continue, or ship one tracked issue, refactor without changing behavior, or optimize a proven bottleneck.
---

# Roboports

Build the planned work. Blueprint's issue-decomposition lens stamps the planned
work; `roboports` coordinates the bounded build network that turns one *ready*
Linear issue into landed code: one issue → one branch/worktree → one PR, no
more. Through lenses it also runs behavior-preserving refactors and measured
performance work. The main agent is the roboport hub — it owns intake,
integration, and handing the PR to `rocket-launch`; subagents do bounded,
disjoint, localized work.

## Lenses

The input packet's `lens` field selects which variant guidance loads:

- A named lens loads `references/lens-<name>.md` (e.g. `lens: refactor` loads
  `references/lens-refactor.md`).
- When `lens` is absent, load the default lens
  `references/lens-issue-delivery.md`.
- Only the named lens references load; unnamed lens references stay unloaded.
- Lenses select guidance only; they never widen packet scope, change the
  implement-mode boundary, or grant extra delegation authority.

Available lenses:

- `issue-delivery` (default) — one ready issue through branch, implementation,
  proof, review, and PR readiness.
- `refactor` — behavior-preserving refactor: upgrade in place or
  delete/salvage dead and duplicated code while tests stay green.
- `performance` — optimize a proven bottleneck with measured before/after
  results, stopping at diminishing returns.

The rest of this entrypoint describes the default issue-delivery lens.

Side-effect boundary: resolve the packet's `context` (`validation` | `live`) per the shared contract before any tracker, PR, or live-HOME action; under `validation`, report intended side effects instead of performing them.
During real work it owns one issue from context-gathering to a review-ready PR.

## The bridge

Planning lives in Linear; code lands as a GitHub PR; the two are stitched by
Linear's native GitHub integration. So:

- **One issue → one branch/worktree → one PR.** Preserve the convention: one
  issue to one branch/worktree to one PR unless the repo envelope says otherwise.
- **The branch name carries the Linear issue id.** That id is the bridge — the PR
  auto-links and, on merge, auto-closes the issue. Never craft a branch that drops
  the id, or the bridge breaks.

## Required reading

Before editing, read:

1. The **repo envelope** that `assembler` generated — Linear team/project/label
   map, domain glossary, branch/PR conventions, and the repo's build/test
   commands. Never hardcode commands or a tracker; read them from the envelope.
2. The active **Linear issue**: description, comments, and acceptance criteria.
3. The repo's agent context and any architecture/ADR/domain docs the issue names.

## Localized roboport discipline

Bots only fly inside their roboport's coverage. Do **not** wire every subagent
into one giant global network — that is how bots cross the whole map and collide.
Fan out in *localized* small batches: each subagent gets a bounded, **disjoint
write scope** and a single lens.

- Default to the main agent implementing the first pass; spawn bots only when they
  cut risk or context load.
- Give implementation bots disjoint write scopes; give reviewers distinct lenses
  (acceptance/spec vs. safety/maintainability).
- Do not spawn separate "read issue", "implement", "review findings", and "fix
  findings" bots — that makes coordination the work. Localized small-batch fanout,
  never a universal backbone.

## Doctrine and specialist routing

- Apply the minimal-diff doctrine for the implementation (the biters
  minimal-diff lens reviews against it): reuse before you write, ship the
  minimum that works, never cut validation/security/error-handling/accessibility.
- Use `tdd` when the work is test-first / red-green-refactor.
- For bug, failing check, exception, or regression: route to the operator-local `debug-tools` skill's diagnose loop when installed (see docs/skills/operator-local-manifest.md); otherwise run the reproduce→minimise→hypothesise→instrument→fix→regression-test loop inline.
- Route triage — classifying, prioritizing, or routing incoming work — to
  blueprint's triage lens. `roboports` only builds an already-tracked, ready
  issue; it does not triage.
- Use the biters drift lens before or after implementation when
  repo/tracker/proof drift could change the route; it checks only and does not
  mutate state.
- Use `lab` to collect targeted proof for the implemented behavior (the lab
  ui-proof lens for user-visible flows) before launch gates rely on it.
- Hand the finished PR to `rocket-launch`. `roboports` does not own closeout.

## Flow

1. Confirm scope, blockers, owned behavior, and the proof plan from the issue's
   acceptance criteria; create the one branch/worktree (id in the name) if absent.
2. Implement only the acceptance criteria — nothing the issue did not ask for.
3. Run the envelope's targeted checks that prove the changed behavior.
4. Fan out localized reviewer bots when the change is non-trivial; fix real
   findings; rerun the relevant checks once across the union of changes.
5. Prepare a **review packet** and open or update the PR.

## Review packet

- the Linear issue id and its acceptance criteria
- changed-file list and the relevant diff/excerpts
- checks already run (and any unrun, with reasons)
- exact questions per reviewer lens
- remaining blockers, if any

## Invariants

- One issue → one branch/worktree → one PR; the branch name carries the Linear
  issue id for the bridge.
- Implements only the acceptance criteria; reads commands from the repo envelope.
- Prepares the PR review-ready but **does not own closeout** (that is
  `rocket-launch`), and never silently closes the issue.

## Migration note

`robots` was the former canonical name. The steady state is `roboports` only: no
`robots` skill directory, eval, handoff target, or alias remains canonical.
