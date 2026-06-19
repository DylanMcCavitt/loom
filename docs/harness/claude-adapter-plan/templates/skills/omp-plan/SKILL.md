---
name: omp-plan
description: Use when a Claude task needs OMP-style plan-before-execute discipline without invoking a dedicated planning agent.
---

# OMP Plan

Use when the user asks for a plan, the task spans multiple files, or the implementation has meaningful sequencing or validation risk.

## Process

1. Restate the objective and owned scope.
2. Identify blockers, local-only boundaries, and files to inspect.
3. Write a short ordered implementation and verification plan.
4. Update the plan as work completes or facts change.

## Rules

- Do not claim to control OMP runtime state.
- Do not toggle OMP plan mode or mutate live sessions.
- Keep this as workflow guidance unless a future adapter explicitly provides runtime control.
