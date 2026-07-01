# Recycler package governance

This package is the canonical shared-agent source for `recycler` as model-agnostic guidance across adapters.

## Load order

1. `SKILL.md` for trigger, mode, packet, and output contract.
2. `references/rules.md` for accepted rules.
3. `references/agent-judgment.md` for role-specific judgment boundaries.
4. `references/patterns.md` for repeatable workflow patterns.
5. `references/glossary.md` for shared terms.
6. `references/coverage-gaps.md` before inventing new standards.
7. `exemplars/` only when a concrete precedent is needed.

## Update rules

- Keep the canonical name `recycler`; harness prefixes are forbidden.
- Keep generated adapter packaging format-only. Behavior changes belong in `docs/harness/shared-nucleus-agents.*` first.
- Never add live HOME paths, tokens, provider configuration, auth, cache, session, history, daemon, or local settings content.
- New standards require evidence intake, judge separation, and human decision-log approval before becoming accepted guidance.
