# OMP Runtime Control Adapter Contract

Linear LOO-1 defines the design contract for an OMP runtime control adapter: the surface a non-OMP harness (Codex or Claude) would use to reach into a live OMP session for commands that cannot be ported as plain skills. This slice is a design contract only. It defines the boundary, taxonomy, transport recommendation, and proposed acceptance criteria; it does not implement an adapter, does not open a control endpoint, and does not read or copy any live OMP runtime state.

The canonical machine-readable command source is `docs/harness/omp-builtins/portability-matrix.json`, generated for issue #40 from the issue #39 command snapshot at `docs/harness/omp-builtins/commands.json`. The OMP version behind that snapshot is `omp/16.0.5` (`docs/harness/omp-builtins/source.json`). Every command cited below is a real row in the portability matrix.

## Scope and non-goals

In scope: the contract for commands the portability matrix marks `adapter-required` (and the `runtimeSessionCommand: true` hybrids), because plain `SKILL.md` ports cannot attach to the live OMP TUI/session runtime (`docs/harness/omp-builtins/portability-matrix.md`, "Runtime boundary").

Out of scope: porting `skill`-class behavior (covered by the Codex/Claude adapter plans), `cli-wrapper`-class commands that already work on explicit arguments, and `omp-only` TUI affordances. This document also does not pick a wire format, write code, or modify `~/.omp`.

## Grounding references

- `docs/harness/omp-builtins/portability-matrix.json` — per-command `portabilityClass`, `runtimeSessionCommand`, `stableCli`, and `rationale`.
- `docs/harness/omp-builtins/portability-matrix.md` — runtime-boundary policy, stable CLI-backed set, and `openProductDecisions` summary.
- `docs/harness/omp-builtins/resource-index.json` — `runtimeOnlySurfaces` and `excludedRuntimeState` (the local-only runtime paths).
- `docs/harness/resource-manifest.md` / `docs/harness/resource-manifest.json` — dispositions and the `omp-runtime-state` local-only entry.
- `docs/harness/codex-adapter-plan.md` and `docs/harness/claude-adapter-plan.md` — the established strict-manual approval, dry-run, and forbidden-content conventions this contract reuses.
- `docs/harness/dry-run-link-plan.json` and `scripts/dry-run-harness-safety-gate.mjs` — the read-only pre-write safety gate this adapter must pass before any live action.
- `omp/.omp/agent/RULES.md` — never put secrets in tracked files; preserve unrelated user changes.

## Why a runtime adapter

The `adapter-required` class in `portability-matrix.json` is defined as: "Requires a runtime control adapter because the command reads or mutates the active OMP session, TUI state, transcript, provider stream, or collaboration state." The matrix marks these rows `runtimeSessionCommand: true`. A static skill file cannot attach to that runtime, so the only safe cross-harness path is an explicit adapter with a typed command envelope, an explicit session selector, and an allow/deny policy. The `openProductDecisions` array in `portability-matrix.json` names the five product decisions this contract resolves into a design: the runtime adapter command envelope, live session identity, skill ports versus native features, CLI wrapper permissions, and transcript/share privacy.

## 1. Runtime-command use cases (derived from the portability matrix)

Every command below is an `adapter-required` row in `portability-matrix.json` unless marked as a hybrid. Use cases are grouped by the runtime surface they touch; the rationale text is quoted from the matrix.

