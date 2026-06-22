# Workflow — Per-Issue Lifecycle

One issue -> one isolated worktree -> one branch -> one PR.

## Preconditions

- default branch is current and green
- blockers are merged
- issue packet is complete

## Read order

1. `docs/NEXT_THREAD_HANDOFF.md`
2. `docs/HANDOFF.md`
3. `docs/PLAN.md`
4. `docs/issues/<ISSUE>.md`

## Runbook

1. Create or confirm isolated worktree + issue branch.
2. Run alignment review and commit `ALIGNMENT.md`.
3. Execute only the packet scope.
4. Remove branch-local `ALIGNMENT.md`.
5. Open or update the PR on the same branch.
6. Run PR review.
7. Merge only when branch is current with the default branch and CI is green.
8. Update `docs/NEXT_THREAD_HANDOFF.md`.
9. Mark the issue complete in the planning system.

## Issue packet contract

Every issue packet should include:

- metadata
- objective
- scope
- non-goals
- constraints
- acceptance criteria
- owned paths
- files touched (expected)
- verification commands
- required evidence
