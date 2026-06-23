---
name: ghosts
description: Splits a plan, spec, or PRD into tracer-bullet vertical slices and publishes them as dependency-ordered Linear issues and sub-issues with blocked-by relations. Use when the user wants to turn a plan, spec, or PRD into tracked issues, create implementation tickets, or break work down.
---

# Ghosts

In Factorio a ghost is a planned-but-unbuilt entity — a stamped outline waiting for construction robots. Here a ghost is a Linear issue: planned work, not yet built. This skill stamps a plan/spec/PRD as dependency-ordered Linear issues and sub-issues so `robots` can build them.

Linear is the planning system of record. This skill **never implements** and **never changes the parent idea's scope** — it only stamps the work that already got decided.

This skill does not create Linear issues or sub-issues while being validated;
during real planning it stamps the decided work as dependency-ordered issues.

## Read first: the repo contract

Read the repo contract that `assembler` generated before stamping anything: the Linear team/project/label map, domain glossary, milestone list, estimate scale, and the HITL/AFK state map. Read the source spec too — usually the `blueprint` PRD document on the project (or the plan in context). Do not hardcode a tracker, team, label set, or states; read them from the contract.

## What this skill does NOT do

- **Does not implement.** Stamping ghosts is the whole job. Code, branches, and PRs belong to `robots`.
- **Does not rescope the parent.** If the plan is wrong or thin, kick it back to `blueprint` (spec) or `prospect` (idea) — never silently widen, narrow, or rewrite what the parent decided.

## Process

### 1. Read the plan and the contract

Work from the spec/PRD/plan in context. Title and describe issues with the domain glossary from the contract; respect ADRs in the area.

### 2. Cut tracer-bullet vertical slices

Break the plan into tracer-bullet issues — thin **vertical** slices, never horizontal layer-only ones.

<vertical-slice-rules>
- Each slice cuts through **every layer end-to-end** (schema, API, UI, tests) — a narrow but complete path.
- A completed slice is **demoable or verifiable on its own**.
- **Prefer many thin slices over few thick ones.** When in doubt, split.
</vertical-slice-rules>

Mark each slice **HITL** or **AFK**. HITL slices need a human in the loop (an architectural decision, a design review, a manual check). AFK slices can be implemented and merged without one. Prefer AFK where possible.

Size each slice for **one issue → one branch → one PR**: this is the bridge — `robots` names the branch with the Linear issue id, and the PR auto-closes the issue on merge. A slice too big to ride one PR is too big.

### 3. Set dependencies

Lay the slices out as a DAG: which slices block which. Keep it acyclic. Group multi-slice features under a parent issue with sub-issues. Confirm granularity and the dependency graph with the user before publishing if the breakdown is non-obvious.

### 4. Publish to Linear in dependency order

Publish with `save_issue`, **blockers first**, so every blocked-by relation can reference a real issue id:

- `parent` — attach sub-issues to their parent issue.
- `blockedBy` / `blocks` — wire the dependency relations (publishing blockers first makes their ids referenceable).
- `labels`, `project`, `milestone`, `estimate` — from the contract's map; HITL/AFK via the contract label/state.

Use the issue template the contract/`blueprint` provides. If none, each issue body carries: what to build (end-to-end behavior, not layer-by-layer; no stale file paths/snippets except a decision-encoding prototype snippet), acceptance criteria, non-goals, test/check expectations, and blocked-by. Return the created issue ids/links.

## Routing

- The source spec comes from `blueprint` (PRD) or `prospect` (idea brief). Missing or too thin? Route back there — do not invent scope.
- Hand off to `robots` to build the ghosts. A request to **implement, start, or continue** a specific issue (e.g. "implement ABC-12") is `robots`, not this skill.
- Pure prioritizing, sorting, or state-triage of issues that already exist is `dispatch`.
