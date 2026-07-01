---
name: deliverable-report
description: Create a final user-facing deliverable report after an issue chain or repo workflow completes. Use when the user asks for a clean summary, HTML deliverable, what changed report, issue-chain report, implementation recap, or artifact explaining what works, what does not, proof evidence, risks, and next actions.
---

# Deliverable Report

Use this skill only after implementation/proof/closeout work is done or explicitly paused for reporting.

## Flow

1. Gather evidence from live sources:
   - issues and PRs
   - merge commits
   - handoffs
   - checks
   - artifacts
   - important files changed
   - proof results and blockers
2. Separate:
   - what changed
   - what works
   - what does not work
   - what remains unproven
   - what is blocked
   - what should happen next
3. Produce a user-facing artifact in the requested format. If no format is specified, prefer a self-contained HTML report under the current workspace `outputs/` folder.

## Report Quality Bar

The report must be scannable and concrete:

- status strip
- issue/PR timeline
- before/after
- working/not working/unknown cards
- per-issue detail
- proof and evidence table
- risks and guardrails
- ordered next actions

Do not use generic marketing copy. Do not overstate readiness. If a proof halted, make the halt reason more prominent than the happy path.

## Rules

- Keep deliverables separate from implementation threads.
- Use live repo/GitHub state where practical.
- Include artifact paths and check results.
- If evidence is missing, say what is missing instead of filling gaps with assumptions.
