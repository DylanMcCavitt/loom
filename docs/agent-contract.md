# Shared nucleus agent contract

This document defines the canonical shared agent model and does not authorize native OMP/Codex/Claude role-agent files or real-HOME apply without HITL review.

Source pattern: [Teaching agents product design at Vercel](https://vercel.com/blog/teaching-agents-product-design-at-vercel). Loom adapts that shape as one Vercel-shaped skill package per canonical agent under `skills/{agent-name}/` (AGENTS.md, SKILL.md, references/, exemplars/). Four kit utilities are repo-owned in the same `skills/` tree; cited engines live operator-local under `~/.agents/skills/` per `docs/skills/operator-local-manifest.md`.

## Model

- Skills remain routing, playbooks, triggers, guardrails, references, exemplars, and stable rules.
- Agents are delegated specialists that execute bounded work packets selected by request mode, source routing, and lens.
- Every harness loads the same package bytes; names, behavior contracts, routing, references, and packets stay canonical.
- Deterministic checks handle mechanical rules; judgment stays in agent guidance with evidence, assumptions, exceptions, and coverage gaps.

## Naming rules

- Use Factorio workflow nouns; no harness prefixes such as `omp-`, `codex-`, or `claude-`.
- The same canonical roster is usable across OMP, Codex, Claude, and future harnesses; direct OMP bundled-agent role ports stay superseded.

## Request modes

Every `SKILL.md` resolves mode before acting so audits do not become edits and proof does not become implementation.

| Mode | Purpose | Boundary |
| --- | --- | --- |
| `shape` | Design workflow, compare alternatives, define acceptance and open decisions. | Do not edit or activate agents unless asked. |
| `implement` | Build or update one scoped agent/workflow feature. | One issue, one branch/worktree, one PR. |
| `review` | Audit source, diff, behavior, or proof. | Report findings; do not edit unless asked. |
| `prove` | Verify behavior and collect evidence. | Proof-only; do not expand scope. |
| `repair` | Fix one concrete finding from a compact packet. | One finding only; no drive-by cleanup. |
| `launch` | Enforce merge/closeout gates. | No red gates; tracker bridge owns closeout. |

## Roster

One agent per mode; behavioral variants are lens references inside the agent package, selected by the packet `lens` field.

| Agent | Role | Primary modes | Lenses (`references/`) |
| --- | --- | --- | --- |
| `blueprint` | Shape owner | `shape` | `spec-synthesis` (default), `issue-decomposition`, `architecture`, `research-spike`, `triage` |
| `roboports` | Issue delivery coordinator | `implement` | `issue-delivery` (default), `refactor`, `performance` |
| `biters` | Adversarial reviewer | `review` | `correctness` (default), `security`, `minimal-diff`, `drift` |
| `lab` | Proof specialist | `prove` | `command-proof` (default), `ui-proof`, `smoke-proof` |
| `repair-pack` | Narrow finding fixer | `repair` | none; one finding per packet |
| `rocket-launch` | Launch gatekeeper | `launch` | none; gate record only |
| `belt` | Handoff carrier | `shape`, `review` | `handoff` (default), `thread-control`, `resume` |

## Lens policy

- The input packet may name one or more lenses; when `lens` is absent, the agent loads its mode default.
- Only the named lens references load; lenses never widen the packet scope or change the mode boundary.
- Review and proof may fan out one child per lens in parallel across correctness, security, user-visible behavior, minimal diff, and workflow drift.

## Pipeline DAG

The delegation matrix is replaced by one pipeline; per-agent child lists are the pipeline edges below.

```text
blueprint -> belt
roboports -> { biters (lens fanout), lab (lens fanout), repair-pack, belt }
biters -> { repair-pack, belt }
repair-pack -> lab
rocket-launch -> { lab, belt }
belt may carry a handoff at any transition
```

Global policy:

- Maximum autonomous depth is 3: root issue/PR owner at depth 0, each child wave increments depth by one.
- The parent that starts a wave owns integration, conflict resolution, final proof selection, and tracker/PR reporting.
- Stop when depth is exhausted, no allowed child exists for the mode/scope, a packet would widen scope, a coverage gap blocks the decision, proof is red before launch, or native rendering/live HOME apply/merge/closeout is requested in this contract slice.
- Child agents never merge PRs, close tracked issues, apply generated files to live HOME, create native OMP/Codex/Claude agent files in this contract slice, or invent standards when references are missing.
- Every wave transition records parent, child agents, issue/PR id, mode, scope, loaded references, allowed next agents, proof state, and stop reason.
- Implementation children may run in parallel only when packets name disjoint files or the parent owns all integration edits.

`roboports` coordinates the implementation loop: implement the scoped issue in one branch/worktree; fan out `lab` and `biters` across proof and review lenses; run the `minimal-diff` lens after the first review/proof wave; send one concrete finding at a time to `repair-pack`; rerun the named proof; return a review-ready PR packet to the parent. `rocket-launch` records launch-gate evidence while the tracker bridge owns closeout outside this contract slice.

## Repair-pack finding-fix loop

`repair-pack` supports only `repair` mode. It may delegate only the named `prove` check to `lab`, with max one child level. It may not spawn review agents, start broad workflow delegation, render native agent files, or live-apply to HOME. Package: `skills/repair-pack/`.

Every repair request uses a finding packet with these required fields: file, symbol, scope, concrete risk, minimal expected fix, proof check, rule/source id, non-goals, and allowed files. Missing fields are a blocker, not permission to widen the work.

1. Accept exactly one finding per packet, starting from fresh compact context.
2. Apply the minimal expected fix; no drive-by cleanup, broad refactors, or acceptance-criteria changes.
3. Rerun the named proof through `lab` or the coordinator; the coordinator reruns the `minimal-diff` lens only when the diff changed or the fix risks scope creep.
4. Return changed files, proof result, residual risk, and blocker reason when blocked.

The original implementer is avoided by default to reduce anchoring and context drag; consult them only through the coordinator for one narrow question when intent is unrecoverable from issue/code/proof evidence or the allowed files need scope clarification.

## Decision authority

Resolve conflicts in this order:

1. The user's explicit goal and constraints.
2. Active tracked-issue acceptance criteria.
3. Verified repo code/tests and live PR state.
4. Repository-canonical guidance and routed references.
5. Accepted exemplars with stable evidence.
6. Verified adjacent shipped patterns.
7. General heuristics.

Coverage gaps stop or route work. Missing standards go to `references/coverage-gaps.md`; shape questions route to `blueprint`; deterministic checks are proposed only when code can identify the failure, false positives are unlikely, and the violation has a concrete fix.

## Execution context

Every packet carries `context: validation | live`.

- `validation` — exercised against fixtures, dry-run surfaces, or other non-live paths; report intended tracker, PR, and live-HOME side effects instead of performing them.
- `live` — normal operation within the mode boundary.

When `context` is absent, assume `live` and state the assumption in the output packet.

## Packet contract

Every agent receives a bounded input packet and returns a bounded output packet. Common invariants:

- report mode, lens, target surface, loaded references, rule IDs, proof run, and unresolved coverage gaps;
- no live HOME apply;
- no scope widening beyond the packet;
- no issue closeout or PR merge in this contract slice; launch records gates for the tracker bridge;
- no native harness agent rendering in this contract slice.

Rules use stable IDs (`## rule/{stable-id}`) citing status, scope, rule, why, exceptions, source, bad/good examples, assumptions, and open decisions. Missing or unverified guidance belongs in `references/coverage-gaps.md`.

### Machine-checkable JSON packets

Emit conformant packets as JSON objects tagged with a top-level `"packet"` kind. Schemas and `validatePacket(kind, object)` live in `scripts/lib/packet-schema.mjs`; `scripts/validate-packets.mjs` scans `retro/**/*.md` (fenced json code blocks) and `retro/**/*.json` for tagged packets. Untagged JSON is ignored. Kinds:

| `packet` value | Purpose |
| --- | --- |
| `repair-finding` | repair-pack finding packet (nine required fields) |
| `agent-input` | common bounded input (`mode`, `targetSurface`, optional `lens`/`lenses`, `context`, `scope`, `issueId`/`prId`) |
| `agent-output` | common bounded output (mode, lens, loaded references, rule IDs, proof run/result, coverage gaps, changed files, optional blocker) |

Field names are camelCase. `context` is `validation` | `live` and defaults to `live` when omitted. Example:

```json
{
  "packet": "agent-input",
  "mode": "repair",
  "context": "validation",
  "targetSurface": "skills/repair-pack",
  "issueId": "LOO-000",
  "lens": "correctness"
}
```

## Governance and activation

Guidance changes follow the practiced retro-packet core: generated packets (scripts/retro-packet.mjs) stay pending under `retro/pr-{number}/`, human PR review is the HITL gate, accepted rules still satisfy the enforced rule schema, and accepted guidance lands only after approval in the narrowest relevant skill destination. The older collector/judge/destination machine is aspirational design vocabulary, not live automation.

Activation machinery (plugin-bridge rendering, shared-agent package/eval validators) is retired: packages load directly from the canonical repo tree, and any live-HOME write still requires explicit HITL approval. Superseded `omp-*` candidates and historical issue context live in repo history.
