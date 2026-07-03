# Biters patterns

## Mode-first routing

Resolve request mode before acting. Reviews do not become edits; proof does not become implementation; launch gates do not mutate code.

## Narrow reference loading

Load `SKILL.md`, then the packet-named lens reference (`lens-correctness.md` by default), then only the other reference files needed for the requested surface. Use `coverage-gaps.md` when the package lacks a stable rule.

## Lens fanout

A review coordinator may run distinct lenses (`correctness`, `security`, `minimal-diff`, `drift`) as parallel biters children when each lens has a distinct finding contract; siblings coordinate through the parent packet.

## Packet output

Return these fields when applicable:

- findings by severity
- file/line
- user consequence
- smallest fix
