---
name: belt
description: Handoff carrier that moves durable context between agents or threads with concise state, proof, risks, and next actions, covering handoff, thread-control, and resume flows through lenses. Use when writing a handoff, deciding whether to continue or start a new thread, or resuming a repo task from durable state.
---

# Belt

Use when moving durable context between agents/threads with concise state, proof, risks, and next actions, covering handoff, thread-control, and resume flows through lenses, within the active issue, PR, or workflow packet.

## Operating Contract

- Role: Handoff carrier.
- Canonical name: `belt`; never render this package with `omp-`, `codex-`, or `claude-` prefixes.
- Primary modes: `shape`, `review`.
- After this entrypoint, load `AGENTS.md` for package governance, then the packet-named lens reference under `references/`, then the narrowest other relevant file.
- Do not apply generated files to live HOME, close issues, merge PRs, or widen beyond the packet.

## Request Modes

- `shape`: follow the shape boundary in the shared nucleus contract.
- `review`: follow the review boundary in the shared nucleus contract.

### Lenses

The input packet may carry a `lens` field. A named lens loads `references/lens-<name>.md`; when `lens` is absent, load the mode default. Lenses select guidance only; they never widen packet scope or change the mode boundary.

- `handoff` (default): compact the current work into a durable handoff document for a fresh agent. Loads `references/lens-handoff.md`.
- `thread-control`: decide whether to continue in the current thread or start a new one (absorbed from the retired `thread-control` skill). Loads `references/lens-thread-control.md`.
- `resume`: re-orient in an existing repo task from durable state before any edits (absorbed from the retired `resume-thread` skill). Loads `references/lens-resume.md`.

## Decision Authority

1. User goal and explicit constraints.
2. Active issue or PR acceptance criteria.
3. Verified repository code, tests, and live PR state.
4. Routed references in this package.
5. Accepted exemplars.
6. General heuristics.

## Workflow

1. Resolve mode, packet scope, and lens before acting.
2. Load the named lens reference (or the default `lens-handoff.md`), plus only the other references needed for the target surface.
3. Execute the smallest coherent step allowed by the packet and lens.
4. Return the required output packet and any coverage gaps.

## Standards or Rules

- Required input packet fields: `current state`, `lens`, `changed files`, `proof`, `risks`, `next action`.
- Required output packet fields: `handoff`, `proof summary`, `blockers`, `resume command/context`.
- Non-goals:
- Do not implement code
- Do not include transcripts by default
- Do not live-apply to real HOME
- Do not omit blockers

## Review Output

Report mode, lens, target surface, loaded references, rule IDs, proof run, and unresolved coverage gaps.

## Skill Integrity

This package is the canonical repo-local shared-agent package source for LOO-105. Update this package and the shared contract together; plugin bridge output must be rendered from this source, not hand-edited.
