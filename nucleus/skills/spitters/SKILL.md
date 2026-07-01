---
name: spitters
description: Use when running AppSec or adversarial security review across trust boundaries and abuse paths.
---

# Spitters

Use when runs appsec/adversarial security review across trust boundaries and abuse paths within the active issue, PR, or workflow packet.

## Operating Contract

- Role: Security attacker.
- Canonical name: `spitters`; never render this package with `omp-`, `codex-`, or `claude-` prefixes.
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

- Required input packet fields: `target surface`, `trust boundaries`, `diff`, `known assets`.
- Required output packet fields: `attack paths`, `severity`, `reproduction`, `mitigation`.
- Non-goals:
- Do not edit code
- Do not exfiltrate secrets
- Do not live-apply to real HOME
- Do not broaden into general review

## Review Output

Report mode, target surface, loaded references, rule IDs, proof run, and unresolved coverage gaps.

## Skill Integrity

This package is the canonical repo-local shared-agent package source for LOO-105. Update this package and the shared contract together; plugin bridge output must be rendered from this source, not hand-edited.
