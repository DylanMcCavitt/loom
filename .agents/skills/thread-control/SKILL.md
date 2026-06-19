---
name: thread-control
description: Use when the user asks whether to continue in this chat, switch context, start a new thread, resume a handoff, or make context health visible.
---

# Thread Control

Decide whether the current chat is still safe to continue or whether the user should start a new visible thread. This skill is a router and decision aid. It does not write handoffs.

When switching is recommended, instruct the agent to use the existing `handoff` skill to create the handoff. Keep handoff content, templates, redaction rules, and storage location owned by `handoff`.

## Context-risk signals

Recommend a new thread when one or more of these signals materially threatens correctness:

- Many unrelated touched files.
- Changed goal since the thread began.
- Stale verification after important edits.
- Unresolved decisions that affect implementation direction.
- Active subagents with divergent scope.
- Duplicate subagents doing the same broad reads or reviews.
- Subagent findings that have not been integrated or explicitly rejected.
- Issue/branch mismatch.
- Stale file assumptions after edits or external changes.
- Side-conversation boundary or user interruption that changes which instructions are active.

## Decision output

Always show the decision to the user:

- `Continue here` when context is coherent, the goal is stable, and verification evidence is fresh.
- `Start a new thread` when risk signals make a clean handoff safer.

## Next-thread starter

When switching, emit a visible starter the user can paste into the next thread:

```text
Use the handoff skill to resume this work. Start from the handoff artifact, verify the current branch/worktree and active issue, re-read the touched files before editing, and continue only after confirming the latest validation evidence.
```

## Subagent cleanup note

When the context risk is caused by subagent fanout, name the exact active agents, their scopes, and whether their findings were integrated. If two agents were given overlapping scopes, recommend collapsing future review into one reviewer or splitting lenses before any new fanout.
