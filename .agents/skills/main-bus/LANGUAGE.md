# Language

Shared vocabulary for every suggestion this skill makes. Use these terms exactly
— don't substitute "component", "service", "API", or "boundary". Consistent
language is the whole point. Name the *materials* (what flows on the lanes) with
the repo contract's domain glossary; name the *structure* with the terms below.

## Terms

**Module**
Anything with an interface and an implementation. Scale-agnostic — a function, a
class, a package, or a tier-spanning slice.
_Avoid_: unit, component, service.

**Interface**
Everything a caller must know to use the module correctly: the type signature, but
also invariants, ordering constraints, error modes, required config, and
performance characteristics.
_Avoid_: API, signature (too narrow — those name only the type-level surface).

**Implementation**
What's inside a module — its body of code.

**Depth**
Leverage at the interface: how much behaviour a caller (or test) exercises per
unit of interface they must learn. **Deep** = much behaviour behind a small
interface. **Shallow** = the interface is nearly as complex as the implementation.
A clean lane on the bus is a deep module.

**Seam** _(Michael Feathers)_
A place you can alter behaviour without editing in that place — the *location*
where a module's interface lives. Where to put the seam is its own decision,
distinct from what sits behind it. Propose seams at the **highest point** that
holds the behaviour.
_Avoid_: boundary (overloaded with DDD's bounded context).

**Adapter**
A concrete thing that satisfies an interface at a seam. Describes *role* (what slot
it fills), not substance (what's inside).

**Leverage**
What callers get from depth: more capability per unit of interface they have to
learn. One lane pays back across N consumers.

**Locality**
What maintainers get from depth: change, bugs, and knowledge concentrate in one
place rather than spreading across consumers. Fix once, fixed everywhere.

## Principles

- **Depth is a property of the interface, not the implementation.** A deep lane
  can be internally composed of small, swappable parts — they just aren't part of
  the interface. A lane can have **internal seams** (private to its
  implementation, used by its own tests) as well as the **external seam** at its
  interface.
- **The deletion test.** Imagine deleting the module. If complexity vanishes it
  was a pass-through; if it reappears across N callers it was a real lane earning
  its keep — put it on the bus.
- **The interface is the test surface.** Callers and tests cross the same seam. To
  want to test *past* the interface means the module is the wrong shape.
- **One adapter is a hypothetical seam. Two adapters is a real one.** Don't open a
  seam unless something actually varies across it.

## Relationships

- A **module** has exactly one **interface** (the surface it presents to callers
  and tests).
- **Depth** is a property of a module, measured against its interface.
- A **seam** is where a module's interface lives; an **adapter** sits at a seam
  and satisfies the interface.
- Depth produces **leverage** for callers and **locality** for maintainers.

## Rejected framings

- **Depth as a line-count ratio** (implementation lines ÷ interface lines): rewards
  padding the implementation. Use depth-as-leverage instead.
- **"Interface" as just the type signature or a class's public methods**: too
  narrow — interface here is every fact a caller must know.
- **"Boundary"**: overloaded with DDD's bounded context. Say **seam** or
  **interface**.
