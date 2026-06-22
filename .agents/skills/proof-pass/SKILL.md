---
name: proof-pass
description: Run proof-only validation for implemented behavior without feature expansion. Use when the user asks to prove, verify, smoke test, browser test, run live/local evidence, produce artifacts, check whether something works, or separate code correctness from operational/platform/data readiness.
---

# Proof Pass

Use this skill after implementation or when the user asks whether behavior actually works.

## Flow

1. Identify what claim is being proved.
2. Identify the acceptance criteria or proof standard.
3. Run only validation needed for that claim:
   - tests/checks
   - local app smoke
   - browser verification
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

## Rules

- Do not add features.
- Do not expand scope.
- Do not use live side effects unless explicitly approved.
- Do not call a run countable if data, external API access, permissions, or acceptance criteria are incomplete.
- Separate "code/checks pass" from "operational proof passed."

## Output

Report:

- what was being proved
- what passed
- what failed
- artifacts created
- exact blocker
- whether this proof is countable or only plumbing evidence
- next action
