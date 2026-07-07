# Roboports package governance

This package is the canonical shared-agent source for `roboports` as model-agnostic guidance across adapters.

## Load order

1. `SKILL.md` for trigger, mode, packet, and output contract.
2. The packet-named lens reference `references/lens-<lens-name>.md`; when the packet names no lens, the default `references/lens-issue-delivery.md`. Unnamed lens references stay unloaded.
3. `references/rules.md` for accepted rules.
4. `references/agent-judgment.md` for role-specific judgment boundaries.
5. `references/patterns.md` for repeatable workflow patterns.
6. `references/glossary.md` for shared terms.
7. `references/coverage-gaps.md` before inventing new standards.

## Lens references

`references/lens-{issue-delivery,refactor,performance}.md` carry per-lens judgment and playbooks absorbed from the retired recycler/quality and modules packages. Lenses select guidance only; they never widen packet scope or change the implement-mode boundary.

## Update rules

- Keep the canonical name `roboports`; harness prefixes are forbidden.
- Keep generated adapter packaging format-only. Behavior changes belong in `docs/agent-contract.md` first.
- Never add live HOME paths, tokens, provider configuration, auth, cache, session, history, daemon, or local settings content.
- New standards require evidence intake, judge separation, and human decision-log approval before becoming accepted guidance.
