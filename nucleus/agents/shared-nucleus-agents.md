# Shared nucleus agent contract

Issues: LOO-96 base contract; LOO-97 autonomous delegation DAG; LOO-98 repair-pack finding-fix loop; LOO-99 offline shared-agent eval harness; LOO-101 canonical package rendering; LOO-102 scratch-HOME shared roster activation; LOO-103 evidence intake and decision log; LOO-104 deterministic shared-package checks; LOO-105 canonical repo-local package source. Status: contract plus offline eval harness plus repo-local canonical packages plus rendered plugin distribution plus deterministic package checks plus scratch-HOME activation proof; this document defines the canonical shared agent model and does not authorize native OMP/Codex/Claude role-agent files or real-HOME apply without HITL review.

Source pattern: [Teaching agents product design at Vercel](https://vercel.com/blog/teaching-agents-product-design-at-vercel).

## Mapping decision

Vercel describes one repo-local `product-design` skill with `AGENTS.md`, `SKILL.md`, focused `references/`, `exemplars/`, eval fixtures, and a human-reviewed update loop.

Loom has a multi-agent nucleus, so the adapted target is **one Vercel-shaped skill package per canonical nucleus agent**, not one giant shared super-skill and not flat `omp-*` role ports.

Each canonical agent package has this shape:

```text
nucleus/skills/{agent-name}/
├── AGENTS.md
├── SKILL.md
├── references/
│   ├── agent-judgment.md
│   ├── rules.md
│   ├── patterns.md
│   ├── glossary.md
│   └── coverage-gaps.md
└── exemplars/
    └── pr-{name}.md
```

Shared cross-agent references such as delegation DAGs, review/proof policy, repair-pack rules, and harness surfaces may live in a common harness reference area, but each agent entrypoint must route to the narrowest relevant source instead of duplicating broad guidance.

## Model

- Skills remain routing, playbooks, triggers, guardrails, references, exemplars, and stable rules.
- Agents are delegated specialists that execute bounded work packets selected by request mode and source routing.
- Harness adapters may translate file format or frontmatter only; names, behavior contracts, routing, references, and packets stay canonical.
- Deterministic checks handle mechanical rules when code can identify the failure and suggest a concrete fix.
- Judgment stays in agent guidance with evidence, explicit assumptions, exceptions, and coverage gaps.

## Naming rules

- Use Factorio workflow nouns.
- Do not use harness prefixes such as `omp-`, `codex-`, or `claude-`.
- Do not treat direct OMP bundled-agent role ports as the target model.
- The same canonical agent roster must be usable across OMP, Codex, Claude, and future model harnesses.

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

## Autonomous delegation DAG

Shared nucleus packages run as a staged DAG, not an ad hoc nested swarm. The parent agent that starts a wave owns integration, conflict resolution, final proof selection, and tracker/PR reporting.

Global policy:

- Maximum autonomous depth is 3: root issue/PR owner at depth 0, each child wave increments depth by one.
- Stop when depth is exhausted, no allowed child exists for the mode/scope, a packet would widen scope, a coverage gap blocks the decision, proof is red before launch, or native rendering/live HOME apply/merge/closeout is requested in this contract slice.
- Child agents never merge PRs, close Linear issues, apply generated files to live HOME, create native OMP/Codex/Claude agent files in this contract slice, or invent standards when references are missing.
- Every wave transition records parent, child agents, issue/PR id, mode, scope, loaded references, allowed next agents, proof state, and stop reason.

Mode boundaries:

| Mode | Allowed next agents | Forbidden autonomous actions |
| --- | --- | --- |
| `shape` | `blueprint`, `ghosts`, `main-bus`, `science-pack`, `radar`, `belt` | Implement code, render native agents, open launch PRs, merge, close issues. |
| `implement` | `roboports`, `recycler`, `modules`, `lab`, `biters`, `spitters`, `spidertron`, `bus-first`, `repair-pack`, `belt` | Merge PRs, close issues, live HOME apply, delegate outside issue/worktree scope. |
| `review` | `biters`, `spitters`, `bus-first`, `radar`, `main-bus`, `science-pack`, `belt` | Edit code, run broad implementation, merge/close issues, claim proof. |
| `prove` | `lab`, `spidertron`, `radar`, `belt` | Change behavior, add features, mock proof, claim unexercised branches. |
| `repair` | `repair-pack`, `lab` | Fix adjacent cleanup, accept multiple findings, change acceptance criteria, skip named proof, spawn review agents. |
| `launch` | `rocket-launch`, `lab`, `radar`, `belt` | Merge PRs, close Linear issues, live HOME apply, native agent rendering, change scope, bypass tracker bridge. |

Per-agent child lists and wave-advance authority live in `agentDelegation` in `nucleus/agents/shared-nucleus-agents.json`. Review and proof may fan out in parallel across distinct lenses such as correctness, security, user-visible behavior, minimal diff, and workflow drift. Implementation children may run in parallel only when packets name disjoint files or the parent owns all integration edits.

`roboports` coordinates the implementation loop: implement the scoped issue in one branch/worktree; fan out `lab`, `biters`, `spitters`, and `spidertron` for proof and review; run `bus-first` after the first review/proof wave; send one concrete finding at a time to `repair-pack`; rerun named proof; return a review-ready PR packet to the parent. `rocket-launch` records launch-gate evidence while the tracker bridge owns closeout outside this contract slice.

## Repair-pack finding-fix loop

`repair-pack` is the fresh-context fixer for one concrete review or proof finding. It is a Vercel-shaped per-agent package, but this slice defines only the contract; it does not create native agent files, eval harnesses, or live HOME output.

Required future package shape:

```text
nucleus/skills/repair-pack/
├── AGENTS.md
├── SKILL.md
├── references/
│   ├── repair-pack.md
│   ├── rules.md
│   └── coverage-gaps.md
└── exemplars/
    └── finding-{stable-id}.md
```

`repair-pack` supports only `repair` mode. It may delegate only the named `prove` check to `lab`, with max one child level. It may not spawn review agents, start broad workflow delegation, render native agent files, implement eval harnesses, or live-apply to HOME.

Every repair request uses a finding packet with these required fields: file, symbol, scope, concrete risk, minimal expected fix, proof check, rule/source id, non-goals, and allowed files. Missing source/rule id, missing proof, missing allowed files, or a fix outside the allowed scope is a blocker, not permission to widen the work.

Repair rules:

1. Accept exactly one finding per packet.
2. Start from fresh compact context: issue/PR id, finding packet, relevant excerpts, allowed files, and named proof only.
3. Apply the minimal expected fix; no drive-by cleanup, style-only edits, broad refactors, or acceptance-criteria changes.
4. Rerun the named proof through `lab` or the coordinator.
5. Run `bus-first` again only when the diff changed or the fix risks scope creep.
6. Return changed files, proof result, residual risk, and blocker reason when blocked.

The original implementer is avoided by default to reduce context drag, anchoring, and bias. Consult them only through the coordinator for one narrow question when intent is unrecoverable from issue/code/proof evidence, the minimal fix would alter an owned API/data contract/user workflow, or the allowed files are insufficient and need scope clarification.

Coverage gaps stop or route work. Missing standards go to `references/coverage-gaps.md`, shape questions route to `blueprint`, `main-bus`, or `science-pack`, and deterministic checks are proposed only when the linter-vs-guidance rule passes.

## Decision authority

Resolve conflicts in this order:

1. The user's explicit goal and constraints.
2. Active Linear issue acceptance criteria.
3. Verified repo code/tests and live PR state.
4. Repository-canonical guidance and routed references.
5. Accepted exemplars with stable evidence.
6. Verified adjacent shipped patterns.
7. General heuristics.

## Starter roster

| Agent | Role | Primary modes | Purpose |
| --- | --- | --- | --- |
| `blueprint` | Spec synthesizer | `shape` | Turns current context into a PRD/spec with acceptance criteria, non-goals, proof plan, and open decisions. |
| `ghosts` | Issue decomposer | `shape` | Splits an approved plan/spec into dependency-ordered Linear issues and sub-issues. |
| `inserter` | Triage router | `shape`, `review` | Classifies, prioritizes, labels, and routes incoming tracker work. |
| `roboports` | Issue delivery coordinator | `implement` | Runs one tracked issue through branch/worktree, implementation, proof, review, and PR readiness. |
| `radar` | Drift scanner | `review`, `prove` | Checks repo/tracker/proof drift and recommends the next route without mutating state. |
| `lab` | Proof specialist | `prove` | Runs proof-only validation and records behavior evidence without expanding scope. |
| `biters` | General adversarial reviewer | `review` | Attacks correctness, regression, maintainability, scope, and missing-test risks before merge. |
| `spitters` | Security attacker | `review` | Runs AppSec/adversarial security review across trust boundaries and abuse paths. |
| `spidertron` | UI workflow tester | `prove`, `review` | Drives browser/desktop UI workflows and captures user-visible proof. |
| `bus-first` | Minimal-diff tightener | `review` | Applies reuse-before-build doctrine and flags needless abstraction or scope creep. |
| `repair-pack` | Narrow finding fixer | `repair` | Fixes exactly one concrete review/proof finding from a fresh compact packet. |
| `main-bus` | Architecture seam planner | `shape`, `review` | Plans shared lanes/seams so features plug into existing structure instead of parallel spaghetti. |
| `science-pack` | Research spike | `shape`, `review` | Resolves one open unknown with source-grounded findings before build. |
| `belt` | Handoff carrier | `shape`, `review` | Moves durable context between agents/threads with concise state, proof, risks, and next actions. |
| `recycler` | Behavior-preserving refactorer | `implement` | Deletes, consolidates, or clarifies existing code without changing behavior. |
| `modules` | Measured performance optimizer | `implement`, `prove` | Optimizes a proven bottleneck with before/after measurement and stops when returns diminish. |
| `rocket-launch` | Launch gatekeeper | `launch` | Records launch-gate readiness after review/proof/CI gates and tracker bridge evidence are satisfied. |

## Rule and evidence schema

Rules use stable IDs and cite their source:

```markdown
## rule/{stable-id}
Status: proposed | accepted | rejected
Scope:
Rule:
Why:
Exceptions:
Source:
Bad example:
Good example:
Assumptions:
Open decisions:
```

Missing or unverified guidance belongs in `references/coverage-gaps.md`, not in an agent's implicit behavior.

## Linter vs agent guidance

Use deterministic checks when all are true:

1. Code can identify the failure without rendering.
2. The rule avoids likely false positives.
3. The violation has a concrete fix.

Use agent guidance when the decision needs workflow/codebase context, the rule would need many exceptions, or the standard is new/policy-bearing. For either path, add an exemplar or eval that can catch regressions.

## Evidence-intake and decision log

Guidance changes follow the Vercel-style collector -> judge -> human review loop. This is a documentation and offline-contract workflow only; it does not collect from live Slack, Figma, GitHub, HOME, session history, or private runtime state.

Collector workflow:

1. Gather messages, links, files, and nearby context: the active issue or PR scope, referenced agent/skill/rule/exemplar/eval/lint/coverage-gap surface, and adjacent shipped guidance needed to understand the excerpt.
2. Preserve source handles, excerpts, timestamps or revisions when available, and unresolved context gaps.
3. Do not score, rank, group, accept, reject, choose destinations, propose rules, or write accepted guidance.

Judge workflow:

1. Validate that cited sources are reachable, relevant to the scoped agent/workflow, and not private live-system state.
2. Separate facts, inferences, and open questions so human reviewers can see what is verified versus assumed.
3. Group related candidates by agent, workflow, rule surface, destination surface, and evidence theme.
4. Keep every candidate pending. The judge does not accept, reject, score, apply changes, or turn candidates into rules.

Human review choices are exactly: rule, reference, exemplar, lint rule, eval, coverage gap, or no change.

Decision-log entries record:

```markdown
Scope:
Rationale:
Evidence:
Exceptions:
Approver:
Target file:
Checks:
```

Accepted changes land in the narrowest relevant destination:

- rule -> agent-specific `references/rules.md` when the guidance is stable and enforceable;
- reference -> agent-specific `references/*.md` when source-grounded context is the durable artifact;
- exemplar -> agent-specific `exemplars/*.md` when a concrete worked example best preserves the decision;
- lint rule -> deterministic lint/check surface only when the linter-vs-guidance rule passes;
- eval -> offline eval fixture when behavior should be regression-tested;
- coverage gap -> `references/coverage-gaps.md` when evidence is missing or the standard remains unresolved;
- no change -> decision log only, with no guidance, lint, eval, exemplar, or reference file changes.

## Activation gate

LOO-102 activates the starter roster only through the plugin-bridge scratch-HOME path:

1. `node scripts/render-plugin-bridge.mjs --home <scratch> --write --json` renders approved create-missing candidates under `~/.agents/plugins/loom-nucleus/` and the personal marketplace catalog, then records marker metadata in `~/.loom-harness/applied-manifest.json`.
2. A second `--write` against the same scratch HOME must be a clean no-op: every appliable candidate reports `already-applied`, no new files are created, and the marker manifest is unchanged.
3. `adapters/plugin-bridge/loom-nucleus/hooks/verify-loom-install.mjs` verifies the installed copy without writing: missing components, marker hash drift, malformed manifests, forbidden provider/auth/profile keys, and non-portable absolute paths produce structured non-zero reports.
4. Proof covers the shared roster package shape once at the source surface and once through each native plugin consumer: OMP-compatible Vercel-shaped packages under `nucleus/skills/{agent-name}/`, Codex via `.codex-plugin/plugin.json#skills`, and Claude via `.claude-plugin/plugin.json#skills`.
5. Existing OMP, Codex, and Claude auth, sessions, histories, caches, DBs, browser state, local settings, plugin caches, and runtime files remain local-only. The renderer only reads tracked source, the resource manifest, and the scratch HOME marker/files it owns.

Live-HOME promotion gate: **dry-run -> review -> explicit apply**. A dry-run manifest and deterministic checks must pass before review; the human reviewer must explicitly approve the apply target before any non-scratch HOME write. The evidence/decision-log owner is the LOO-103 collector -> judge -> human review loop. Required deterministic checks before apply are `scripts/validate-shared-agent-packages.mjs`, `scripts/validate-shared-agent-evals.mjs`, `scripts/render-plugin-bridge.mjs --json`, and the targeted plugin-bridge scratch apply/verifier proof.

## Packet contract

Every agent receives a bounded input packet and returns a bounded output packet. The machine-readable packet fields for each agent live in `nucleus/agents/shared-nucleus-agents.json`. Common invariants:

- report mode, target surface, loaded references, rule IDs, proof run, and unresolved coverage gaps;
- no live HOME apply;
- no scope widening beyond the packet;
- no issue closeout or PR merge in this contract slice; launch records gates for the tracker bridge;
- no native harness agent rendering in this contract slice.

## Superseded direct OMP-role candidates

- `omp-designer` (Codex) — direct OMP designer role port; future UI workflow proof belongs to shared `spidertron` and routed references.
- `omp-planner` (Codex) — direct OMP planning role port; future planning work is split across `blueprint`, `ghosts`, `roboports`, and `main-bus`.
- `omp-reviewer` (Codex) — direct OMP reviewer role port; future review work is split across `biters`, `spitters`, `bus-first`, `lab`, and stable rule citations.
- `omp-librarian` (Codex) — potential OMP research role port; future research belongs to shared `science-pack` and source-grounded references.

These candidates remain only as historical adapter-plan context. LOO-101 removes them from the active plugin renderer path in favor of shared-agent packages, and LOO-105 makes `nucleus/skills/{agent-name}/` the canonical authoring source for those packages. They are not the desired shared nucleus agent model.

## Related and deferred work

- LOO-97 is this slice: autonomous delegation DAG and mode-bound delegation policy.
- LOO-98 is this slice: defines the `repair-pack` finding-fix loop.
- LOO-99 adds retrieval-vs-application evals with judge and holdout fixtures.
- LOO-100 retires OMP-prefixed active candidates.
- LOO-101 renders each shared agent as a Vercel-shaped package for OMP/Codex/Claude adapters.
- LOO-102 activates the shared starter roster only after package rendering, evals, deterministic checks, and governance pass.
- LOO-103 adds the shared evidence-intake collector -> judge -> human decision-log workflow.
- LOO-104 encodes mechanical package checks at `scripts/validate-shared-agent-packages.mjs`; judgment-heavy guidance stays in references, evals, or coverage gaps.
- LOO-105 moves shared-agent package authorship to `nucleus/skills/{agent-name}/`; plugin shared-agent package candidates are derived from `nucleus/skills/{agent-name}/` at render/validation time; the former committed byte-copy distribution tree is intentionally absent.
