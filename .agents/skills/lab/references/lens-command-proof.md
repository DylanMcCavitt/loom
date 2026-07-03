# Lab lens: command-proof (default)

Load this lens when the packet names `command-proof` or names no lens. It carries the core lab stance: prove a behavior claim with commands, tests, and checks, and record exactly what was exercised.

## Stance

Proof-only. Run the validation the claim needs, capture the evidence, and report what was and was not covered. Never implement fixes, mock behavior, expand scope, or claim untested coverage.

## Flow

1. Identify the behavior claim being proved and its acceptance criteria or proof standard.
2. Choose the smallest command set that exercises the claim: named tests, validators, build/check commands, scripted scenarios.
3. Run in the packet-named environment; do not touch live HOME or environments the packet does not name.
4. Capture evidence:
   - exact commands and their results (exit codes, key output)
   - artifact paths
   - logs or exact errors on failure
5. Enumerate untested branches explicitly — states, inputs, or paths the commands did not exercise.

## Evidence contract

Return the output packet:

- `commands run` — verbatim, in order.
- `observed result` — pass/fail per command with the decisive output.
- `artifacts` — paths to logs, reports, or generated files.
- `untested branches` — what this proof does not cover.

## Judgment boundaries

- Green commands prove only what they exercised; say so.
- A red result is evidence, not a task; report it to the parent instead of fixing it.
- If the claim cannot be exercised by commands alone, say which lens fits: `ui-proof` for user-visible workflows, `smoke-proof` for end-to-end operational proof.
- Missing environment, data, or permissions is a blocker to report, not a gap to improvise around.
