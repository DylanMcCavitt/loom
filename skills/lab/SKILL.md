---
name: lab
description: Proves a stated behavior claim with command, UI, or smoke evidence and records artifacts without expanding scope. Use when behavior must be proved, verified, smoke tested, or evidenced — rerun checks and capture output, click through browser/desktop UI for screenshots, or grade an end-to-end smoke pass. Not for adversarial review or hunting bugs — use biters; not for implementing a tracked issue or feature — use roboports.
metadata:
  version: "0.2.2"
  changelog: "0.2.2 - sharpen routing description with distinct verbs and negative triggers"

---

# Lab

Use when running proof-only validation and recording behavior evidence without expanding scope, covering command, UI, and smoke proof through lenses, within the active issue, PR, or workflow packet.

## Operating Contract

- Role: Proof specialist.
- Canonical name: `lab`; never render this package with `omp-`, `codex-`, or `claude-` prefixes.
- Primary modes: `prove`.
- After this entrypoint, load `AGENTS.md` for package governance, then the packet-named lens reference under `references/`, then the narrowest other relevant file.
- Do not apply generated files to live HOME, close issues, merge PRs, or widen beyond the packet.

## Request Modes

- `prove`: follow the prove boundary in the shared nucleus contract.

### Lenses

The input packet may carry a `lens` field. A named lens loads `references/lens-<name>.md`; when `lens` is absent, load the mode default. Lenses select guidance only; they never widen packet scope, change the prove boundary, or turn proof into implementation. Distinct proof lenses may run as parallel lab children.

- `command-proof` (default): command/test/check-driven evidence. Loads `references/lens-command-proof.md`.
- `ui-proof`: browser/desktop UI workflow proof with user-visible evidence (absorbed from the retired `spidertron` agent). Loads `references/lens-ui-proof.md`.
- `smoke-proof`: end-to-end smoke and proof-class grading of live/local behavior (absorbed from the retired `proof-pass` skill). Loads `references/lens-smoke-proof.md`.

## Decision Authority

1. User goal and explicit constraints.
2. Active issue or PR acceptance criteria.
3. Verified repository code, tests, and live PR state.
4. Routed references in this package.
5. Accepted exemplars.
6. General heuristics.

## Workflow

1. Resolve mode, packet scope, and lens before acting.
2. Load the named lens reference (or the default `lens-command-proof.md`), plus only the other references needed for the target surface.
3. Execute the smallest coherent proof step allowed by the packet and lens.
4. Return the required output packet and any coverage gaps.

## Standards or Rules

- Required input packet fields: `behavior claim`, `lens`, `commands/scenarios`, `environment`, `expected evidence`.
- Required output packet fields: `commands run`, `observed result`, `artifacts`, `untested branches`.
- Non-goals:
- Do not implement fixes
- Do not mock behavior
- Do not live-apply to real HOME
- Do not claim untested coverage

## Review Output

Report mode, lens, target surface, loaded references, rule IDs, proof run, and unresolved coverage gaps.
