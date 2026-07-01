---
name: omp-handoff
description: Use when blocked, paused, or transferred repo work needs an OMP-style handoff so another thread or human can resume it.
---

# OMP Handoff

Use when work needs to be resumed by another thread or human reviewer.

## Process

1. Record the objective, branch/worktree, issue/PR, and exact status.
2. List touched files, validation run, and validation not run.
3. Name blockers, unsafe boundaries, and next actions.
4. Keep private runtime, session, history, cache, daemon, and auth details out of the handoff.

## Rules

- Do not claim to control OMP runtime state.
- Do not spawn or resume OMP sessions from this skill.
- Keep the handoff factual and reviewable.
