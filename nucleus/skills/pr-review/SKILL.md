---
name: pr-review
description: Review a branch, diff, or PR with a senior code-review stance. Use when the user asks to review code, review a PR, run subagent-style review, inspect changes before merge, find bugs, check scope, assess tests, or validate handoff/docs alignment.
---

# PR Review

Use this skill to find bugs and risks, not to summarize first.

## Flow

1. Identify base and head:
   - PR base/head when reviewing a PR
   - current branch and merge base when reviewing local changes
2. Inspect changed files and relevant surrounding code.
3. Check tests and docs touched by the change.
4. Prioritize findings:
   - correctness bugs
   - behavioral regressions
   - safety boundary violations
   - missing tests
   - scope creep
   - docs/handoff mismatch
5. Run focused checks if cheap and relevant.

## Output

Findings first, ordered by severity. Each finding should include:

- severity
- file and line
- concrete risk
- why it matters
- suggested fix

Then include:

- open questions
- checks run or not run
- residual risk

If there are no findings, say that clearly and list remaining test or proof gaps.

## Rules

- Do not bury findings under a summary.
- Do not nitpick style unless it creates real maintainability or behavior risk.
- Do not fix code during review unless the user asks for review-and-fix.
