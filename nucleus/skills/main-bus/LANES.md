# Lanes

How to pull a tangle onto the bus — lay a clean lane and route consumers off it —
given its dependencies. Assumes the vocabulary in [LANGUAGE.md](LANGUAGE.md):
**module**, **interface**, **seam**, **adapter**.

Laying a lane = consolidating a shared material into one deep module behind a
small interface, then routing consumers to tap it instead of re-implementing it.
The dependency category decides how the lane is tested across its seam.

## Dependency categories

### 1. In-process

Pure computation, in-memory state, no I/O. Always laneable — merge the scattered
copies and test through the new interface directly. No adapter needed.

### 2. Local-substitutable

Dependencies with local test stand-ins (PGLite for Postgres, an in-memory
filesystem). Laneable if the stand-in exists; test the lane with the stand-in
running in the suite. The seam is internal — no port at the lane's external
interface.

### 3. Remote but owned (ports & adapters)

Your own services across a network boundary (microservices, internal APIs). Define
a **port** (interface) at the seam; the lane owns the logic, the transport is an
injected **adapter**. Tests use an in-memory adapter; production uses an
HTTP/gRPC/queue adapter.

Recommendation shape: *"Define a port at the seam, an HTTP adapter for production
and an in-memory adapter for tests, so the logic sits in one deep lane even though
it's deployed across a network."*

### 4. True external (mock)

Third-party services you don't control (Stripe, Twilio). The lane takes the
dependency as an injected port; tests provide a mock adapter.

## Seam discipline

- **One adapter is a hypothetical seam; two is a real one.** Don't introduce a
  port unless at least two adapters are justified (typically production + test). A
  single-adapter seam is just indirection.
- **Internal seams vs external seams.** A deep lane can have internal seams
  (private to its implementation, used by its own tests) as well as the external
  seam at its interface. Don't expose internal seams through the interface just
  because tests use them.

## Testing: replace, don't layer

- Old unit tests on the scattered copies become waste once tests at the lane's
  interface exist — delete them.
- Write new tests at the lane's interface. **The interface is the test surface.**
- Assert observable outcomes through the interface, not internal state — tests
  should survive an internal refactor. If a test must change when the
  implementation changes, it's testing past the interface.
