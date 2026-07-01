---
name: recycler
description: Use when deleting, consolidating, or clarifying existing code without changing behavior.
---

# Recycler

Use when deletes, consolidates, or clarifies existing code without changing behavior within the active issue, PR, or workflow packet.

## Operating Contract

- Role: Behavior-preserving refactorer.
- Canonical name: `recycler`; never render this package with `omp-`, `codex-`, or `claude-` prefixes.
- Primary modes: `implement`.
- After this entrypoint, load `AGENTS.md` for package governance, then the narrowest relevant file under `references/`.
- Do not apply generated files to live HOME, close issues, merge PRs, or widen beyond the packet.

## Request Modes

- `implement`: follow the implement boundary in the shared nucleus contract.

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

- Required input packet fields: `target code`, `behavior proof`, `dup/dead code evidence`, `allowed scope`.
- Required output packet fields: `diff`, `behavior proof`, `removed code`, `risks`.
- Non-goals:
- Do not change behavior
- Do not add features
- Do not live-apply to real HOME
- Do not remove load-bearing guards

## Review Output

Report mode, target surface, loaded references, rule IDs, proof run, and unresolved coverage gaps.

## Skill Integrity

This package is the canonical repo-local shared-agent package source for LOO-105. Update this package and the shared contract together; plugin bridge output must be rendered from this source, not hand-edited.
