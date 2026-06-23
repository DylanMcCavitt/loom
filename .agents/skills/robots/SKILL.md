---
name: robots
description: Runs one tracked Linear issue end-to-end as code — one issue to one branch/worktree to one PR — with localized subagent fanout and a minimal diff. Use when the user asks to start, continue, or ship one tracked Linear issue end-to-end (implement, test, and open or update the PR).
---

# Robots

Build the ghosts. `ghosts` stamps the planned work; `robots` constructs it. A
swarm takes one *ready* Linear issue and turns it into landed code: one issue →
one branch/worktree → one PR, no more. The main agent is the roboport hub — it
owns intake, integration, and handing the PR to `rocket-launch`; the bots
(subagents) do bounded, disjoint, localized work.

This skill does not create branches, worktrees, or PRs while being validated.
During real work it owns one issue from context-gathering to a review-ready PR.

## The bridge

Planning lives in Linear; code lands as a GitHub PR; the two are stitched by
Linear's native GitHub integration. So:

- **One issue → one branch/worktree → one PR.** Preserve the convention: one
  issue to one branch/worktree to one PR unless the repo contract says otherwise.
- **The branch name carries the Linear issue id.** That id is the bridge — the PR
  auto-links and, on merge, auto-closes the issue. Never craft a branch that drops
  the id, or the bridge breaks.

## Required reading

Before editing, read:

1. The **repo contract** that `assembler` generated — Linear team/project/label
   map, domain glossary, branch/PR conventions, and the repo's build/test
   commands. Never hardcode commands or a tracker; read them from the contract.
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

- Cite `bus-first` for the implementation: reuse before you write, ship the
  minimum that works, never cut validation/security/error-handling/accessibility.
- Use `tdd` when the work is test-first / red-green-refactor.
- Use `diagnose` when the issue is a bug, failing check, exception, or regression.
- Use `dispatch` to triage — classify, prioritize, or route incoming work.
  `robots` only builds an already-tracked, ready issue; it does not triage.
- Hand the finished PR to `rocket-launch`. `robots` does not own closeout.

## Flow

1. Confirm scope, blockers, owned behavior, and the proof plan from the issue's
   acceptance criteria; create the one branch/worktree (id in the name) if absent.
2. Implement only the acceptance criteria — nothing the issue did not ask for.
3. Run the contract's targeted checks that prove the changed behavior.
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
- Implements only the acceptance criteria; reads commands from the repo contract.
- Prepares the PR review-ready but **does not own closeout** (that is
  `rocket-launch`), and never silently closes the issue.
