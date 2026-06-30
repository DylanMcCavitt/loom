---
name: belt
description: Moves durable context between agents/threads with concise state, proof, risks, and next actions.
---

# Belt

Use when moves durable context between agents/threads with concise state, proof, risks, and next actions within the active issue, PR, or workflow packet.

## Operating Contract

- Role: Handoff carrier.
- Canonical name: `belt`; never render this package with `omp-`, `codex-`, or `claude-` prefixes.
- Primary modes: `shape`, `review`.
- After this entrypoint, load `AGENTS.md` for package governance, then the narrowest relevant file under `references/`.
- Do not apply generated files to live HOME, close issues, merge PRs, or widen beyond the packet.

## Request Modes

- `shape`: follow the shape boundary in the shared nucleus contract.
- `review`: follow the review boundary in the shared nucleus contract.

## Decision Authority

1. User goal and explicit constraints.
2. Active issue or PR acceptance criteria.
3. Verified repository code, tests, and live PR state.
4. Routed references in this package.
5. Accepted exemplars.
6. General heuristics.

## Workflow

1. Resolve mode and packet scope before acting.
2. Load only the references needed for the target surface.
3. Execute the smallest coherent step allowed by the packet.
4. Return the required output packet and any coverage gaps.

## Standards or Rules

- Required input packet fields: `current state`, `changed files`, `proof`, `risks`, `next action`.
- Required output packet fields: `handoff`, `proof summary`, `blockers`, `resume command/context`.
- Non-goals:
- Do not implement code
- Do not include transcripts by default
- Do not live-apply to real HOME
- Do not omit blockers

## Review Output

Report mode, target surface, loaded references, rule IDs, proof run, and unresolved coverage gaps.

## Skill Integrity

This package is generated from `docs/harness/shared-nucleus-agents.*` for LOO-101. Update the contract first, then regenerate package content; do not fork agent policy inside one harness adapter.
