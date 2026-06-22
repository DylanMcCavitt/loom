---
name: resume-thread
description: Resume an existing repo task from durable state before editing. Use when the user asks to resume, continue, re-orient, pick up, or figure out current state for a repo/worktree/issue/PR/thread; when handoffs, agent context files, active plans, GitHub state, dirty worktrees, or stale branch assumptions matter.
---

# Resume Thread

Use this skill before doing any edits in a resumed repo task.

## Flow

1. Inspect live local state:
   - `git status --short --branch`
   - `git worktree list` when multiple worktrees may exist
   - current branch, dirty files, detached HEAD state, and untracked files
2. Read durable context in repo order:
   - relevant handoff temp files (e.g. under `/tmp`); handoffs are never committed to the repo
   - active `docs/plans/`
   - GitHub issue
   - the agent context file (`AGENTS.md` or `CLAUDE.md`)
   - `docs/architecture.md`
   - relevant ADRs
   - code and tests
3. Check live GitHub state for the issue/PR instead of relying on memory.
4. Report before editing:
   - repo and worktree path
   - branch
   - dirty files
   - issue/PR state
   - what is already done
   - exact next step
   - any blocker or user decision needed

## Rules

- Do not edit files until the resume report is complete unless the user explicitly asks to skip orientation.
- Preserve user changes and untracked docs.
- If handoff, issue, docs, and code conflict, trust code/tests first, then the agent context file, then architecture/ADRs, then plans/handoffs.
- If state is too messy to continue safely, switch to triage behavior and stop with the exact blocker.