- **Session lifecycle and identity** — `/session` ("Reads or deletes the current OMP session"), `/rename` ("Renames the active session"), `/move` ("Moves the current OMP session file, which requires live session identity"), `/drop` ("Deletes the active OMP session and starts a replacement"), `/new` ("Starts a new active OMP session"). Hybrid: `/resume` (`omp --resume <session-id-or-path>`) launches a saved session by explicit id/path.
- **Transcript, context, and turn control** — `/dump` ("Returns the current transcript from live session state"), `/compact` ("Mutates the current conversation context"), `/shake` ("Removes heavy content from the active conversation context"), `/context` ("Reads active session context accounting from the runtime"), `/fresh` ("Resets live provider stream state while preserving transcript"), `/retry` ("Retries the last failed active agent turn"). Hybrid: `/export` (`omp --export <session-file>`) has a stable CLI when the session file is explicit, but exporting the active TUI session still needs runtime selection.
- **Session tree and branching** — `/branch` ("Creates a branch from a selected previous message, so it needs access to OMP's live message tree and selection state"), `/fork` ("Forks from a selected prior message in the active session tree"), `/tree` ("Navigates OMP's active session tree and branch selection").
- **Runtime flags and scheduler state** — `/advisor`, `/fast` ("Toggles fast mode for the active session runtime"), `/force` ("Forces the next turn to use a tool"), `/goal` ("Maintains persistent autonomous goal state inside the active OMP session"), `/loop` ("Resubmits future prompts after yields"), `/browser` ("Changes browser mode inside the active OMP runtime"), `/plan-review` ("Reopens the latest OMP plan review from active runtime state").
- **Model lane** — `/switch` ("Changes the model for the active OMP session"). Hybrid: `/model` (`omp models ... --json`) is catalog inspection only; switching stays runtime-bound.
- **Memory and todo** — `/memory` ("Manages OMP memory stores and queues through slash handlers; a skill cannot safely read or mutate those stores"), `/todo` ("Manages OMP todo state through the slash handler").
- **Background jobs and diagnostics** — `/jobs` ("Reads live OMP background job state"), `/debug` ("Opens live debug selectors and can dump the next request, which depends on runtime internals").
- **Collaboration and sharing** — `/collab` ("Starts, stops, or views live sharing for the current session and relay connection"), `/leave` ("Leaves the active collaboration session"), `/share` ("Creates a share link from the active session transcript and configured sharing backend"). Hybrid: `/join` (`omp join <link>`) has a stable CLI but the joined session remains OMP-owned.
- **Provider auth** — `/login` ("Runs provider OAuth flows against OMP auth/runtime state and may handle redirect URLs"), `/logout` ("Mutates OMP provider auth state for the selected provider").
- **Plugin and MCP runtime** — `/mcp` ("in-session MCP handler, including resources, prompts, notifications, reloads, and reauth; no stable top-level `omp mcp` CLI is present"), `/reload-plugins` ("Reloads plugin state inside the running OMP process").

## 2. Session-selection semantics

The matrix `openProductDecisions` poses the core risk directly: "How should a non-OMP harness select the active OMP session for adapter-required commands without accidentally mutating the wrong TUI session?" The contract answers: **an adapter command MUST name its target session explicitly; there is no implicit "current" session.**

Selector forms, ordered from most to least stable, aligned with the identifiers OMP already accepts:

- `session_id` — a stable OMP session id. This mirrors the `omp --resume <session-id-or-path>` identifier in `portability-matrix.md`.
- `session_file` — an explicit saved session file path under `~/.omp/agent/sessions/`. This mirrors the `omp --export <session-file>` argument and is the only selector usable for the saved-file (non-live) subset.
- `live_handle` — a runtime handle for a *running* TUI process (for example a loopback port; `omp stats --json|--summary|--port <port>` shows OMP can bind a local port). The exact live-control handle is an Open question below; this contract reserves the slot without asserting the mechanism exists today.

Binding rules:

- Required selector: every adapter command takes exactly one selector. A call with no selector is rejected, never silently routed to "the current session."
- No "most recent" default: the adapter never resolves an ambiguous or omitted selector to the newest or only session. If a selector matches zero or more than one session, the adapter refuses and returns the candidate set as metadata (ids only) for the caller to disambiguate.
- Explicit self-target opt-in: a co-located transport (the extension hook in section 5) MAY expose the running session via an explicit `target: "self"` flag. `self` is still an explicit selection, not a fallback, and is unavailable to out-of-process callers (CLI/MCP) which must pass `session_id`/`session_file`.
- Confirmation token binding: Tier M and Tier D ops (section 4) require a confirmation token that is bound to the resolved selector, so a confirmation for one session can never be replayed against another.

