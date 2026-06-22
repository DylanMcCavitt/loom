---
name: repo-triage
description: Triage repo, issue, PR, branch, worktree, and blocker state without implementing. Use when the user asks what is next, what is blocked, what is dirty, what thread/issue to use, how to recover a stale/detached worktree, or when multiple threads/repos/PRs are active and state is unclear.
---

# Repo Triage

Use this skill to inspect and decide, not to implement.

## Flow

1. Inspect local repo state:
   - `git status --short --branch`
   - `git worktree list`
   - `git branch --show-current`
   - dirty/untracked files and detached HEAD state
2. Inspect live GitHub state when available:
   - open issues
   - open PRs
   - labels such as `ready-for-agent`, `ready-for-human`, `needs-info`, or repo-specific equivalents
   - merge/check/review status for relevant PRs
3. Read handoffs/plans/issues only as needed to resolve next action.
4. Classify each active item:
   - ready to implement
   - ready to prove
   - ready to review
   - ready to merge/close out
   - blocked
   - needs human decision
5. Recommend exactly one next thread mode and target.

## Output

Lead with:

- recommended next action
- reason
- repo/worktree/branch
- issue or PR
- blocker, if any

Then list supporting state: dirty worktrees, stale branches, open PRs, ready issues, and handoff gaps.

## Rules

- Do not edit implementation files.
- If a blocker is real, write or propose the shortest durable issue comment/handoff entry.
- Do not continue debugging indefinitely inside triage; stop once the next state is clear.
