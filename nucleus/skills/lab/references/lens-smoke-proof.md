# Lab lens: smoke-proof

Load this lens only when the packet names `smoke-proof`. It carries the proof-only validation stance absorbed from the retired `proof-pass` skill: grade whether implemented behavior actually works, separating code correctness from operational/platform/data readiness.

## Stance

Run only the validation the claim needs, with no feature expansion and no live side effects unless explicitly approved. The core discipline is honest grading: "code/checks pass" is not the same as "operational proof passed."

## Flow

1. Identify what claim is being proved.
2. Identify the acceptance criteria or proof standard.
3. Run only the validation needed for that claim:
   - tests/checks
   - local app smoke
   - browser verification (or hand the workflow to the `ui-proof` lens when UI evidence is the target)
   - read-only external service/platform checks when explicitly allowed
   - artifact generation
4. Capture evidence:
   - commands and results
   - artifact paths
   - screenshots/local URLs when relevant
   - logs or exact errors
5. State the proof class:
   - proven
   - partially proven
   - plumbing evidence only
   - blocked
   - unproven

## Evidence contract

Report:

- what was being proved
- what passed
- what failed
- artifacts created
- exact blocker
- whether this proof is countable or only plumbing evidence
- next action

## Judgment boundaries

- Do not add features or expand scope.
- Do not use live side effects unless explicitly approved.
- Do not call a run countable if data, external API access, permissions, or acceptance criteria are incomplete.
- Always separate "code/checks pass" from "operational proof passed"; a green unit suite with unreachable infrastructure is plumbing evidence, not proof.
