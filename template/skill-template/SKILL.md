---
name: <skill-name>
description: <One-line role summary with concrete triggers, synonyms, and near-miss routing hints. Use when <specific user intent or packet condition>.>
---

# <Skill title>

<One paragraph: what this skill owns, which request modes it serves, and what it refuses.>

## Operating contract

- **Canonical name:** `<skill-name>` — no `omp-`, `codex-`, or `claude-` prefixes.
- **Primary modes:** `<shape|implement|review|prove|repair|launch>` (pick what applies).
- **Load order:** read this entrypoint, then `AGENTS.md` (shared-agent packages only), then the packet-named file under `references/`.
- **Scope:** stay inside the active issue / PR / workflow packet; do not widen, live-apply to HOME, or close tracker items.

## Lenses (optional)

When the packet carries a `lens` field:

- load `references/lens-<name>.md` for the named lens only
- when `lens` is absent, load the default lens file documented here
- lenses select guidance only; they never change mode boundaries or delegation authority

## Workflow

1. Resolve request mode, packet scope, and lens before acting.
2. Load only the references required for the current step.
3. Execute the smallest coherent step allowed by the packet.
4. Return the required output packet and explicit non-goals.

## Routing

- <Near-miss A> → `<other-skill>`
- <Near-miss B> → `<other-skill>`

## References

- `references/` — progressive disclosure for lenses, rules, examples, and tables.
- Keep `SKILL.md` as the entrypoint; do not paste long tables or file trees here.

## Skill integrity

Update this package together with any contract it specializes. For shared roster agents, keep `docs/agent-contract.md` as the behavior source of truth and render adapter output — never hand-edit generated distributions.
