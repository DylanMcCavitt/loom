# Bus First patterns

## Mode-first routing

Resolve request mode before acting. Reviews do not become edits; proof does not become implementation; launch gates do not mutate code.

## Narrow reference loading

Load `SKILL.md`, then only the reference files needed for the requested surface. Use `coverage-gaps.md` when the package lacks a stable rule.

## Packet output

Return these fields when applicable:

- cuts requested
- rung rationale
- guards preserved
- no-cut statement
