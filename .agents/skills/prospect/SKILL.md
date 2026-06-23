---
name: prospect
description: Lands a brand-new idea, feature, or initiative as tracked planning work and creates its Linear home before any spec or issues exist. Use when the user is starting a new idea, feature, or initiative from scratch and wants it captured as planning work before a spec or issues exist.
---

# Prospect

Scout a fresh patch and plant the first marker on it. A new idea arrives with no
Linear home; `prospect` frames its intent just enough, then lands it as a Linear
initiative or project with an idea/brief document attached — the planning system
of record for everything that follows. It does **not** spec, decompose, or build;
it opens the patch so the rest of the kit can mine it.

This skill does not create Linear initiatives, projects, or documents while being
validated; during real intake it opens one home for the idea and attaches a brief.

## Read the contract first

This skill drives Linear through its MCP tools and never hardcodes a tracker.
Before creating anything, read the repo contract that `assembler` generated (the
`.agents/contract/` map or the repo docs it points to) for:

- the target Linear **team**, and whether new ideas land as an **initiative** or
  a **project** in this repo;
- the domain glossary, so the idea is named in the repo's own language;
- any naming/label conventions for new planning objects.

If no contract exists yet, route the user to `assembler` to generate one before
landing the idea.

## Land the idea

1. **Frame it, briefly.** Restate the idea's intent, the problem it solves, and
   its rough shape in a line or two, and capture the open unknowns. Do not
   relitigate a decided idea or run a full interview — that depth belongs to
   `blueprint`.
2. **Create the Linear home.** Per the contract, call `save_initiative` *or*
   `save_project` on the target team for this idea. One home per idea: reuse an
   existing one instead of creating a duplicate.
3. **Attach the brief.** Call `save_document` to publish an idea/brief doc on that
   home — intent, problem, rough shape, known unknowns, and explicit non-goals.
   No acceptance criteria, file paths, or implementation detail; that comes later.
4. **Return the links.** Report the created initiative/project and document ids
   and URLs so the next step can reference the home directly.

## Hand off

- **Unknowns remain** (feasibility, scope, or prior art unclear) -> `research` to
  survey before speccing.
- **Ready to spec** (intent and shape are clear) -> `blueprint` to draft the
  PRD/spec on this project.
- **Asked to split into issues / make tickets** -> that is `ghosts`, not
  `prospect`; land or locate the home first, then route to `ghosts`.

## Invariants

- **Never starts implementation.** No branches, worktrees, code, or PRs — this is
  pure planning intake.
- **Never creates issues or sub-issues.** Stamping planned work is `ghosts`' job;
  `prospect` only opens the home.
- **Reads the `assembler` contract** for the target team and the
  initiative-vs-project choice; never hardcodes a team, project, or label.
- **One home per idea.** Reuse before create; do not duplicate an existing
  initiative or project.
- **Brief, not spec.** The document captures intent and unknowns, not acceptance
  criteria — the spec is `blueprint`'s job.
