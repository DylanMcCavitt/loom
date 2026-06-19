---
name: issue-autopilot
description: Use when the user asks to start, continue, or ship one tracked issue end-to-end.
---

# Issue Autopilot

Use this skill to run one tracked issue from context gathering through PR-ready closeout. It preserves the existing global rule: one issue/task to one branch/worktree to one PR unless repo docs explicitly say otherwise.

This skill does not create branches, worktrees, issues, or PRs while being validated. During real issue work, follow the repository's issue workflow and use the existing worktree or explicitly requested bootstrap flow.

The main agent owns issue intake, implementation, integration, fixing review findings, final verification, commit, push, and PR. Subagents may support bounded scouting, isolated implementation slices, targeted tests, or independent review, but they do not own issue closeout.

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

## Subagent fanout

Use subagents only when they reduce risk or context load.

Default one-issue flow:

1. Main agent reads the issue and repo docs.
2. Main agent implements the first pass.
3. Main agent runs focused checks and prepares a review packet.
4. Run one or two scoped review subagents in parallel when the change is non-trivial.
5. Main agent fixes real findings and runs final checks once across the union.

Do not spawn separate subagents for "read issue", "implement", "review findings", and "fix findings" by default. That makes coordination the work. Use implementation subagents only for disjoint write scopes, and give reviewers distinct lenses such as acceptance/spec versus safety/privacy/maintainability.

Review packet contents:

- issue acceptance criteria
- changed-file list
- relevant diff or excerpts
- checks already run
- exact questions for each reviewer
- explicit instruction to skip project-wide gates

## Closeout behavior

For actionable implementation issues:

1. Confirm issue scope, blockers, owned behavior, and validation plan.
2. Implement only the acceptance criteria.
3. Run targeted checks that prove the changed behavior.
4. Run scoped reviewer subagents when warranted, fix real findings, and rerun relevant checks.
5. Prepare PR-ready evidence: changed files, checks run, reviewer findings, unrun checks with reasons, and any remaining blockers.
6. Leave the issue ready for human review without silently closing it unless the user explicitly asked for manual closure.
