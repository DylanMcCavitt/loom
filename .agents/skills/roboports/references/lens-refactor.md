# Roboports lens: refactor

Loaded when the packet names `lens: refactor`. Behavior-preserving work only:
raise a unit's quality tier in place for clarity and maintainability, or
delete and salvage dead and duplicated code — without changing what the code
does. (Absorbs the retired `recycler` and `quality` agents.)

## Judgment

- **Behavior-preserving:** adds no features, changes no outputs, alters no
  envelope. The existing tests stay green before and after. If a change needs
  to alter behavior, it is not this lens.
- Side-effect boundary: resolve the packet's `context` (`validation` | `live`) per the shared contract before any tracker, PR, or live-HOME action; under `validation`, report intended side effects instead of performing them. During real work it upgrades or recycles one unit at a time against a green bar.
- A refactor costs effort now to repay later — pay it deliberately, not as a
  detour bolted onto a feature change.

## Input and output packet

- Required input fields: `target code`, `behavior proof`, `dup/dead code
  evidence`, `allowed scope`.
- Required output fields: `diff`, `behavior proof`, `removed code`, `risks`.

## The two moves

### Upgrade in place (vertical)

Raise the quality of a unit you already have instead of sprawling new code
beside it. Rename for intent, collapse needless indirection, clarify control
flow, tighten types and naming, extract a well-named helper out of a tangle —
same behavior, higher tier. Vertical, not horizontal: improve the thing,
don't add another thing next to it.

### Recycle (delete / salvage)

**Delete** unreachable paths, unused exports, commented-out husks, and dead
flags. **Salvage** duplication back onto the shared lane: when the same logic
is copied in three places, consolidate it and route the callers through it.
This is the minimal-diff doctrine run backwards — tap the line that already
exists instead of keeping three parallel ones. Never rewrite what you can tap.

## Never on the chopping block

Never delete load-bearing guards in the name of cleanup:

- trust-boundary validation
- data-loss / error handling
- security checks
- accessibility

Code that *looks* dead but guards an edge case is not scrap. Confirm it is
truly unreferenced before recycling it.

## Behavior-preserving checks

Refactor against a green bar. Read the repo envelope for the targeted checks,
run them before and after, and confirm identical behavior — same tests, same
outputs. Add no test that asserts new behavior; the existing tests must stay
green.

## Boundaries

- Want it *faster*, not cleaner? That is the performance lens. This lens never
  trades correctness or a guard for speed and never claims a perf win.
- Planning structure, seams, or architecture? That is blueprint's architecture
  lens — it plans the bus; this lens refactors units in place against the bus
  that already exists.
- A genuine bug, failing check, or regression is a diagnosis-first
  issue-delivery job, not a behavior-preserving refactor.
- Adding new behavior or a new endpoint is the issue-delivery lens.
