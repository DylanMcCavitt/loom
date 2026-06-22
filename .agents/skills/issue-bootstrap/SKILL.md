---
name: issue-bootstrap
description: Bootstrap a local GitHub issue worktree for implementation threads. Use when the user wants a setup flow for a GitHub issue, asks to prepare a branch/worktree before starting an implementation thread, or says the implementation thread should start inside an issue worktree.
---

# Issue Bootstrap

Create the local worktree/branch for one GitHub issue, then stop. This skill is
for the small setup thread, not the implementation thread.

## Required input

- GitHub issue number, e.g. `#107`.
- Optional branch name. If missing, derive `feat/issue-<N>-<slug>` from the
  issue title.
- Optional worktree path. If missing, use:
  `$HOME/.worktrees/issue-<N>/<repo-folder-name>`.

## Workflow

1. Confirm the repo and issue tracker.
   - Run `git status --short --branch`.
   - Read `docs/agents/issue-tracker.md` if present.
   - Run `gh issue view <N> --comments`.

2. Protect the canonical checkout.
   - If the checkout has tracked local changes, stop and ask before switching
     branches or pulling.
   - Untracked files may be ignored only if they are unrelated and the user has
     not asked to clean them.

3. Sync the default branch.
   - Prefer the repo default branch from `origin/HEAD`; otherwise use `main`.
   - Run `git switch <default-branch>`.
   - Run `git pull --ff-only origin <default-branch>`.
   - Verify `HEAD == origin/<default-branch>`.

4. Create or reuse the issue worktree.
   - If the target worktree already exists, inspect it instead of recreating it.
   - If the branch already exists, reuse it only when it points at the intended
     worktree or is clearly the issue branch.
   - Otherwise run:

```bash
git worktree add <worktree-path> -b <branch-name> <default-branch>
```

5. Verify the worktree.
   - Run `git -C <worktree-path> status --short --branch`.
   - Run `git -C <worktree-path> rev-parse --abbrev-ref HEAD`.
   - Do not implement the issue in this setup thread.

## Final response

Return only the actionable handoff:

- issue number and title
- worktree path
- branch name
- verification status
- copy-paste prompt for the implementation thread

Use this implementation prompt shape:

```text
Work on GitHub issue #<N> using the repo's GitHub issue flow.

You are already in the issue worktree and branch. Do not create another
worktree.

Read:
1. gh issue view <N> --comments
2. AGENTS.md
3. docs/agents/issue-tracker.md
4. docs/agents/triage-labels.md
5. relevant architecture/design/release docs

Implement only this issue, run targeted checks, open/update a PR, comment the
PR link and validation summary back on the GitHub issue, and leave it ready for
human review.
```
