---
name: omp-btw
description: Use when a bounded side question arrives mid-task and must be answered without losing the main thread.
---

# OMP Btw

Use when a side question or quick aside arrives during a larger task and must be answered without derailing the primary work.

## Process

1. Capture the current objective and where the main task is paused.
2. Answer the side question directly and concisely.
3. Note any follow-up the aside surfaced, then return to the main task.

## Rules

- Do not spawn or resume an OMP runtime subthread; this is workflow guidance only.
- Keep the aside bounded; do not let it silently expand the main scope.
- Do not claim to control OMP runtime state.
