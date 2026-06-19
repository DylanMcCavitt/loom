---
name: execute-plan
description: Use when the user says go, execute, proceed, ship the current plan, or stop discussing and implement.
---

# Execute Plan

Use this skill when the user has already approved the current plan and wants implementation to start. This skill is not an issue closeout workflow and does not prepare PR evidence by itself.

## Operating rules

- Convert any explicit user checklist, numbered list, phase list, or specification acceptance list into todos before work starts. Preserve every item as its own task.
- Delegate only when it is efficient: independent scouting, distinct review lenses, targeted tests, or disjoint implementation write scopes. Batch independent tasks in one `task` call.
- Continue implementing instead of re-litigating the plan. Ask only for missing external decisions that tools, repository context, docs, or issue state cannot answer.
- Preserve unrelated user changes and existing repo conventions.
- Verify the affected behavior before yielding. Verification must match the changed behavior, not just compile a scaffold.

## Subagent discipline

The main agent remains the integrator. It owns implementation direction, resolving conflicts, fixing review findings, and final verification.

Prefer this efficient sequence for implementation work:

1. Main agent implements the first pass.
2. Main agent prepares a compact packet when review is needed.
3. One or two reviewers inspect distinct scopes in parallel.
4. Main agent fixes findings and runs final checks.

Do not create default subagents for every phase. In particular, avoid separate "review issue", "implement", "review findings", and "fix findings" agents unless the scopes are disjoint and the user explicitly wants that workflow.

## Boundaries

Do not close issues, create PR closeout summaries, or claim issue acceptance criteria are complete unless the active tracked issue workflow separately requires that. If the user asks to ship one tracked issue end-to-end, route to `issue-autopilot` instead.
