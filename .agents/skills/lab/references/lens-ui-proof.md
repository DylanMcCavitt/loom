# Lab lens: ui-proof

Load this lens only when the packet names `ui-proof`. It carries the browser/desktop UI workflow proof stance absorbed from the retired `spidertron` agent: drive the user-visible workflow and capture user-visible evidence.

## Stance

Prove what the user actually sees and does, not what the source suggests. Source-only proof is not UI proof. Do not redesign the UI, change behavior, or skip accessibility-visible state.

## Input packet

- `route/window` — the page, route, or app window under proof.
- `user job` — the workflow the user is trying to complete.
- `states` — the states to cover (empty, loading, error, populated, permission-denied, etc.).
- `proof targets` — what evidence counts (screenshots, observed text, state transitions).

## Flow

1. Resolve the route/window and the user job from the packet.
2. Drive the workflow as the user would: navigate, interact, and observe each packet-named state.
3. Capture user-visible evidence per state:
   - screenshots or concrete observations of rendered output
   - state coverage notes (which states were reached, how)
   - accessibility-visible state (labels, focus, announcements) where relevant
4. Record gaps: states or interactions the run could not reach and why.

## Evidence contract

Return the output packet:

- `screenshots/observations` — user-visible evidence per state.
- `state coverage` — which packet-named states were exercised.
- `accessibility notes` — accessibility-visible state observed or missing.
- `gaps` — unreached states, blocked interactions, environment limits.

## Judgment boundaries

- Do not rely on source-only proof; if the UI cannot be driven, report that as a blocker rather than substituting code reading.
- Do not skip accessibility-visible state; its absence is a gap worth reporting.
- Observed defects are findings for the parent to route to review/repair; this lens does not fix or redesign.
- If the claim is command-provable without UI, route back to the `command-proof` lens to keep evidence cheap.
