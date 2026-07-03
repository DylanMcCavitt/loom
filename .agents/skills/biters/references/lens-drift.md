# Biters lens: drift

Load this lens only when the packet names `drift`. It carries the workflow-drift check absorbed from the retired `radar` agent: compare current repo/tracker/proof evidence against the planned state and report what changed. Check-only — never rewrite plans, edit issues, move tracker state, or change files.

## Read first

Read the repo envelope, the relevant planned issues/specs, recent PR/proof evidence, and any local workflow state artifacts. Do not infer tracker state from a branch name alone when an adapter or issue record is available.

## Drift classes

Report exactly one class:

- `none` — no relevant drift found.
- `low-risk` — minor drift that does not threaten the plan (cosmetic or easily re-proven).
- `material` — significant tracker, repo, or proof drift that needs work before launch.
- `unknown` — required evidence is missing or contradictory, so the drift cannot be classified.

## Finding contract

Return a concise check artifact with:

- `driftClass`
- affected planned items (issues, specs, decomposition slices)
- suggested sync actions
- suggested route: blueprint triage lens (re-sort/triage first), `roboports` (implementation or branch work needed), lab smoke-proof lens (only the evidence needs refreshing), or `rocket-launch` (no drift, launch-ready)
- `evidence` references to issues, PRs, files, commands, or artifacts observed

## Routing

- No drift; launch-ready → `rocket-launch`.
- Low-risk drift; only the evidence needs refreshing → lab `smoke-proof` lens.
- Material drift; implementation or branch work is needed → `roboports`.
- Drift cannot be classified; triage and sort first → blueprint `triage` lens.

## Invariants

- Check-only: no tracker writes, plan rewrites, repo edits, or PR changes.
- Evidence-grounded: every drift claim cites what was read or run.
- Conservative: missing or conflicting evidence is `unknown`, not `none`.
