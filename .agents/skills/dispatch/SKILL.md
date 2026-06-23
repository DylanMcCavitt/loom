---
name: dispatch
description: Routes each incoming Linear issue to the right place — classify it as bug or enhancement, move it through the contract's triage state machine, and decide what is ready to pick up. Use when sorting incoming Linear issues: classify, prioritize, set state/labels, decide what is ready to pick up, or route bugs vs features.
---

# Dispatch

The filter inserter. Incoming Linear issues arrive on the belt unsorted; dispatch
reads each one and routes it to the right place — it never builds anything. Linear
is the planning system of record; dispatch only moves issues through the
contract's state machine, classifies them, and hands ready work to the skills that
build it.

Dispatch **never implements.** Code, branches, and PRs belong to `robots`.
Splitting a fat plan into tracked slices belongs to `ghosts`.

This skill does not change Linear issue state or labels, post comments, or close
issues while being validated; during real triage it moves one issue through the
contract's state machine and routes it onward.

## Read first: the repo contract

Read the repo contract that `assembler` generated before touching any issue: the
Linear team/project map, the **label/state map**, the domain glossary, and the
commands. The role names below (`needs-triage`, `bug`, …) are *canonical roles* —
the actual Linear label and state strings live in the contract's label/state map.
**Never hardcode a label or state string**; resolve every canonical role through
the contract map before calling `save_issue`. Every comment dispatch posts via
`save_comment` opens with a one-line AI-generated disclaimer so the human record
stays honest.

## The two axes

Every dispatched issue carries **exactly one category role and exactly one state
role** — no more, no less. If the existing state roles conflict, stop and ask the
maintainer before changing anything.

**Category (pick one):**

- `bug` — something is broken.
- `enhancement` — a new feature or improvement.

**State (pick one):**

- `needs-triage` — not yet evaluated (an unlabeled issue starts here).
- `needs-info` — waiting on the reporter for more detail.
- `ready-for-agent` — fully specified; an AFK agent can pick it up.
- `ready-for-human` — needs a human (judgment, design, external access).
- `wontfix` — will not be actioned.

State flow: unlabeled → `needs-triage` → (`needs-info` ↔ `needs-triage`) →
`ready-for-agent` / `ready-for-human` / `wontfix`. The maintainer can override at
any time — flag transitions that look unusual and ask first.

## Triage one issue

1. **Gather context.** Read the full issue, its comments, any prior dispatch
   notes (don't re-ask resolved questions), and the contract glossary. Surface any
   prior `wontfix` that resembles this one ([OUT-OF-SCOPE.md](OUT-OF-SCOPE.md)).
2. **Reproduce bugs before promoting them.** For a `bug`, attempt reproduction
   *first* — trace the code, run the contract's checks, reuse `diagnose`. Report a
   confirmed repro (with the code path), a failed repro, or insufficient detail (a
   strong `needs-info` signal). Never promote a bug to `ready-for-agent` on an
   unreproduced report.
3. **Recommend** one category + one state with reasoning, then act on the outcome.

## Apply the outcome

- `ready-for-agent` — write an **agent brief** comment
  ([AGENT-BRIEF.md](AGENT-BRIEF.md)) via `save_comment`; a fully-specified, ready
  issue is `robots`' to build. Hand it off to `robots`.
- `ready-for-human` — same brief structure; note why it can't be delegated.
- `needs-info` — post triage notes: what's established so far, plus specific,
  actionable questions for the reporter.
- `wontfix` (bug) — explain politely, then close.
- `wontfix` (enhancement) — record it in the out-of-scope memory, link it from a
  comment, then close ([OUT-OF-SCOPE.md](OUT-OF-SCOPE.md)).
- `needs-triage` — apply the role; comment only if there's partial progress.

## Routing

- Fully-specified, ready work → `robots` (it builds one ready issue end-to-end).
  Dispatch sorts; it never implements.
- A plan/spec that still needs splitting into tracked slices → `ghosts`.
- An issue too thin on *intent* (not just detail) → kick it back to its source
  spec or idea rather than inventing scope here.

## Quick state override

If the maintainer says "move ABC-12 to ready-for-agent", trust them: confirm the
role change, comment, and close you're about to apply, then act. Skip reproduction
and grilling. If promoting to `ready-for-agent` with no brief yet, ask whether to
write one.

## Resuming a session

If prior dispatch notes already exist on an issue, read them, check whether the
reporter answered the outstanding questions, and present an updated picture before
continuing. Don't re-ask anything already resolved.