## 3. Allowed ops, denied ops, safety prompts, and local-only boundaries

### Allowed by default

- Tier R read-only inspection that returns **derived metadata only** — counts, ids, names, status flags, lane name, job counts, context accounting numbers — never raw private content.
- Tier M safe metadata updates behind a confirmation token: `/rename`, `/move`, benign runtime-flag toggles (`/advisor`, `/fast`, `/browser`, `/force`, `/loop`, `/goal`), `/todo` updates, and additive tree ops (`/branch`, `/fork`).

### Denied by default

- Any op that egresses private content to the calling harness without explicit approval and redaction: `/dump`, `/export` of a live session, `/share`, `/debug` "dump next request", and `/memory` content reads.
- Auth mutation: `/login`, `/logout` are deny-by-default; auth flows stay native to each harness unless a future issue approves a narrow path.
- `omp-only` lifecycle and TUI affordances are never adapter targets: `/exit`, `/quit` (process lifecycle), `/copy` (clipboard picker), `/hotkeys`, `/extensions` (`portability-matrix.json` marks these `omp-only`).
- Anything not enumerated in the adapter's allow-list. The default posture is deny; new ops are added by explicit review, mirroring the "CLI wrapper permissions" decision (which CLI surfaces may mutate config/auth/plugins/SSH versus stay read-only until reviewed).

### Safety prompts (human-in-the-loop)

- Tier D destructive/runtime-changing ops require explicit human confirmation before execution, reusing the `strict-manual` gate that both adapter plans recommend (`docs/harness/codex-adapter-plan.md`, `docs/harness/claude-adapter-plan.md`): a previewed action, dangerous-content validation, and explicit approval bound to the resolved selector.
- Tier M ops require a lightweight confirmation token (no preview diff) bound to the selector.
- Tier R ops require no prompt but are still selector-gated and metadata-only.
- Every adapter action must pass the read-only safety gate (`scripts/dry-run-harness-safety-gate.mjs`, `docs/harness/dry-run-link-plan.json`) before any live effect; the gate already rejects secret-looking values, private home paths, and local-only write targets.

### Local-only data boundaries

The adapter MUST NOT expose or copy live runtime state. `docs/harness/resource-manifest.json` (`omp-runtime-state`) and `docs/harness/omp-builtins/resource-index.json` (`excludedRuntimeState`) mark these paths local-only:

- `~/.omp/agent/sessions/`, `~/.omp/agent/terminal-sessions/`, `~/.omp/agent/blobs/`, `~/.omp/agent/cache/`, `~/.omp/agent/logs/`, `~/.omp/agent/*.db`, `~/.omp/agent/*.sqlite`.

Boundary rules:

- Transcripts (`/dump`, `/export`, `/share`), provider auth state (`/login`, `/logout`), and memory store contents (`/memory`) are never returned to the calling harness by default. The matrix `openProductDecisions` "Transcript and share privacy" requires an approval-and-redaction policy before any dump/export/share/move/delete of an active session.
- Read ops return metadata derived at the OMP boundary, not file contents. The adapter reports presence and counts by selector, consistent with the manifest rule that dry runs "may report presence by path pattern, but never copy session, database, blob, terminal, cache, log, or history contents."
- `omp/.omp/agent/RULES.md` applies: no secrets, tokens, or credentials cross the adapter into tracked or transported output, and unrelated user state is preserved.

## 4. Operation taxonomy and command classification

Three tiers, by blast radius:

- **Tier R — read-only inspection.** Returns derived metadata; no mutation, no content egress. Selector required, no confirmation.
- **Tier M — safe metadata / benign runtime update.** Reversible, no data loss, no auth/model-routing change, no external egress. Selector + lightweight confirmation token.
- **Tier D — destructive or runtime-changing.** Deletes/mutates transcript or context irreversibly, changes model/auth routing, resets the provider stream, or egresses private content. Selector + HITL confirmation; several are deny-by-default.

