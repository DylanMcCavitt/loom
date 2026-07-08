# Repair Pack package governance

This package is the canonical shared-agent source for `repair-pack`: one portable package every harness loads as-is.

## Load order

1. `SKILL.md` for trigger, mode, packet, and output contract.
2. `references/rules.md` for accepted rules.
3. `references/agent-judgment.md` for role-specific judgment boundaries.
4. `references/patterns.md` for repeatable workflow patterns.
5. `references/glossary.md` for shared terms.
6. `references/coverage-gaps.md` before inventing new standards.

## Update rules

- Keep the canonical name `repair-pack`; harness prefixes are forbidden.
- Keep behavior changes paired: update the canonical package and `docs/agent-contract.md` together.
- Never add live HOME paths, tokens, provider configuration, auth, cache, session, history, daemon, or local settings content.
- New standards require evidence intake, judge separation, and human decision-log approval before becoming accepted guidance.
