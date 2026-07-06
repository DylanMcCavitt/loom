# Blueprint lens: issue-decomposition

Loaded when the packet names `lens: issue-decomposition`. Splits an accepted
plan/spec/PRD into dependency-ordered Linear issues and sub-issues so
`roboports` can build them. (Absorbs the retired `ghosts` agent.)

## Judgment

- A planned issue is planned work, not yet built. This lens **never implements**
  and **never changes the parent idea's scope** — it only stamps work that
  already got decided. If the plan is wrong or thin, kick it back to the
  spec-synthesis lens (spec) or the originating idea — never silently widen,
  narrow, or rewrite what the parent decided.
- Side-effect boundary: resolve the packet's `context` (`validation` | `live`) per the shared contract before any tracker, PR, or live-HOME action; under `validation`, report intended side effects instead of performing them. During
  real planning it stamps the decided work as dependency-ordered issues.

## Playbook

### 1. Read the plan and the envelope

Read the repo envelope before stamping anything: the Linear team/project/label
map, domain glossary, milestone list, estimate scale, and the HITL/AFK state
map. Read the source spec too — usually the blueprint PRD document on the
project. Do not hardcode a tracker, team, label set, or states.

### 2. Cut tracer-bullet vertical slices

Break the plan into tracer-bullet issues — thin **vertical** slices, never
horizontal layer-only ones:

- Each slice cuts through **every layer end-to-end** (schema, API, UI, tests) —
  a narrow but complete path.
- A completed slice is **demoable or verifiable on its own**.
- **Prefer many thin slices over few thick ones.** When in doubt, split.

Mark each slice **HITL** (needs a human in the loop: an architectural decision,
a design review, a manual check) or **AFK** (implementable and mergeable
without one). Prefer AFK where possible.

Size each slice for **one issue → one branch → one PR**: `roboports` names the
branch with the Linear issue id and the PR auto-closes the issue on merge. A
slice too big to ride one PR is too big.

### 3. Set dependencies

Lay the slices out as a DAG: which slices block which. Keep it acyclic. Group
multi-slice features under a parent issue with sub-issues. Confirm granularity
and the dependency graph with the user before publishing if the breakdown is
non-obvious.

### 4. Publish to Linear in dependency order

Publish with `save_issue`, **blockers first**, so every blocked-by relation can
reference a real issue id: `parent` for sub-issues, `blockedBy`/`blocks` for
relations, and `labels`/`project`/`milestone`/`estimate` from the envelope's
map (HITL/AFK via the envelope label/state). Use the issue template the
envelope provides (`templates/linear-issue.md` is the default scaffold). If
none, each issue body carries: what to build (end-to-end behavior, not
layer-by-layer; no stale file paths/snippets except a decision-encoding
prototype snippet), acceptance criteria, non-goals, test/check expectations,
and blocked-by. Return the created issue ids/links.

## Boundaries

- A request to **implement, start, or continue** a specific issue is
  `roboports`, not this lens.
- Pure prioritizing, sorting, or state-triage of issues that already exist is
  the triage lens.

## Packet output

- created issue ids
- dependency graph
- acceptance criteria per slice
- blockers
