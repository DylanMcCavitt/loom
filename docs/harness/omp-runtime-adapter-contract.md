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

## 5. Transport: RPC host + supplementary extension + CLI

> Revised after the LOO-7 spike (`omp://rpc.md`, `omp://hooks.md`, `omp://extensions.md`). The original draft assumed an extension hook plus a possible control port; the real live-control surface is **RPC mode over stdio**.

The adapter is an **MCP server** whose single command envelope is served by layered backends:

| Layer | Role | Reach |
| --- | --- | --- |
| **MCP server** (stdio, local-only) | The one cross-harness caller contract; owns selector validation, tier gating, confirmation tokens, redaction, and the deny-by-default allow-list. | Codex/Claude consume MCP natively. |
| **RPC host → `omp --mode rpc`** | Live session control. The host **spawns** an omp child in RPC mode and speaks newline-delimited JSON over stdio (`prompt`/`abort`/`get_state`/`set_model`/`compact`/`branch`/`switch_session`/`set_session_name`/`export_html`/`get_messages`/`get_session_stats`/`login`…), waiting for the `{type:"ready"}` frame. | A session the adapter **owns** (spawned), including opening a saved `session_file` in RPC mode. There is **no** attach-to-running-TUI and **no** control port. |
| **Extensions API** (`ExtensionAPI`, `--extension`) — *supplementary* | Only when a need exceeds RPC: custom session-control slash commands, tool-call policy/interception, custom tools/providers, or `session_stop` continuation. Use the **current** Extensions API, not the legacy hooks subsystem (`--hook` is already aliased to `--extension`). Pin the omp version. | Live in-process; bridges UI over RPC mode. |
| **`omp` CLI** | Pure saved-file ops (`--resume`/`--export`/`--session-file`) where an explicit argument suffices. | Saved session files only. |

**Recommended default:** MCP server → RPC host (`omp --mode rpc`) for live ops; `omp` CLI for saved-file ops; the Extensions API only as a supplement. Every op stays local-only and must pass `scripts/dry-run-harness-safety-gate.mjs` before any live effect.

Rationale: one typed MCP schema is the cross-harness contract (selector, tiers, confirmation, redaction in one place); RPC mode is the only surface with genuine live-session access and needs no new port or daemon beyond the spawned child; the extension is reserved for the few needs RPC doesn't cover, keeping the omp-version coupling minimal.

### 5.1 Verified RPC wire schema (omp/16.0.5)

> Reconciled in LOO-10. The PR #71 foundation *assumed* the frame shape (`{id, command, params}` requests and `{id, result}` / `{id, error}` responses) and conformed a mock to it. The real schema below is **verified** against three sources: the bundled implementation `dist/cli.js` (the `{type:"ready"}` writer and the `{type:"response",command,success,…}` builder), the canonical declarations `dist/types/modes/rpc/rpc-types.d.ts` (`RpcCommand` lines 17–167, `RpcResponse` lines 243–519, `RpcSessionState` lines 168–193), and a guarded live `omp --mode rpc` probe (sent `get_state` + `get_session_stats`, captured the frames, killed the child — no model call). `omp://rpc.md` documents the same protocol. `scripts/runtime-adapter/rpc-host.mjs` and `tests/fixtures/mock-omp-rpc.mjs` now match this exactly.

