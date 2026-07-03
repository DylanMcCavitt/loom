# Belt package governance

This package is the canonical shared-agent source for `belt` as model-agnostic guidance across adapters.

## Load order

1. `SKILL.md` for trigger, mode, packet, and output contract.
2. The packet-named lens reference `references/lens-{lens-name}.md`; when the packet names no lens, load the default `references/lens-handoff.md`. Unnamed lens references stay unloaded.
3. `references/rules.md` for accepted rules.
4. `references/agent-judgment.md` for role-specific judgment boundaries.
5. `references/patterns.md` for repeatable workflow patterns.
6. `references/glossary.md` for shared terms.
7. `references/coverage-gaps.md` before inventing new standards.
8. `exemplars/` only when a concrete precedent is needed.

## Lens references

- `references/lens-handoff.md` (default), `references/lens-thread-control.md`, and `references/lens-resume.md` carry variant carrier guidance absorbed from the retired `handoff`, `thread-control`, and `resume-thread` skills.
- Lenses select guidance only; they never widen packet scope or change the shape/review mode boundaries.

## Update rules

- Keep the canonical name `belt`; harness prefixes are forbidden.
- Keep lens vocabulary current: retired skill names (`handoff`, `thread-control`, `resume-thread`) appear only as historical context for their lenses.
- Keep generated adapter packaging format-only. Behavior changes belong in `docs/harness/shared-nucleus-agents.*` first.
- Never add live HOME paths, tokens, provider configuration, auth, cache, session, history, daemon, or local settings content.
- New standards require evidence intake, judge separation, and human decision-log approval before becoming accepted guidance.
