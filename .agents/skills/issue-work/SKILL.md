---
name: issue-work
description: Execute one GitHub issue from an already-created local issue worktree. Use when the user asks to work on a GitHub issue using the repo's issue flow, especially after a bootstrap thread has created the branch/worktree.
---

# Issue Work

Implement one GitHub issue from inside its existing worktree. Do not create a
new worktree from this skill.

## Startup checks

1. Confirm location and branch.
   - Run `git status --short --branch`.
   - Run `git branch --show-current`.
   - If the branch is `main`, the checkout is detached, or the cwd is the
     canonical repo instead of an issue worktree, stop and ask the user to run
     the bootstrap skill first.

2. Read the issue and repo flow.
   - Run `gh issue view <N> --comments`.
   - Read `AGENTS.md`.
   - Read `docs/agents/issue-tracker.md`.
   - Read `docs/agents/triage-labels.md`.
   - Read relevant domain docs only: architecture, design, release,
     or ADR docs that match the issue.

3. Confirm scope.
   - Summarize the issue goal, blockers, owned behavior, and validation plan.
   - If the issue is not actionable, comment the blocker on the issue and stop.

## Implementation workflow

1. Implement only the GitHub issue scope.
   - Preserve unrelated local changes.
   - Do not widen scope; create or recommend a follow-up issue for adjacent
     findings.
   - Follow repo-specific build/test/design rules from `AGENTS.md`.

2. Validate.
   - Run targeted tests/checks for the touched behavior.
   - For UI/native app work, include simulator or device review steps when
     feasible.
   - If a required check cannot run, record why and what remains risky.

3. Commit and publish.
   - Stage specific files only.
   - Use the repo's commit style.
   - Push the issue branch.
   - Open or update a PR against the default branch.
   - Include `Closes #<N>` in the PR body unless the user asks not to.

4. Update GitHub issue state.
   - Comment on the issue with PR URL, checks run, review steps, and blockers.
   - If labels exist, add `ready-for-human` and remove `ready-for-agent`.
   - Do not close the issue manually unless the user explicitly asks; let the
     PR merge close it when `Closes #<N>` is present.

## Final response

Keep the closeout short:

- PR URL
- branch name
- checks run
- any unrun checks or blockers
- whether the issue was labeled/commented for human review
