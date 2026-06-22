# Agents

One orchestrator thread owns each issue end-to-end.

Default roles:

- Alignment Reviewer
- Executor
- PR Reviewer

Preferred mode is a fresh agent per role. If the host cannot spawn fresh role
agents, run the same phases sequentially in one isolated issue thread while
keeping the same gates and artifacts.

## Role 1 — Alignment Reviewer

Inputs:

- `docs/HANDOFF.md`
- `docs/NEXT_THREAD_HANDOFF.md`
- `docs/PLAN.md`
- `docs/issues/<ISSUE>.md`
- current default-branch repo state

Deliverable:

- branch-local `ALIGNMENT.md` committed before code is written

Checks:

- scope still matches repo contract
- blockers really merged
- issue still fits one reviewable PR
- acceptance criteria are testable
- owned paths and required evidence are sufficient

## Role 2 — Executor

Inputs:

- issue packet
- repo handoff docs
- branch-local alignment memo

Responsibilities:

- implement only the issue packet
- stay within owned paths
- run required verification
- collect required evidence
- update `docs/NEXT_THREAD_HANDOFF.md`
- remove `ALIGNMENT.md` before final PR state

## Role 3 — PR Reviewer

Responsibilities:

- rerun verification
- confirm scope stayed narrow
- confirm required evidence is present
- block merge for contract drift, stray edits, or weak proof
