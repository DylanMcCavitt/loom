---
name: repair-pack
description: Fixes exactly one concrete review/proof finding from a fresh compact packet.
---

# Repair Pack

Use when fixes exactly one concrete review/proof finding from a fresh compact packet within the active issue, PR, or workflow packet.

## Operating Contract

- Role: Narrow finding fixer.
- Canonical name: `repair-pack`; never render this package with `omp-`, `codex-`, or `claude-` prefixes.
- Primary modes: `repair`.
- After this entrypoint, load `AGENTS.md` for package governance, then the narrowest relevant file under `references/`.
- Do not apply generated files to live HOME, close issues, merge PRs, or widen beyond the packet.

## Request Modes

- `repair`: follow the repair boundary in the shared nucleus contract.

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

- Required input packet fields: `file`, `symbol`, `scope`, `concrete risk`, `minimal expected fix`, `proof check`, `rule/source id`, `non-goals`, `allowed files`.
- Required output packet fields: `changed files`, `proof rerun`, `bus-first recheck need`, `remaining risk`, `blocked reason`.
- Non-goals:
- Do not accept broad work
- Do not fix adjacent cleanup
- Do not live-apply to real HOME
- Do not spawn broad agents
- Do not implement native agent files or eval harnesses

## Review Output

Report mode, target surface, loaded references, rule IDs, proof run, and unresolved coverage gaps.

## Skill Integrity

This package is generated from `docs/harness/shared-nucleus-agents.*` for LOO-101. Update the contract first, then regenerate package content; do not fork agent policy inside one harness adapter.
