# Factory Nucleus negative-eval coverage map

Factory Nucleus refuses a set of unsafe / over-autonomous behaviors. Each one is
blocked by a guardrail in the code, and each guardrail is pinned by a
**guardrail-removal-sensitive eval**: a fixture-backed test that fails if the
guardrail is weakened or removed. None of these evals touch live external
systems — they run offline against local fixtures, in `npm run check`.

This page is the auditable index of that negative-eval layer. The drift guard
`scripts/validate-factory-nucleus-negative-evals.mjs` parses the eval references
below and fails if any cited eval no longer exists, so the map cannot silently
rot. The eval references use the exact format `` `<test file>` — "<test title>" ``.

## Unsafe behaviors and their guardrail evals

### 1. Scan writes to the target repo
Guardrail: `scanFactory` is zero-footprint — it reads local files and Git only and writes nothing (`localState.writes: false`).
- Eval: `tests/factory-nucleus-scan.test.mjs` — "default factory scan reports a clean Node repo without writing files"

### 2. `scan --save` creates an envelope
Guardrail: `saveScanState` writes only the scan-state file under local state; it never creates an envelope (durable policy stays explicit).
- Eval: `tests/factory-nucleus-scan.test.mjs` — "factory scan --integrated-envelope --save writes only scan state outside the target repo"

### 3. A tracker is inferred without an explicit bind
Guardrail: `init-envelope` leaves `tracker.provider: none`, and `bind-tracker` requires an explicit `--provider`; nothing infers a tracker.
- Eval: `tests/factory-nucleus-envelope.test.mjs` — "factory bind-tracker without an explicit provider leaves the tracker inactive"
- Eval: `tests/factory-nucleus-envelope.test.mjs` — "factory init-envelope CLI leaves tracker binding explicit and unset"

### 4. Scan writes to a protected surface
Guardrail: scan only *suggests* protected surfaces; it never writes them (still zero-footprint).
- Eval: `tests/factory-nucleus-scan.test.mjs` — "factory scan suggests protected surfaces and redacts secret-looking output"

### 5. Autonomous merge without explicit permission
Guardrail: `permitsAutonomousMerge` is a strict `=== true` conjunction of `delivery.autoMerge` + green CI + clean radar + proven proof; any missing/false signal (or no envelope) denies merge, so it is never enabled by default.
- Eval: `tests/factory-nucleus-recipe.test.mjs` — "permitsAutonomousMerge requires explicit permission and all quality gates"
- Eval: `tests/factory-nucleus-recipe.test.mjs` — "autonomous merge is not enabled by default (plan stops at launch-ready)"

### 6. Content scan leaks secrets
Guardrail: the optional content scan redacts secret-looking values; saved scan state omits the raw values.
- Eval: `tests/factory-nucleus-scan.test.mjs` — "factory scan --content-scan --save omits secret-looking values from saved state"

### 7. Radar rewrites a blueprint / repo / tracker
Guardrail: radar is check-only — `radar.mjs` is structurally pure (no filesystem or child_process), and the `radar-check` schema rejects extra fields, so no write/rewrite directive can ride along.
- Eval: `tests/factory-nucleus-radar.test.mjs` — "a radar-check rejects extra fields (no write/rewrite directive can ride along)"
- Eval: `tests/factory-nucleus-radar.test.mjs` — "radar.mjs is structurally pure: no filesystem or child_process access"

### 8. Overlapping subagent write scopes are silently allowed
Guardrail: `assessWriteScopes` detects scopes claimed by more than one subagent, and `resolveStageWriteScopes` escalates the stage rather than letting writers contend.
- Eval: `tests/factory-nucleus-recipe.test.mjs` — "overlapping write scopes escalate the stage (negative fixture)"
