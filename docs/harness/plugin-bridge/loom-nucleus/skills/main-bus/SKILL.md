---
name: main-bus
description: Plans shared lanes/seams so features plug into existing structure instead of parallel spaghetti.
---

# Main Bus

Use when plans shared lanes/seams so features plug into existing structure instead of parallel spaghetti within the active issue, PR, or workflow packet.

## Operating Contract

- Role: Architecture seam planner.
- Canonical name: `main-bus`; never render this package with `omp-`, `codex-`, or `claude-` prefixes.
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

- Required input packet fields: `architecture problem`, `current seams`, `future callers`, `constraints`.
- Required output packet fields: `minimal restructure`, `tradeoffs`, `ADR/doc target`, `risks`.
- Non-goals:
- Do not implement code
- Do not over-abstract
- Do not live-apply to real HOME
- Do not replace accepted issue scope

## Review Output

Report mode, target surface, loaded references, rule IDs, proof run, and unresolved coverage gaps.

## Skill Integrity

This package is generated from `docs/harness/shared-nucleus-agents.*` for LOO-101. Update the contract first, then regenerate package content; do not fork agent policy inside one harness adapter.
