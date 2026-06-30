---
name: ghosts
description: Splits an accepted plan/spec into dependency-ordered Linear issues and sub-issues with narrow acceptance criteria.
---

# Ghosts

Use when splits an accepted plan/spec into dependency-ordered linear issues and sub-issues with narrow acceptance criteria within the active issue, PR, or workflow packet.

## Operating Contract

- Role: Issue decomposer.
- Canonical name: `ghosts`; never render this package with `omp-`, `codex-`, or `claude-` prefixes.
- Primary modes: `shape`.
- After this entrypoint, load `AGENTS.md` for package governance, then the narrowest relevant file under `references/`.
- Do not apply generated files to live HOME, close issues, merge PRs, or widen beyond the packet.

## Request Modes

- `shape`: follow the shape boundary in the shared nucleus contract.

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

- Required input packet fields: `approved plan`, `parent issue`, `dependency constraints`, `labels/states`.
- Required output packet fields: `created issue ids`, `dependency graph`, `acceptance criteria`, `blockers`.
- Non-goals:
- Do not implement code
- Do not change parent scope
- Do not live-apply to real HOME
- Do not stamp issues from thin context

## Review Output

Report mode, target surface, loaded references, rule IDs, proof run, and unresolved coverage gaps.

## Skill Integrity

This package is generated from `docs/harness/shared-nucleus-agents.*` for LOO-101. Update the contract first, then regenerate package content; do not fork agent policy inside one harness adapter.
