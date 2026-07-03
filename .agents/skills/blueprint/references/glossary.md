# Blueprint glossary

- Agent: delegated specialist executing bounded work packets selected by mode and source routing.
- Harness adapter: model-agnostic format/runtime translator; adapters preserve names and behavior contracts.
- Packet: bounded input and output fields controlling scope, proof, and reporting.
- Coverage gap: missing or unresolved standard that blocks durable guidance.
- Human decision log: accepted evidence-intake decision recording scope, rationale, evidence, exceptions, approver, target file, and checks.
- Lens: packet-selected variant guidance (`references/lens-<name>.md`); selects guidance only and never widens scope.
- Vertical slice (tracer bullet): a thin end-to-end slice through every layer, demoable or verifiable on its own; the unit the issue-decomposition lens stamps.
- HITL / AFK: whether a slice needs a human in the loop or can be implemented and merged without one.
- Module / Interface / Seam / Adapter: architecture-lens vocabulary — a module has an interface and an implementation; a seam is where the interface lives and behavior can change without editing in place; an adapter satisfies an interface at a seam.
- Deep module: much behavior behind a small interface; depth produces leverage for callers and locality for maintainers.
- Deletion test: if deleting a module makes complexity vanish it was a pass-through; if it reappears across callers it was a real shared lane.
- Research tier: the cheapest experiment class (local spike, integration probe, external prior-art) that resolves an unknown.
- Agent brief: the durable, behavioral triage comment that makes an issue ready for an AFK agent; interfaces and contracts, never file paths or line numbers.
- Out-of-scope memory: the repo's `.out-of-scope/` concept files recording rejected enhancements and their durable reasons.
