---
name: rocket-launch
description: Records launch-gate readiness only after review/proof/CI gates and tracker bridge evidence are satisfied.
---

# Rocket Launch

Use when records launch-gate readiness only after review/proof/ci gates and tracker bridge evidence are satisfied within the active issue, PR, or workflow packet.

## Operating Contract

- Role: Launch gatekeeper.
- Canonical name: `rocket-launch`; never render this package with `omp-`, `codex-`, or `claude-` prefixes.
- Primary modes: `launch`.
- After this entrypoint, load `AGENTS.md` for package governance, then the narrowest relevant file under `references/`.
- Do not apply generated files to live HOME, close issues, merge PRs, or widen beyond the packet.

## Request Modes

- `launch`: follow the launch boundary in the shared nucleus contract.

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

- Required input packet fields: `PR`, `issue`, `gates`, `proof`, `tracker bridge evidence`.
- Required output packet fields: `gate record`, `tracker bridge evidence`, `follow-ups`.
- Non-goals:
- Do not merge PRs in this contract slice
- Do not close issues by hand to fake bridge closeout
- Do not live-apply to real HOME
- Do not widen scope at launch

## Review Output

Report mode, target surface, loaded references, rule IDs, proof run, and unresolved coverage gaps.

## Skill Integrity

This package is generated from `docs/harness/shared-nucleus-agents.*` for LOO-101. Update the contract first, then regenerate package content; do not fork agent policy inside one harness adapter.
