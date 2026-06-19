---
name: agent-recipes
description: Use when the user wants to spawn agents from a short intent such as review, debug, tests, parallel implementation, or issue work.
---

# Agent Recipes

Turn a short spawning intent into complete, non-duplicative `task` subagent assignments. This skill helps the main agent write sharper assignments; it does not spawn subagents by itself.

## Efficiency rules

The main agent owns issue intake, implementation, integration, fixing review findings, final checks, commit, push, and PR. Do not create separate subagents for "read the issue", "implement", "review findings", and "fix findings" unless each subagent has a truly disjoint output and the main agent remains the integrator.

Use the smallest useful fanout:

- `0 subagents`: trivial edits, direct answers, or low-risk single-file changes.
- `1 reviewer`: small or medium implementation that needs independent review.
- `2 reviewers`: non-trivial issue work where acceptance and safety/privacy/maintainability need separate lenses.
- `1 scout + reviewers`: broad or ambiguous issues where discovery would pollute the main thread; scout before implementation, reviewers after implementation.
- `multiple workers`: only for disjoint write scopes, such as validator script vs docs vs tests.

Always batch independent tasks in one `task` call. Do not serialize work that can run concurrently. Every assignment must include `# Target`, `# Change`, and `# Acceptance`, and must explicitly tell the subagent to skip project-wide gates, formatters, build, lint, and test suites. The main agent runs verification once across the union of changed files.

Before review fanout, the main agent should prepare a review packet: issue acceptance criteria, changed-file list, relevant diff or excerpts, checks already run, and exact questions. Reviewers should prefer the packet and inspect only the files needed for their assigned scope.

Do not give multiple reviewers the same broad instruction to read every changed file unless duplicated reads are acceptable. Split reviewer scopes by question, not just by title.

## Default issue fanout

For one-issue PR work, default to this sequence:

1. Main agent reads issue/docs and implements the first pass.
2. Main agent runs focused local checks and prepares a review packet.
3. One or two review subagents inspect distinct scopes in parallel.
4. Main agent fixes real findings, reruns final checks, and owns PR closeout.

## Review recipe

Role: `Scoped reviewer`

```text
# Target
Review only the packet, files, and symbols named by the main agent. Do not inspect unrelated packages. If another reviewer is assigned, stay in your lane and do not duplicate their scope.

# Change
Identify risks for the assigned lens only, such as acceptance/spec compliance or safety/privacy/maintainability. Do not edit files. Do not run project-wide gates, formatters, build, lint, or tests.

# Acceptance
Return only actionable findings with file paths, line numbers, observed evidence, and the minimal fix needed. Say "No findings" only after checking the named target.
```

## Debug recipe

Role: `Failure reproducer and root-cause analyst`

```text
# Target
Investigate the named failing command, test, issue, or code path. Stay inside the provided files and reproduction steps.

# Change
Reproduce or trace the failure, isolate the smallest likely cause, and propose the source fix. Do not edit files unless the main agent explicitly assigns implementation. Do not run project-wide gates, formatters, build, lint, or tests.

# Acceptance
Report the failing input, observed error, root cause, and exact next edit or diagnostic gap.
```

## Tests recipe

Role: `Behavior-focused test writer`

```text
# Target
Add or update tests for the named behavior and edge cases only. Own only the named test files. Do not refactor production code unless required for testability and approved by the main agent.

# Change
Create tests that assert behavior, invariants, error handling, and edge values. Avoid brittle default-string assertions unless the user-visible contract requires exact text. Do not run project-wide gates, formatters, build, lint, or tests.

# Acceptance
Return the test files changed, behaviors covered, and any production seams that still need main-agent implementation.
```

## Parallel implementation recipe

Role: `Scoped implementation specialist`

```text
# Target
Implement one named slice in the exact files and symbols assigned. Use this only when write scopes are disjoint. Do not edit shared contracts unless coordinated with the main agent.

# Change
Make the smallest source change that satisfies the slice. Preserve existing conventions and unrelated user changes. Do not run project-wide gates, formatters, build, lint, or tests.

# Acceptance
Report changed files, satisfied acceptance criteria, and any local assumptions the main agent must verify.
```

## Issue work recipe

Role: `One-issue scoped helper`

```text
# Target
Support the named tracked issue in its existing issue worktree and branch. Do not create another worktree or branch. Do not own final issue integration or PR closeout.

# Change
Handle only the bounded slice assigned by the main agent: scout, isolated implementation, targeted tests, or scoped review. Preserve one issue to one branch/worktree to one PR. Do not run project-wide gates, formatters, build, lint, or tests.

# Acceptance
Return the issue number, files inspected or changed, acceptance criteria covered, and targeted checks or findings the main agent should integrate before PR closeout.
```
