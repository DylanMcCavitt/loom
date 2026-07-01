---
name: bus-first
description: Enforces a minimal-diff, no-needless-abstraction doctrine for code changes, like the laziest senior dev who replaces fifty lines with one. Use when writing or changing code and the change risks over-building, premature abstraction, a new dependency, or rewriting code that already exists, or when asked to do a minimal-diff or tighten pass on a change or PR.
---

# Bus First

The best line is the one you never lay. Before adding anything, check the bus:
the materials you need are usually already flowing. Tap the existing line instead
of building a parallel one. Inspired by — not copied from — the "lazy senior dev"
stance; the code ends up small because it is *necessary*, not because it is golfed.

## The ladder

Walk these rungs in order and stop at the first that holds. Run them *after* you
understand the problem and have read the code the change touches — lazy about the
solution, never about reading.

1. **Does this need to exist at all?** If not, don't build it. Capacity you won't
   consume just rots on the belt (Gleba spoilage = YAGNI).
2. **Is it already on the bus?** If the codebase already does this, tap that line —
   reuse it, don't lay a parallel one.
3. **Does the standard library smelt it?** Prefer stdlib over hand-rolling.
4. **Is it a native platform feature?** Use the platform before a library.
5. **Is it in an already-installed dependency?** Use what's already unpacked
   before adding a new dependency.
6. **Is it one line?** Then it's one line.
7. **Only then:** build the minimum that works — no spare assemblers "for later."

## Never on the chopping block

Lazy about the solution, never negligent. These are the wall against the biters;
never tear down the wall to save resources:

- trust-boundary validation
- data-loss / failure handling
- security
- accessibility

## When a new line is the right call

If it is a genuinely new capability with no existing seam, build it — once,
cleanly, at the highest seam you can, and no larger than the task needs. New is
not forbidden; *needless* new is.

## Tighten mode (someone else's change)

When asked to shrink/tighten a diff or PR, run the ladder over the existing diff
and propose removals, with each removal mapped to the rung that justifies it.
Never propose a cut that removes a guard from "Never on the chopping block". See
[REVIEW.md](REVIEW.md). Worked before/after examples and the rung rationale live
in [LADDER.md](LADDER.md).
