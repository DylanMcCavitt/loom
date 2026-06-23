---
name: rocket-launch
description: Ship a ready change off-planet by enforcing the launch gates, merging the PR, and letting the bridge close its Linear issue. Use when a change is ready to ship — merge the PR, run the review gate, and close out the Linear issue; not for opening a draft or work that is not ready (that stays with `robots`).
---

# Rocket Launch

Ship a ready change off-planet. Enforce the launch gates, merge the PR, and let the bridge close the Linear issue, leaving a record a human can audit.

This skill does not merge PRs, close issues, or post status updates while being validated. During real closeout it owns the ship step for one ready change: gate, merge, and confirm the bridge closed the issue.

## The bridge

The branch name carries the Linear issue id and the PR's magic words auto-close that issue on merge. Closeout means **merge the PR and verify the bridge closed the issue** — never close the Linear issue by hand to fake a ship.

## Required reading

Before shipping, read:

1. The repo contract `assembler` generated (Linear team/project/label map, commands, CI, merge policy). Do not hardcode commands, trackers, or merge style — read the contract. If it is missing, route to `assembler` first.
2. The Linear issue with its full acceptance criteria, and the PR (branch, diff, CI status, review threads).

## Launch gates

ALL gates must be green before merge. A single red gate blocks the launch.

1. **Tests** — targeted tests for the changed behavior pass. Use `proof-pass` to gather the proof (tests, local smoke, browser, artifacts) for the claim being shipped.
2. **Review** — at least one review-subagent lens is clean, or its findings are fixed. Run `pr-review` for the lens and re-run it after fixes land.
3. **Acceptance** — every Linear acceptance criterion is checked against observed behavior, not assumed.
4. **CI** — GitHub CI is green on the PR head.
5. **Minimal diff** — a `bus-first` pass over the diff: minimal, no stray abstraction, nothing the issue did not ask for.

If any gate is red: stop, report which gate failed and why, and route the fix back to `robots`. Do not merge.

## Launch

Once every gate is green:

1. Merge the PR per the contract's merge policy.
2. Confirm the bridge closed the Linear issue (branch id + PR magic words). If it did not auto-close, repair the link rather than closing the issue by hand.
3. Post a Linear status update (`save_status_update`) recording the ship: what merged, the gate outcomes, the proof, and the PR link.
4. Leave a human-reviewable record: gates run and their results, the merge commit / PR link, and any follow-ups.

## Invariants

- Never merges with a red gate.
- Never silently closes the issue: closeout goes through the bridge (merge) and the acceptance check, recorded in a Linear status update.
- Ships only what is ready — an unready change, a draft, or unfinished work routes back to `robots`, never a forced merge.
- Leaves a human-reviewable record of the gates and the merge.
