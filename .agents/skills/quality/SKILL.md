---
name: quality
description: Refactors existing code in place without changing behavior — raising a unit's quality tier for clarity and maintainability, or recycling dead and duplicated code back onto the bus while tests stay green. Use when improving existing code in place without changing behavior: refactor for clarity/maintainability, raise a module's quality tier, or delete or salvage dead or duplicated code.
---

# Quality

In Factorio you don't make a machine better by bolting more machines beside it —
you upgrade it to a higher **quality tier** in place, and you feed scrap to the
**recycler** to get the materials back. Same here: improve the code you already
have *vertically* (raise the tier of the unit), and *salvage* what is dead or
duplicated — without changing what the code does.

This skill is **behavior-preserving**: it adds no features, changes no outputs,
and alters no contract. The existing tests stay green before and after. It does
not edit or delete real code while being validated; during real work it upgrades
or recycles one unit at a time against a green bar.

## The two moves

### Quality tier — upgrade in place (vertical)

Raise the quality of a unit you already have instead of sprawling new code beside
it (horizontal). Rename for intent, collapse needless indirection, clarify
control flow, tighten types and naming, extract a well-named helper out of a
tangle — same behavior, higher tier. Vertical, not horizontal: improve the
thing, don't add another thing next to it.

### Recycler — break it back down (delete / salvage)

Feed dead and duplicated code to the recycler. **Delete** unreachable paths,
unused exports, commented-out husks, and dead flags. **Salvage** duplication back
onto the bus: when the same logic is copied in three places, consolidate it onto
the shared lane and route the callers through it. A refactor costs effort now to
repay later — pay it deliberately, not as a detour bolted onto a feature change.

## Doctrine: bus-first

Cite `bus-first`: **reuse before rewrite**, the smallest change that holds.
Recycling duplication is the bus doctrine run backwards — tap the line that
already exists instead of keeping three parallel ones. Never rewrite what you can
tap; never lay a new line that a recycle would have removed.

## Never on the chopping block

The recycler eats scrap, never the walls. Never delete load-bearing guards in the
name of cleanup:

- trust-boundary validation
- data-loss / error handling
- security checks
- accessibility

Code that *looks* dead but guards an edge case is not scrap. Confirm it is truly
unreferenced before recycling it.

## Behavior-preserving checks

Refactor against a green bar. Read the repo contract for the targeted checks, run
them before and after, and confirm identical behavior — same tests, same outputs.
There is no new behavior to assert, so add no test that asserts new behavior;
the existing tests must stay green. If a change needs to alter behavior, it is
not this skill.

## Routing

- Want it *faster*, not cleaner? That is `modules` (performance/efficiency).
  `quality` never trades correctness or a guard for speed and never claims a perf
  win.
- Planning *structure, seams, or architecture* so the codebase can scale? That is
  `main-bus` — it plans the bus; `quality` refactors units in place against the
  bus that already exists.
- A genuine bug, failing check, or regression? That is `diagnose` (then
  `robots`), not a behavior-preserving refactor.
- Adding *new* behavior or a new endpoint? That is `robots` — `quality` changes
  no behavior.

## Invariants

- **Behavior-preserving:** tests stay green; no feature change.
- **Two moves:** upgrade in place (tier, vertical) and delete/salvage (recycler);
  vertical over horizontal.
- **Cites `bus-first`:** reuse before rewrite, smallest change that holds.
- **Never deletes load-bearing guards** (validation / security / error-handling /
  accessibility).
- **Distinct from `modules`** (perf) and **`main-bus`** (structure planning).
