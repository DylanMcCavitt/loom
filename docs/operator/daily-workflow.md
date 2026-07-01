# Loom daily workflow

Use this page when you are operating the workflow, not changing its internals.

## Start a project in a repo

1. Inspect the repo without writing to it:

   ```sh
   npm run factory -- scan --root <repo>
   ```

2. Create the local Factory Nucleus envelope:

   ```sh
   npm run factory -- init-envelope --root <repo>
   ```

3. Pick the tracker for this repo. Loom does not choose for you:

   ```sh
   npm run choose-tracker -- --root <repo>
   ```

4. Bind the selected tracker:

   ```sh
   npm run factory -- bind-tracker --root <repo> --provider linear --team <team> --project <project>
   # or
   npm run factory -- bind-tracker --root <repo> --provider github --repo <owner/name>
   ```

## Run the work lane

- New idea: `prospect` -> `blueprint` -> `ghosts`.
- Existing issue/ghost: `roboports` implements one tracked issue on one branch/PR.
- Drift or uncertainty: `radar` reports the next route without writing.
- Proof only: `proof-pass` collects evidence without expanding scope.
- Ready to merge: `rocket-launch` enforces launch gates.

## Tracker picker rule

Every repo starts with `tracker.provider: none`. The agent must ask which tracker
to bind for the project before planning or creating tracked work. Linear and
GitHub Issues are peers in the contract; the user's selection is the source of
truth for that repo.

## Health check

Run the read-only operator status:

```sh
npm run doctor
```
