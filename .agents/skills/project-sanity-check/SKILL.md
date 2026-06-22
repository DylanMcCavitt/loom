---
name: project-sanity-check
description: Audit a repo for workflow friction before issue work starts. Use when the user wants projects to go smoother, asks for a repo workflow check, onboarding readiness, issue-thread readiness, handoff/doc/check validation, worktree hygiene, CI/local command discovery, or a preflight before creating/continuing issue threads.
---

# Project Sanity Check

Use this skill before starting a new issue chain or when a repo repeatedly creates friction.

## Flow

1. Inspect local state:
   - `git status --short --branch`
   - `git worktree list`
   - default branch and remotes
   - dirty/untracked/generated files
2. Inspect workflow docs:
   - `AGENTS.md`
   - `CONTEXT.md`
   - `docs/architecture.md`
   - `docs/adr/`
   - `docs/plans/`
   - `docs/handoffs/`
3. Inspect issue/PR state when GitHub is available:
   - ready labels
   - blocked issues
   - open PRs
   - stale branches
   - missing issue templates or PR templates
4. Discover validation commands:
   - package manager
   - test/lint/typecheck/build commands
   - local app/run commands
   - required environment setup
5. Identify friction:
   - missing or stale handoff
   - unclear acceptance criteria
   - no documented checks
   - dirty canonical main
   - detached worktree
   - generated files polluting lint/git
   - docs not matching code
   - external proof conflated with code correctness

## Output

Lead with a short readiness verdict:

- `ready`: issue work can start
- `needs triage`: state is unclear
- `blocked`: exact blocker must be fixed first

Then provide:

- recommended next action
- exact repo/worktree/branch
- checks to run
- docs to update
- issues/PRs needing attention
- one or two concrete workflow improvements

## Rules

- Do not implement feature work during sanity check.
- If changes are needed, prefer small docs/checklist fixes or create a follow-up issue.
- Do not overbuild process; only add structure that prevents a repeated failure.
