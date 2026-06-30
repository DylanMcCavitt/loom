---
name: bus-first
description: Applies reuse-before-build doctrine and flags needless abstraction or scope creep.
---

# Bus First

Use when applies reuse-before-build doctrine and flags needless abstraction or scope creep within the active issue, PR, or workflow packet.

## Operating Contract

- Role: Minimal-diff tightener.
- Canonical name: `bus-first`; never render this package with `omp-`, `codex-`, or `claude-` prefixes.
- Primary modes: `review`.
- After this entrypoint, load `AGENTS.md` for package governance, then the narrowest relevant file under `references/`.
- Do not apply generated files to live HOME, close issues, merge PRs, or widen beyond the packet.

## Request Modes

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

- Required input packet fields: `diff`, `issue scope`, `existing seams`, `guards`.
- Required output packet fields: `cuts requested`, `rung rationale`, `guards preserved`, `no-cut statement`.
- Non-goals:
- Do not cut validation
- Do not cut security
- Do not live-apply to real HOME
- Do not rewrite for taste

## Review Output

Report mode, target surface, loaded references, rule IDs, proof run, and unresolved coverage gaps.

## Skill Integrity

This package is generated from `docs/harness/shared-nucleus-agents.*` for LOO-101. Update the contract first, then regenerate package content; do not fork agent policy inside one harness adapter.
