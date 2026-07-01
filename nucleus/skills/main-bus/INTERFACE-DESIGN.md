# Interface Design

When the user wants to explore alternative interfaces for a chosen lane, use this
parallel fan-out. Based on "Design It Twice" (Ousterhout) — your first idea is
rarely the best. Uses the vocabulary in [LANGUAGE.md](LANGUAGE.md) — **module**,
**interface**, **seam**, **adapter**, **leverage**.

## 1. Frame the problem space

Before fanning out, write a short user-facing frame for the chosen lane:

- the constraints any new interface must satisfy
- the dependencies it relies on and which category they fall into
  ([LANES.md](LANES.md))
- a rough illustrative sketch to ground the constraints — not a proposal, just a
  way to make the constraints concrete

Show it to the user, then proceed immediately; they read and think while the
sub-agents work in parallel.

## 2. Fan out

Spawn 3+ sub-agents in parallel. Each must produce a **radically different**
interface for the lane. Give each a separate technical brief (file paths, coupling
detail, dependency category from [LANES.md](LANES.md), what sits behind the seam)
and a distinct design constraint:

- Agent 1: "Minimize the interface — 1–3 entry points max, maximum leverage each."
- Agent 2: "Maximize flexibility — support many use cases and extension."
- Agent 3: "Optimise for the most common consumer — make the default case trivial."
- Agent 4 (if cross-seam): "Design around ports & adapters."

Include both [LANGUAGE.md](LANGUAGE.md) vocabulary and the envelope's domain
glossary in each brief so every design names things consistently with both the
architecture language and the project's own words.

Each sub-agent outputs:

1. the interface — types, methods, params, plus invariants, ordering, error modes
2. a usage example showing how consumers tap it
3. what the implementation hides behind the seam
4. dependency strategy and adapters (see [LANES.md](LANES.md))
5. trade-offs — where leverage is high, where it's thin

## 3. Present and compare

Present the designs sequentially so the user can absorb each, then compare them in
prose by **depth** (leverage at the interface), **locality** (where change
concentrates), and **seam placement**. Give your own recommendation — be
opinionated, the user wants a strong read, not a menu. If elements from different
designs combine well, propose a hybrid.
