---
name: thread-closeout
description: Close a repo thread cleanly by merging or stopping with exact state. Use when the user asks to close out, merge, sync main, update handoff, stop before merge, create the next issue thread, archive current state, or report final branch/PR/check/review/blocker status.
---

# Thread Closeout

Use this skill before leaving a repo thread.

## Flow

1. Inspect live state:
   - git status
   - branch/worktree
   - PR/issue state
   - checks/review state
2. Confirm user intent:
   - merge approved
   - stop before merge
   - blocked
   - create next issue/thread
3. If merging is approved:
   - verify checks/review
   - merge PR
   - sync canonical `main`
   - clean stale branch/tracking state where safe
4. If not merging:
   - leave PR open or branch as-is
   - update handoff
   - report what remains
5. If blocked:
   - write a short issue/PR/handoff blocker note
   - stop instead of continuing around the blocker

## Closeout Report

Always report:

- repo path
- worktree path
- branch
- issue
- PR
- merge state
- canonical main sync state
- checks run and result
- review result
- files changed
- handoff path
- blocker, if any
- exact next issue/thread/action

## Rules

- Use live GitHub state, not stale memory.
- Never revert user changes.
- Do not claim merged until remote PR and canonical main state are verified.
- Do not start a new issue before the current thread is closed or clearly blocked.
