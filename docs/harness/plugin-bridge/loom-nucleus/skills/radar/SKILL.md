---
name: radar
description: Checks Factory Nucleus drift without writing to trackers or blueprints, classifies the drift, and suggests the next route with evidence. Use when the user asks to check drift, compare planned ghosts against repo/tracker state, run radar, detect stale plans, or decide whether work needs inserter, roboports, proof-pass, or rocket-launch next.
---

# Radar

Radar scans for drift. It compares the current repo/tracker/proof evidence against
the planned factory state and reports what changed. V1 is **check-only**: it never
rewrites blueprints, edits ghosts, moves Linear state, or changes files.

## Read first

Read the repo envelope from `assembler`, the relevant ghosts, recent PR/proof
evidence, and any local factory state artifacts. Do not infer tracker state from a
branch name alone when an adapter or issue record is available.

## Drift classes

Report exactly one class:

- `none` — no relevant drift found.
- `low-risk` — minor drift that does not threaten the plan (cosmetic or easily re-proven).
- `material` — significant tracker, repo, or proof drift that needs work before launch.
- `unknown` — required evidence is missing or contradictory, so the drift cannot be classified.

## Output shape

Return a concise check artifact with:

- `driftClass`
- `affectedGhosts`
- `suggestedSyncActions`
- `suggestedRoute` (`inserter`, `roboports`, `proof-pass`, or `rocket-launch`)
- `evidence` references to issues, PRs, files, commands, or artifacts observed

## Routing

- No drift; launch-ready → `rocket-launch`.
- Low-risk drift; only the evidence needs refreshing → `proof-pass`.
- Material drift; implementation or branch work is needed → `roboports`.
- Drift cannot be classified; triage and sort first → `inserter`.

## Invariants

- Check-only: no tracker writes, blueprint rewrites, repo edits, or PR changes.
- Evidence-grounded: every drift claim cites what was read or run.
- Conservative: missing or conflicting evidence is `unknown`, not `none`.
