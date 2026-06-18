---
name: issue-autopilot
description: Use when the user asks to start, continue, or ship one tracked issue end-to-end.
---

# Issue Autopilot

Use this skill to run one tracked issue from context gathering through PR-ready closeout. It preserves the existing global rule: one issue/task to one branch/worktree to one PR unless repo docs explicitly say otherwise.

This skill does not create branches, worktrees, issues, or PRs while being validated. During real issue work, follow the repository's issue workflow and use the existing worktree or explicitly requested bootstrap flow.

## Required reading

Before editing, read:

1. The active issue, including comments and acceptance criteria.
2. The nearest repo-local `.omp/AGENTS.md` when present.
3. `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, and other `docs/agents/*` files when present.
4. Relevant architecture, design, release, ADR, or domain docs named by the issue.

## Specialist routing

Do not duplicate specialized workflows:

- Use `triage` when the issue needs classification, labels, state, or intake decisions before implementation.
- Use `diagnose` when the issue is a bug, failing check, exception, or performance regression.
- Use `tdd` when the user asks for test-first or red-green-refactor implementation.
- Use `handoff` when stopping, blocking, or preparing a next-thread transfer.

## Closeout behavior

For actionable implementation issues:

1. Confirm issue scope, blockers, owned behavior, and validation plan.
2. Implement only the acceptance criteria.
3. Run targeted checks that prove the changed behavior.
4. Prepare PR-ready evidence: changed files, checks run, unrun checks with reasons, and any remaining blockers.
5. Leave the issue ready for human review without silently closing it unless the user explicitly asked for manual closure.
