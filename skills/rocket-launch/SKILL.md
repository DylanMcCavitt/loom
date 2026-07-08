---
name: rocket-launch
description: Ship a ready change off-planet by enforcing the launch gates, merging the PR, and letting the bridge close its tracked issue. Use when a change is ready to ship — merge the PR, run the review gate, and close out the tracked issue; not for opening a draft or work that is not ready (that stays with `roboports`).
metadata:
  version: "0.3.0"
  changelog: "0.3.0 - tracker-neutral vocabulary for the bridge, gates, and closeout record"

---

# Rocket Launch

Ship a ready change off-planet. Enforce the launch gates, merge the PR, and let the bridge close the tracked issue, leaving a record a human can audit.

Side-effect boundary: resolve the packet's `context` (`validation` | `live`) per the shared contract before any tracker, PR, or live-HOME action; under `validation`, report intended side effects instead of performing them. During real closeout it owns the ship step for one ready change: gate, merge, and confirm the bridge closed the issue.

## The bridge

The branch name carries the tracked issue id and the PR's magic words auto-close that issue on merge. Closeout means **merge the PR and verify the bridge closed the issue** — never close the tracked issue by hand to fake a ship.

## Required reading

Before shipping, read:

1. The repo envelope `assembler` generated (tracker team/project/label map, commands, CI, merge policy). Do not hardcode commands, trackers, or merge style — read the envelope. If it is missing, route to `assembler` first.
2. The tracked issue with its full acceptance criteria, and the PR (branch, diff, CI status, review threads).

## Launch gates

ALL gates must be green before merge. A single red gate blocks the launch.

1. **Tests** — targeted tests for the changed behavior pass. Use `lab` with the `command-proof`, `smoke-proof`, or `ui-proof` lens as appropriate to gather proof (tests, local smoke, browser/desktop UI evidence, artifacts) for the claim being shipped.
2. **Review** — at least one `biters` `correctness` lens review is clean, or its findings are fixed. Run `biters` with the `correctness` lens and re-run it after fixes land.
3. **Acceptance** — every tracked acceptance criterion is checked against observed behavior, not assumed.
4. **CI** — CI is green on the PR head.
5. **Minimal diff** — a `biters` `minimal-diff` lens pass over the diff: minimal, no stray abstraction, nothing the issue did not ask for.

If any gate is red: stop, report which gate failed and why, and route the fix back to `roboports`. Do not merge.

## Launch

Once every gate is green:

1. Merge the PR per the envelope's merge policy.
2. Confirm the bridge closed the tracked issue (branch id + PR magic words). If it did not auto-close, repair the link rather than closing the issue by hand.
3. Run `node scripts/retro-packet.mjs --pr <merged-pr-number>` from the repo after merge. The generator creates a pending retro packet branch/worktree, writes decision-log, exemplar, rule, and coverage-gap candidates under `retro/pr-{number}/`, and prints the exact PR-creation command. Use `--pr-create` only when intentionally opening that retro PR.
4. Treat human review of the retro PR as the HITL gate for evidence write-back. Do not auto-merge the retro PR, and do not edit accepted skills/rules/exemplars from retro content until review approves the narrow destination.
5. Post a tracker status update (`save_status_update`) recording the ship: what merged, the gate outcomes, the proof, the PR link, and the retro packet PR/command.
6. Leave a human-reviewable record: gates run and their results, the merge commit / PR link, the retro packet branch, and any follow-ups.

## Invariants

- Never merges with a red gate.
- Never silently closes the issue: closeout goes through the bridge (merge) and the acceptance check, recorded in a tracker status update.
- Ships only what is ready — an unready change, a draft, or unfinished work routes back to `roboports`, never a forced merge.
- Leaves a human-reviewable record of the gates, the merge, and the pending retro write-back packet.
