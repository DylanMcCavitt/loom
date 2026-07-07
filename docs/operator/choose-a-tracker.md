# Choose a tracker

Loom does not pick a planning tracker for you. Every repo starts with `tracker.provider: none` in the local Factory Nucleus envelope until you bind one.

## Supported providers

The factory bridge supports two peer adapters:

| Provider | When to use | Bind command |
| --- | --- | --- |
| **GitHub Issues** | Default for public repos — no extra accounts beyond GitHub | `npm run factory -- bind-tracker --root <repo> --provider github --repo <owner/name>` |
| **Linear** | Personal or team planning on Linear | `npm run factory -- bind-tracker --root <repo> --provider linear --team <team> --project <project>` |

GitHub still owns code delivery (branch, worktree, PR, CI). The selected tracker owns ghosts and planning state; closeout text bridges back to GitHub for review and merge.

## Where state lives

- **Committed:** `.loom.yml` at the repo root — factory identity pointer only (`factory: loom`).
- **Never committed:** envelope policy under `~/.loom/factory-nucleus/<factory-id>/envelope/envelope.yaml` (tracker binding, proof commands, delivery defaults).

See [envelope-bootstrap.md](./envelope-bootstrap.md) for fresh-VM setup.

## Operator flow

1. Present options (optional):

   ```sh
   npm run choose-tracker -- --root <repo>
   ```

2. Bind the user's choice:

   ```sh
   npm run factory -- bind-tracker --root <repo> --provider github --repo owner/repo
   # or
   npm run factory -- bind-tracker --root <repo> --provider linear --team TEAM --project "Project Name"
   ```

3. Verify with `npm run factory -- scan --root <repo>` or `npm run doctor`.

Daily issue work continues in [daily-workflow.md](./daily-workflow.md).

