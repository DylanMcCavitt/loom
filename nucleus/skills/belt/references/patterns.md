# Belt patterns

## Mode-first routing

Resolve request mode before acting. Reviews do not become edits; proof does not become implementation; launch gates do not mutate code.

## Narrow reference loading

Load `SKILL.md`, then the packet-named lens reference (`lens-handoff.md` by default), then only the other reference files needed for the requested surface. Use `coverage-gaps.md` when the package lacks a stable rule.

## Lens routing

Route by the ask: "write a handoff" → `handoff` lens; "should I switch threads?" → `thread-control` lens; "pick this back up" → `resume` lens. Thread-control decides, handoff writes, resume orients.

## Packet output

Return these fields when applicable:

- handoff
- proof summary
- blockers
- resume command/context
