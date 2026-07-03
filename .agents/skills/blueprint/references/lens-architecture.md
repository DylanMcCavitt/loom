# Blueprint lens: architecture

Loaded when the packet names `lens: architecture`. Plans a codebase's shared
main bus — the core types, services, and utilities many features tap — so new
work routes off clean lanes instead of laying parallel spaghetti, and records
the minimal restructure as an ADR/doc. (Absorbs the retired `main-bus` agent.)

## Judgment

- This lens plans and advises; it does **not** mass-refactor in place — an
  in-place refactor, rename, or salvage routes to `roboports` under its
  refactor lens. Implementing a feature routes to `roboports`.
- Read the repo envelope and the standing ADRs in the area before proposing
  anything: the domain glossary (so lanes are named in the project's own
  words), the ADRs (decisions not to re-litigate), and where the repo records
  architecture decisions. Never re-suggest something an ADR already closed;
  reopen one only when the friction is real — flag it, don't overturn it.

## Vocabulary

Name the *structure* with these terms exactly; name the *materials* on the
lanes with the envelope's domain glossary. Avoid "component", "service",
"unit", "API", "signature", and "boundary".

- **Module** — anything with an interface and an implementation.
- **Interface** — everything a caller must know: types, invariants, ordering,
  error modes, config. The interface is the test surface.
- **Seam** — where an interface lives; behavior can change there without
  editing in place. Propose seams at the **highest point** that holds the
  behavior. One adapter is a hypothetical seam; two is a real one.
- **Adapter** — a concrete thing satisfying an interface at a seam (role, not
  substance).
- **Deep / shallow** — leverage at the interface. A lane on the bus is a deep
  module: much behavior behind a small interface, tapped by many consumers.
  Depth produces leverage for callers and locality for maintainers.
- **Deletion test** — imagine deleting a module. If complexity vanishes it was
  a pass-through; if it reappears across N callers it was a real lane earning
  its keep — the signal to put it on the bus.

## Playbook

1. **Map the bus.** Walk the codebase (a read-only explore child is ideal) and
   chart it as lanes and consumers: where does understanding one concept bounce
   between many shallow modules? Where do consumers reach around a lane and
   re-implement it?
2. **Find the tangles.** Mark candidates where the layout blocks future scale:
   a shared material with no clean lane, a lane tapped through a leaky seam,
   or two consumers wired straight to each other. Apply the deletion test.
3. **Present the candidates** as a before/after bus map so the human can pick
   what to open. Do not propose interfaces yet; ask which to explore.
4. **Grill the chosen restructure.** Walk its design tree: the material the
   lane carries, where the seam sits, dependencies, and how they're tested
   across the seam. Explore at least two alternative interfaces (design it
   twice) and compare by depth, locality, and seam placement.
5. **Record the decision** where the envelope puts architecture decisions (a
   repo ADR or a Linear architecture document): the lane, the seam, the
   materials, and the consumers. Hand the agreed restructure to the
   issue-decomposition lens to stamp as tracked issues; implementing it is
   `roboports`.

## Laying lanes across dependencies

- **In-process** (pure computation): always laneable; test through the new
  interface directly.
- **Local-substitutable** (test stand-ins exist): laneable; test with the
  stand-in in the suite.
- **Remote but owned**: define a port at the seam; production uses a transport
  adapter, tests an in-memory one.
- **True external** (third-party): inject the dependency as a port; tests
  provide a mock adapter.
- Testing: replace, don't layer. Old unit tests on the scattered copies become
  waste once tests exist at the lane's interface; assert observable outcomes
  through the interface, never internal state.

## Minimal restructure

Apply the minimal-diff doctrine (the biters minimal-diff lens reviews against
it): restructure no more than the scaling need requires. Reuse a lane already
on the bus before laying a new one; open a seam only where something actually
varies across it; add a new lane only for a genuinely new shared material —
once, at the highest seam that holds it.

## Packet output

- minimal restructure proposal (lane, seam, materials, consumers)
- tradeoffs
- ADR/doc target and recorded decision
- risks
