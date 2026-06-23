---
name: main-bus
description: Plans a codebase's shared main bus — the core types, services, and utilities many features tap — so new work routes off clean lanes instead of laying parallel spaghetti, proposing the minimal restructure and recording it as an ADR/doc. Use when planning structure or architecture so a codebase can scale without walling itself in — laying shared lanes, deciding seams, or untangling spaghetti before it spreads.
---

# Main Bus

In Factorio a **main bus** is a handful of clean parallel lanes — iron, copper,
gears, circuits — running down the spine of the base. Every factory block *pulls
off* the bus for what it needs. The discipline is the whole game: keep the core
materials on clear lanes, tap them, and never weave a private parallel line to one
consumer — that is how a base turns into spaghetti that can't scale.

This skill **plans the bus** for a codebase: it finds the **shared materials** —
the core types, services, and utilities many features tap — keeps them on clear
lanes, and routes new work *off the bus* instead of laying parallel spaghetti. It
calls out where today's layout will wall you in as you scale and proposes the
**minimal restructure** to open the lane.

It plans and advises; it does not mass-refactor in place — that is `quality`. It
records the decision as an ADR/doc, not code.

## Read first: the repo contract

Read the repo contract that `assembler` generated and the standing ADRs in the
area before proposing anything: the **domain glossary** (so the bus's lanes are
named in the project's own words), the ADRs (decisions you must not re-litigate),
and where this repo records architecture decisions. Never invent a structure the
glossary already names; never re-suggest something an ADR already closed.

## Vocabulary

Name the *structure* with the architecture vocabulary in
[LANGUAGE.md](LANGUAGE.md); name the *materials* that flow on the lanes with the
contract's domain glossary. Use both exactly — don't drift into "component",
"service", or "boundary".

- **Module** — anything with an interface and an implementation.
- **Interface** — everything a caller must know: types, invariants, ordering,
  error modes, config. The interface is the test surface.
- **Seam** — where an interface lives; behaviour can change there without editing
  in place. Propose seams at the **highest point** that holds the behaviour.
- **Deep / shallow** — leverage at the interface. A lane on the bus is a deep
  module: much behaviour behind a small interface, tapped by many consumers.
- **Deletion test** — imagine deleting a module. If complexity vanishes it was a
  pass-through; if it reappears across N callers it was a real lane earning its
  keep — the signal to put it on the bus.

## Process

### 1. Map the bus

Walk the codebase (a read-only `Explore` subagent is ideal) and chart it as lanes
and consumers. Where does understanding one concept require bouncing between many
shallow modules? Where do consumers reach *around* a lane and re-implement it?
Where does a private parallel line run beside a material already on the bus?

### 2. Find the tangles

Mark candidates where the layout blocks future scale: a shared material with no
clean lane (every feature re-implements it), a lane tapped through a leaky seam,
or spaghetti where two consumers wired straight to each other. Apply the deletion
test to each suspected lane.

### 3. Present the candidates

Present the tangles as a visual **bus map** — before (spaghetti) vs after (clean
lanes with pull-offs) — so the human can pick what to open. See
[REPORT.md](REPORT.md). Do not propose interfaces yet; ask which to explore.

### 4. Grill the chosen restructure

Once a candidate is picked, walk its design tree: what material the lane carries,
where the seam sits, what its dependencies are and how they're tested across the
seam ([LANES.md](LANES.md)). To explore alternative interfaces for the lane, use
the design-it-twice fan-out in [INTERFACE-DESIGN.md](INTERFACE-DESIGN.md).

### 5. Record the decision

Record the agreed restructure where the contract puts architecture decisions (a
repo ADR or a Linear architecture document): the lane, the seam, the materials it
carries, and the consumers it serves. So `main-bus` records the decision as an
ADR/doc — the bus map is only the presentation. If a candidate contradicts a
standing ADR, only reopen it when the friction is real: flag it, don't silently
overturn it. Hand the agreed restructure to `ghosts` to stamp as tracked issues;
implementing it is `robots`.

## Minimal restructure (cite `bus-first`)

Cite `bus-first`: restructure no more than the scaling need requires. Reuse a lane
already on the bus before laying a new one; open a seam only where something
actually varies across it (one adapter is a hypothetical seam, two is a real one);
add a new lane only for a genuinely new shared material — once, at the highest
seam that holds it. Capacity you won't consume just rots on the belt.

## Invariants

- **Plans and advises; never mass-refactors in place** — an in-place refactor,
  rename, or salvage routes to `quality`; implementing a feature routes to
  `robots`.
- **Proposes seams at the highest point** that holds the behaviour.
- **Records decisions as an ADR/doc**; never re-litigates a standing ADR.
- **Reads the repo contract + domain glossary**; never invents names the glossary
  already provides or hardcodes a structure.
