# Rocket Launch package governance

This package is the canonical shared-agent source for `rocket-launch` as model-agnostic guidance across adapters.

## Load order

1. `SKILL.md` for trigger, mode, packet, and output contract.
2. `references/rules.md` for accepted rules.
3. `references/agent-judgment.md` for role-specific judgment boundaries.
4. `references/patterns.md` for repeatable workflow patterns.
5. `references/glossary.md` for shared terms.
6. `references/coverage-gaps.md` before inventing new standards.

## Update rules

- Keep the canonical name `rocket-launch`; harness prefixes are forbidden.
- Keep generated adapter packaging format-only. Behavior changes belong in `docs/agent-contract.md` first.
- Never add live HOME paths, tokens, provider configuration, auth, cache, session, history, daemon, or local settings content.
- New standards require pending retro evidence under `retro/`, a satisfied rule schema for accepted rules, and human PR approval before becoming accepted guidance; collector/judge automation is aspirational until implemented.
