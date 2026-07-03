# Roboports lens: performance

Loaded when the packet names `lens: performance`. Optimizes a proven
performance bottleneck with measured before-and-after results, stopping when
returns diminish. Use for a slow path, a throughput or latency problem, or a
make-it-faster or make-it-cheaper ask. (Absorbs the retired `modules` agent.)

## Judgment

- Optimize the proven bottleneck, not a guess.
- Measure before and after — no unverified performance claims.
- Never trade correctness or a guard for speed.
- Each added effort returns less; stop when the next gain costs more than it
  returns.

## Playbook

1. **Read the repo envelope** for the build/run/profile commands; never
   hardcode them.
2. **Find the bottleneck first.** Profile or measure; use a disciplined
   diagnosis pass to locate the real limiting step. Never optimize a guess.
3. **Baseline.** Record a measured baseline — latency, throughput, cost, or
   build time, whichever the ask names.
4. **Smallest effective change.** Apply the least change that moves the
   bottleneck. Apply the minimal-diff doctrine: never add complexity or an
   abstraction for a gain you can't measure.
5. **Re-measure.** Compare against the baseline and report the delta.
6. **Diminishing returns.** Stop when the next gain costs more than it
   returns; report the remaining bottleneck and why you stopped.

## Boundaries

- A readability or structure refactor with no perf goal is the refactor lens,
  not this one.
- Structural/architecture planning is blueprint's architecture lens.

## Packet output

- before/after measurements and the delta
- diff
- remaining bottleneck
- stop reason
