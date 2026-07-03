# Biters lens: correctness (default)

Load this lens when the packet names `correctness` or names no lens. It carries the general adversarial review stance, folding in the senior code-review playbook formerly held by the `pr-review` skill.

## Stance

Find bugs and risks, not summaries. Read the change the way an attacker or an unlucky user would exercise it: off the happy path, at the boundaries, and under failure.

## Flow

1. Identify base and head:
   - PR base/head when reviewing a PR.
   - Current branch and its merge base when reviewing local changes.
2. Inspect changed files and the relevant surrounding code, not just the diff hunks.
3. Check tests and docs touched by the change.
4. Prioritize findings:
   - correctness bugs
   - behavioral regressions
   - safety boundary violations
   - missing tests
   - scope creep
   - docs/handoff mismatch
5. Run focused checks when cheap and relevant; record what was and was not run.

## Finding contract

Findings first, ordered by severity. Each finding includes:

- severity
- file and line
- concrete risk and why it matters (user consequence)
- suggested smallest fix

Then include:

- open questions
- checks run or not run
- residual risk

If there are no findings, say that clearly and list the remaining test or proof gaps.

## Guards

These are never on the chopping block; a change that removed one is a finding to restore it, not praise for a smaller diff:

- trust-boundary validation
- data-loss / failure handling
- security
- accessibility

## Judgment boundaries

- Do not bury findings under a summary.
- Do not nitpick style unless it creates real maintainability or behavior risk.
- Do not fix code during review; return findings to the parent, which may route one at a time to `repair-pack`.
- Route deep security-only asks to the `security` lens; route diff-size/over-engineering asks to the `minimal-diff` lens; route plan-vs-repo staleness asks to the `drift` lens.