- **Request** (stdin, one JSON object per line): `{ id?: string, type: <command>, ...inline params }`. The command name is the **`type`** field (not `command`); params are **inlined at the top level** (not nested under a `params` object); **`id` is an optional string** the response echoes back (not a required number). Example: `{ "id": "req_1", "type": "set_session_name", "name": "demo" }`.
- **Ready** (stdout, once at startup): `{ "type": "ready" }` — this was the one assumed detail that was already correct.
- **Response** (stdout): success `{ id?, type: "response", command, success: true, data? }`; failure `{ id?, type: "response", command, success: false, error: string }`. The payload key is **`data`** (not `result`); failures carry a string **`error`** and `success: false`. Commands with no payload (e.g. `set_session_name`) omit `data` entirely. Example success: `{ "id": "req_1", "type": "response", "command": "set_model", "success": true, "data": { "provider": "pi", "id": "default" } }`.
- **Correlation**: by the echoed string `id`. Edge cases (from the runtime): an *unknown* command response is emitted with `id: undefined`, and parse/handler exceptions emit `command: "parse"` with `id: undefined` — neither correlates, so the host records them as events rather than resolving a request.
- **Unsolicited frames**: between `ready` and a response the child also emits non-`response` frames — `available_commands_update`, `extension_ui_request`, session/agent events (`agent_start`, `message_update`, …), `host_tool_call`, etc. (observed live). The host records every non-`ready`/non-`response` frame on its event list and never treats it as a command result.
- **Verified op → request type / inline params → success `data`** (the adapter ops in `policy.mjs`):
  - `get_state` — `{}` → `RpcSessionState` (`{ model: { provider, id, … }, sessionId, sessionFile, messageCount, contextUsage: { tokens, contextWindow, percent }, … }`).
  - `get_session_stats` — `{}` → `SessionStats` (`{ sessionId, userMessages, assistantMessages, toolCalls, toolResults, totalMessages, tokens: { input, output, cacheRead, cacheWrite, total }, premiumRequests, cost }`; **no `messages` field** — the assumed mock's `{ messages, tokens }` was fabricated).
  - `set_session_name` — `{ name }` → no `data` (empty name rejected: `Session name cannot be empty`).
  - `set_model` — `{ provider, modelId }` → `Model` (`{ provider, id, … }`). Takes provider+modelId, **not** `model`.
  - `compact` — `{ customInstructions? }` → `CompactionResult` (`{ summary, firstKeptEntryId, tokensBefore, … }`).
  - `branch` — `{ entryId }` → `{ text, cancelled }`.
  - `new_session` — `{ parentSession? }` → `{ cancelled }`.
  - `switch_session` — `{ sessionPath }` → `{ cancelled }`.
  - `get_messages` — `{}` → `{ messages: AgentMessage[] }` (deny-by-default content egress).
  - `login` — `{ providerId }` → `{ providerId }` (deny-by-default).

All ten adapter command names matched the verified `type` values, so no name corrections were needed; the reconciliation corrected the request/response **envelope** (`type`/inline-params/string-`id`; `data`/`success`/`error`) and the documented per-op params. A guarded live probe is preserved as an opt-in test (`LOO_OMP_LIVE=1`, skipped in CI) plus a synthetic mock fixture matching this schema; neither commits captured session content.

### 5.2 CLI saved-file fallback + gated transcript egress (LOO-12)

Some ops have no verified RPC command but reach omp through the **CLI** operating on a saved session file. These dispatch through an **injectable CLI runner** (`scripts/runtime-adapter/cli-runner.mjs`, `makeCliRunner({ command, spawnFn, timeoutMs, makeWorkDir })`), mirroring how `makeRpcHost` is injected into `RuntimeAdapter` — the real runner spawns `omp` and a hermetic fake is substituted in tests (the MCP server does not inject one, so the adapter defaults to the real runner and `server.mjs` is unchanged).

- **`transcript.export`** (`cli: "export"`) → `omp --export <sessionFile> <outPath>` (the first positional after `--export` is the output path; verified in `dist/cli.js`). The runner writes the HTML into a throwaway dir, reads it back deterministically, and removes the dir. There is **no `--session-file` flag** — saved-file selection uses the resolved `.jsonl` path (and `--resume <id|path>` for opening, which is interactive/TUI and therefore intentionally **not** wired as a one-shot adapter op).
- **Egress stays deny-by-default.** `transcript.export` / `transcript.share` / `transcript.get` remain in the denied set and are reachable **only** through the full explicit path — `explicitApproval: true` **and** `approved: true` **and** a valid selector-bound `confirmationToken`. Any missing or non-`true` piece (or a wrong token) is refused with `denied_by_default`; the backend is never reached.
- **Everything that leaves is redacted.** The adapter scrubs the CLI runner's entire return value through the same `scrubSecrets`/`scrubString` (secret patterns + private home paths) used for RPC results, so exported HTML, paths, or stdout can never egress unredacted.

## Open questions — resolved (LOO-7 spike)

Verified against omp/16.0.5 (`omp://rpc.md`, `omp://hooks.md`, `omp://extensions.md`, `omp --help`, `~/.omp/agent/sessions/`):

- **Live control endpoint** — RPC mode (`omp --mode rpc`), newline-delimited JSON over stdio; no port, no TUI-attach. The adapter spawns/owns the omp child.
- **Extension API** — the current Extensions API (`ExtensionAPI`, `--extension`) is real and packaged; the legacy hooks subsystem is superseded (`--hook`→`--extension`). Pin the omp version; treat the extension as supplementary to RPC.
- **Session id** — `<ISO-timestamp>_<UUIDv7>.jsonl` under cwd-keyed `~/.omp/agent/sessions/<cwd>/`; id = the UUIDv7. Select via `--resume <id-prefix | filename-prefix | path>`.
- **`/rename` vs `/move`** — rename = `set_session_name` (header metadata, reversible → Tier M); move = relocates the session file (→ Tier D).
- **Concurrent sessions** — the adapter owns each session as a spawned RPC child, so live ops have no "which session" ambiguity; saved-file ops key on the unique `.jsonl` path. Explicit-selector + refuse-and-list is sufficient.
- **Transcript egress** — capability exists (`get_messages`/`export_html`/`/dump`/`/export`/`/share` with secret redaction); policy is deny-by-default cross-harness, explicit approval + redaction if ever allowed.

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