| Command | Matrix class | Tier | Selector | Confirmation | Notes |
| --- | --- | --- | --- | --- | --- |
| `/context` | adapter-required | R | required | none | Context accounting numbers only. |
| `/jobs` | adapter-required | R | required | none | Background job counts/status, not job output. |
| `/tree` | adapter-required | R | required | none | Read/navigate tree; selection is not mutated in R mode. |
| `/session` (read) | adapter-required | R | required | none | Session metadata. |
| `/memory` (inspect) | adapter-required | R | required | none | Store/queue **metadata only**; contents are local-only. |
| `/todo` (read) | adapter-required | R | required | none | Todo list state. |
| `/plan-review` | adapter-required | R | required | none | Reopen/read the latest plan review. |
| `/rename` | adapter-required | M | required | light token | "Renames the active session." |
| `/move` | adapter-required | M | required | light token | Relocates the session file; selector binds the move. |
| `/todo` (update) | adapter-required | M | required | light token | Add/check todo items. |
| `/advisor` `/fast` `/browser` `/force` `/loop` `/goal` | adapter-required | M | required | light token | Reversible runtime-flag toggles. |
| `/branch` `/fork` | adapter-required | M | required | light token | Additive tree ops; need a message anchor in the selector. |
| `/retry` | adapter-required | D | required | HITL | Re-runs the last failed turn; mutates transcript. |
| `/compact` `/shake` | adapter-required | D | required | HITL | Irreversible context mutation. |
| `/fresh` | adapter-required | D | required | HITL | Resets the live provider stream. |
| `/switch` | adapter-required | D | required | HITL | Changes the model for the active session. |
| `/new` `/drop` `/session` (delete) | adapter-required | D | required | HITL | `/drop` and delete remove the session. |
| `/dump` `/export` (live) `/share` | adapter-required (`/export` hybrid) | D | required | HITL + redaction | Transcript egress; deny-by-default, approval + redaction required. |
| `/collab` `/leave` | adapter-required | D | required | HITL | Live relay/collaboration state. |
| `/login` `/logout` | adapter-required | D | required | HITL | Auth mutation; deny-by-default. |
| `/mcp` (reload/reauth) `/reload-plugins` | adapter-required | D | required | HITL | Mutates running plugin/MCP runtime. |
| `/debug` (dump next request) | adapter-required | D | required | HITL + redaction | Request egress; deny-by-default. |

Hybrids for contrast (not adapter-required because they have a stable CLI on explicit arguments, per `portability-matrix.json`): `/resume` (`omp --resume`), `/export` of a saved file (`omp --export`), `/stats`, `/usage`, `/model`, `/plugins`, `/settings`, `/ssh`, `/setup`, `/agents`, `/marketplace`, `/join`. These should route through the CLI wrapper, not the runtime adapter, whenever the caller can supply the explicit argument.

## 5. Transport comparison and recommended default

| Transport | Reach | Strengths | Weaknesses |
| --- | --- | --- | --- |
| Local CLI wrapper (`omp ...`) | Saved session files only | Stable, scriptable, auditable, no new daemon; aligns with the existing `cli-wrapper` class and the dry-run gate; works for `--resume`/`--export`/`--session-file`. | Most `adapter-required` rows have `stableCli: null` — the CLI cannot reach the live in-memory session, toggle runtime flags, read the live context meter, or mutate a running stream. |
| MCP server (loopback, local-only) | Cross-harness control plane | Both Codex and Claude consume MCP natively; one typed schema satisfies the "runtime adapter command envelope" decision; centralizes selector validation, allow/deny, confirmation, and redaction; can front both the CLI and an extension hook without changing the caller contract. | Needs a running, scoped server; adds a process and attack surface; must bind loopback and never expose transcripts/auth; no `omp mcp` top-level CLI exists today (`/mcp` rationale in the matrix), so live in-process actions still need the extension hook beneath it. |
| OMP extension hook | Live in-process session/TUI | The only transport with genuine access to live message tree, provider stream, scheduler, and selection — exactly what `adapter-required` commands need; runs inside OMP's trust boundary and can drive OMP's own confirmation UI. | OMP-specific and not callable by Codex/Claude on its own (it is the producer, not the cross-harness surface); couples to OMP internals/version; extension command registration is itself runtime state (`resource-index.json` `runtimeOnlySurfaces`: `omp-runtime-extension`). |

