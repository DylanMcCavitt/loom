---
name: modules
description: Optimizes a proven performance bottleneck with measured before-and-after results, stopping when returns diminish. Use when optimizing for performance or efficiency — a slow path, a throughput or latency problem, or a make-it-faster or make-it-cheaper ask.
---

# Modules

Modules and beacons make a factory faster — but only where throughput is actually
constrained, and with diminishing returns. Optimize the proven bottleneck, measure
the gain, and stop when the next point of speed costs more than it returns.

## Read first

Read the repo envelope `assembler` generated for the build/run/profile commands;
never hardcode them.

## Process

1. **Find the bottleneck first.** Profile or measure; reuse `diagnose` to locate
   the real limiting step. Never optimize a guess.
2. **Baseline.** Record a measured baseline — latency, throughput, cost, or build
   time, whichever the ask names.
3. **Smallest effective change.** Apply the least change that moves the bottleneck.
   Cite `bus-first`: never add complexity or an abstraction for a gain you can't
   measure.
4. **Re-measure.** Compare against the baseline and report the delta.
5. **Diminishing returns.** Like beacons (~1.5×√n, not linear), each added effort
   returns less. Stop when the next gain costs more than it returns.

## Invariants

- Measure before and after — no unverified performance claims.
- Optimize the proven bottleneck, not a guess.
- Never trade correctness or a guard for speed.
- Readability or structure refactor with no perf goal is `quality`, not here.
