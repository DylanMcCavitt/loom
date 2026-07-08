# Loom daily workflow

Use this page when you are operating the workflow, not changing its internals.

## Start a project in a repo

1. Confirm you are in the intended checkout:

   ```sh
   npm run guard:worktree
   ```

2. Confirm the repo gate is green before assigning work:

   ```sh
   npm run check
   ```

3. Bind planning work to the tracker selected by the project. Linear and GitHub
   Issues are peers in the contract; the user's selection is the source of truth
   for that repo.

## Run the work lane

- New idea: `prospect` -> `blueprint` (spec, then issue-decomposition lens).
- Existing issue/ghost: `roboports` implements one tracked issue on one branch/PR.
- Drift or uncertainty: `biters` (drift lens) reports the next route without writing.
- Proof only: `lab` (smoke-proof lens) collects evidence without expanding scope.
- Ready to merge: `rocket-launch` enforces launch gates.

Before step zero of any agent brief or loop iteration, run `npm run guard:worktree` from the intended checkout: a primary-checkout/non-default-branch failure means the agent must move into a linked worktree, a primary-dirty failure means the primary checkout has uncommitted changes that could bleed into linked worktrees, and a duplicate-branch failure means one issue branch is checked out in more than one worktree and one checkout must be removed or switched.

## Run evals

Use [`evals.md`](evals.md) for the eval ladder cadence: always-on `npm run check`,
opt-in judge after skill-text changes, roboports materialize → external worker →
`--score` for doctrine changes, and `--ablate` only when claiming uplift.

## Tracker picker rule

Every repo starts with `tracker.provider: none`. The agent must ask which tracker
to bind for the project before planning or creating tracked work. Linear and
GitHub Issues are peers in the contract; the user's selection is the source of
truth for that repo.