**Recommended default: an MCP server as the single cross-harness adapter envelope, backed by an OMP extension hook for live in-process actions, with the local CLI wrapper as the fallback for saved-session-file ops.**

Rationale:

- The caller contract should be one typed schema, which directly answers the `openProductDecisions` "Runtime adapter command envelope" question; separate per-command tools would fragment the allow/deny and redaction policy.
- MCP is native to both target harnesses, so neither Codex nor Claude needs a bespoke client, and the session selector, tier gating, confirmation tokens, and local-only redaction live in exactly one place.
- MCP is a façade, not the worker: live ops delegate to the extension hook (the only layer with real runtime access), and pure saved-file ops delegate to the stable `omp` CLI. This keeps the recommendation honest given that most `adapter-required` rows have no stable CLI today.
- The whole surface stays loopback and local-only and must pass `scripts/dry-run-harness-safety-gate.mjs` before any live effect, consistent with the repo's dry-run-to-apply model in `README.md`.

## Open questions

- **Live control endpoint.** Does `omp/16.0.5` expose a stable local control channel for a *running* session? The `omp stats --port <port>` flag (matrix) shows OMP can bind a port, but whether that port accepts session-control commands is not in the snapshot and is not asserted here.
- **Extension hook API.** Is there a documented, version-stable OMP extension API for registering session-control hooks? `resource-index.json` marks extension registration as runtime, plugin-owned state, so the API surface is not snapshotted.
- **Session id semantics.** The format, uniqueness, and stability of OMP session ids across `~/.omp/agent/sessions/` are unknown; the snapshot is path-only and contents were not read.
- **`/rename` and `/move` durability.** Whether these mutate only the live session record or also rewrite the on-disk session file atomically is unconfirmed and affects whether they are safely reversible (Tier M) versus Tier D.
- **Concurrent live sessions.** Disambiguation policy when multiple live TUIs run at once needs a product decision beyond "refuse and return candidates."
- **Transcript egress at all.** Whether redacted `/dump`/`/export`/`/share` is ever desirable cross-harness, or whether transcripts should never leave OMP regardless of approval, is a privacy decision deferred to the implementation issue.

## 6. Proposed acceptance criteria for the implementation issue

A future implementation issue should be accepted when:

1. A single MCP adapter schema (the command envelope) is defined, with every operation carrying a mandatory session selector (`session_id` | `session_file` | `live_handle`/`self`) and no implicit "current" session.
2. Selector resolution refuses on zero or ambiguous matches and returns candidate ids only, never auto-selecting the newest or only session.
3. Tier R read-only operations are implemented first and return derived metadata only; no transcript, auth, or memory contents cross the adapter.
4. The allow/deny policy is enforced as deny-by-default, with `/login`, `/logout`, `/dump`, live `/export`, `/share`, and `/debug` request-dump denied by default and only reachable through an explicit approved path.
5. Tier M operations require a selector-bound lightweight confirmation token; Tier D operations require selector-bound HITL confirmation plus redaction for any egress op.
6. The adapter passes `scripts/dry-run-harness-safety-gate.mjs` and never writes to or reads contents of the `excludedRuntimeState` paths in `docs/harness/omp-builtins/resource-index.json`.
7. The extension-hook backing for live ops and the `omp` CLI fallback for saved-file ops are wired behind the same MCP schema without changing the caller contract.
8. `node:test` coverage asserts: selector-required rejection, ambiguous-selector refusal, deny-by-default for the denied set, tier-to-confirmation mapping for each representative command in section 4, and that no local-only path is read or written.
9. The implementation cites the resolved answers to the six Open questions above, or records the still-open ones, so no behavior is built on a fabricated runtime capability.
