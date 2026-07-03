# Lab patterns

## Mode-first routing

Resolve request mode before acting. Reviews do not become edits; proof does not become implementation; launch gates do not mutate code.

## Narrow reference loading

Load `SKILL.md`, then the packet-named lens reference (`lens-command-proof.md` by default), then only the other reference files needed for the requested surface. Use `coverage-gaps.md` when the package lacks a stable rule.

## Lens fanout

A proof coordinator may run distinct proof lenses (`command-proof`, `ui-proof`, `smoke-proof`) as parallel lab children when each lens has a distinct evidence contract; siblings coordinate through the parent packet.

## Packet output

Return these fields when applicable:

- commands run
- observed result
- artifacts
- untested branches
