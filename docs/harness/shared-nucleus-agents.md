# Shared nucleus agent contract

Issues: LOO-96 base contract; LOO-97 autonomous delegation DAG. Status: contract-only. This document defines the canonical shared agent model; it does not render or activate native OMP, Codex, or Claude agent files.

Source pattern: [Teaching agents product design at Vercel](https://vercel.com/blog/teaching-agents-product-design-at-vercel).

## Mapping decision

Vercel describes one repo-local `product-design` skill with `AGENTS.md`, `SKILL.md`, focused `references/`, `exemplars/`, eval fixtures, and a human-reviewed update loop.

Loom has a multi-agent nucleus, so the adapted target is **one Vercel-shaped skill package per canonical nucleus agent**, not one giant shared super-skill and not flat `omp-*` role ports.

Each future agent package should have this shape:

```text
.agents/skills/{agent-name}/
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
- Stop when depth is exhausted, no allowed child exists for the mode/scope, a packet would widen scope, a coverage gap blocks the decision, proof is red before launch, or native rendering/live HOME apply/merge/closeout is requested outside its gate.
- Child agents never merge PRs, close Linear issues, apply generated files to live HOME, create native OMP/Codex/Claude agent files in this contract slice, or invent standards when references are missing.
- Every wave transition records parent, child agents, issue/PR id, mode, scope, loaded references, allowed next agents, proof state, and stop reason.

Mode boundaries:

| Mode | Allowed next agents | Forbidden autonomous actions |
| --- | --- | --- |
| `shape` | `blueprint`, `ghosts`, `main-bus`, `science-pack`, `radar`, `belt` | Implement code, render native agents, open launch PRs, merge, close issues. |
| `implement` | `roboports`, `recycler`, `modules`, `lab`, `biters`, `spitters`, `spidertron`, `bus-first`, `repair-pack`, `belt` | Merge PRs, close issues, live HOME apply, delegate outside issue/worktree scope. |
| `review` | `biters`, `spitters`, `bus-first`, `radar`, `main-bus`, `science-pack`, `belt` | Edit code, run broad implementation, merge/close issues, claim proof. |
| `prove` | `lab`, `spidertron`, `radar`, `belt` | Change behavior, add features, mock proof, claim unexercised branches. |
| `repair` | `repair-pack`, `lab`, `biters`, `bus-first` | Fix adjacent cleanup, accept multiple findings, change acceptance criteria, skip named proof. |
| `launch` | `rocket-launch`, `lab`, `radar`, `belt` | Merge with red gates, close issues by hand, change scope, bypass tracker bridge. |

Per-agent child lists and wave-advance authority live in `agentDelegation` in `docs/harness/shared-nucleus-agents.json`. Review and proof may fan out in parallel across distinct lenses such as correctness, security, user-visible behavior, minimal diff, and workflow drift. Implementation children may run in parallel only when packets name disjoint files or the parent owns all integration edits.

`roboports` coordinates the implementation loop: implement the scoped issue in one branch/worktree; fan out `lab`, `biters`, `spitters`, and `spidertron` for proof and review; run `bus-first` after the first review/proof wave; send one concrete finding at a time to `repair-pack`; rerun named proof; return a review-ready PR packet to the parent. `rocket-launch` records launch-gate evidence while the tracker bridge owns closeout outside this contract slice.

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
| `rocket-launch` | Launch gatekeeper | `launch` | Ships a ready PR only after review/proof/CI gates and tracker bridge are satisfied. |

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

Guidance changes follow the Vercel-style collector -> judge -> human review loop:

1. Collector gathers messages, links, files, and nearby context. It does not score candidates or propose rules.
2. Judge validates sources, separates facts from inferences/open questions, groups candidates, and keeps them pending.
3. Human review chooses the narrowest destination: rule, reference, exemplar, lint rule, eval, coverage gap, or no change.
4. Accepted changes record scope, rationale, evidence, exceptions, approver, and checks.

## Packet contract

Every agent receives a bounded input packet and returns a bounded output packet. The machine-readable packet fields for each agent live in `docs/harness/shared-nucleus-agents.json`. Common invariants:

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

These candidates may remain as historical adapter-plan context until a cleanup issue retires them from active renderer paths. They are not the desired shared nucleus agent model.

## Related and deferred work

- LOO-97 is this slice: autonomous delegation DAG and mode-bound delegation policy.
- LOO-98 defines the `repair-pack` finding-fix loop.
- LOO-99 adds retrieval-vs-application evals with judge and holdout fixtures.
- LOO-100 retires OMP-prefixed active candidates.
- LOO-101 renders each shared agent as a Vercel-shaped package for OMP/Codex/Claude adapters.
- LOO-102 activates the shared starter roster only after package rendering and evals pass.
- Future linter/check issue: encode mechanical rules that pass the linter-vs-guidance test.
- Future evidence-intake issue: add collector -> judge -> human decision-log workflow.
