# Belt lens: resume

Load this lens only when the packet names `resume`. It carries the resume-from-durable-state playbook absorbed from the retired `resume-thread` skill: re-orient in an existing repo task before any edits happen.

## Flow

1. Inspect live local state:
   - `git status --short --branch`
   - `git worktree list` when multiple worktrees may exist
   - current branch, dirty files, detached HEAD state, and untracked files
2. Read durable context in repo order:
   - relevant handoff temp files (e.g. under the OS temp directory); handoffs are never committed to the repo
   - active plans (e.g. `docs/plans/`)
   - the tracker issue
   - the agent context file (`AGENTS.md` or `CLAUDE.md`)
   - architecture docs and relevant ADRs
   - code and tests
3. Check live tracker/PR state for the issue instead of relying on memory.
4. Report before editing:
   - repo and worktree path
   - branch
   - dirty files
   - issue/PR state
   - what is already done
   - exact next step
   - any blocker or user decision needed

## Conflict resolution

If handoff, issue, docs, and code conflict, trust code/tests first, then the agent context file, then architecture/ADRs, then plans/handoffs.

## Judgment boundaries

- Do not edit files until the resume report is complete, unless the user explicitly asks to skip orientation.
- Preserve user changes and untracked docs; never clean or overwrite them to get a tidy starting point.
- If state is too messy to continue safely, stop with the exact blocker and recommend a triage pass instead of guessing.
- Resume feeds the output packet's `resume command/context` field; a resume that ends without a concrete next step is incomplete.
