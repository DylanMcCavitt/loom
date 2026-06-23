---
name: blueprint
description: Synthesizes a PRD/spec from existing context without interviewing and owns the kit's reusable PR, issue, project-doc, and PRD templates. Use when the user wants a PRD or spec written from current context, or wants/needs a reusable PR, issue, project-doc, or PRD template.
---

# Blueprint

A blueprint is a saved layout you stamp down. This skill drafts the spec for an idea
and owns the reusable templates the kit stamps into repos and Linear.

Linear is the planning system of record; GitHub is code delivery. The spec lands as a
Linear **document** on the project `prospect` created — not as a GitHub issue or a repo
file.

## Required reading

Before drafting, read the per-repo contract `assembler` generated (the repo contract):
the Linear team/project/label map, the **domain glossary**, the commands, and the
template set. Do not hardcode a tracker, team, labels, or commands — read the contract.
Also read the originating `prospect` idea/brief and any `research` document.

## Synthesize, never interview

Produce the spec from context you already have — the conversation, the idea doc, the
research notes, and the codebase. **Do not interview the user.** If a genuine unknown
blocks the spec, route to `research` to resolve it rather than relitigating intent here.
Use the domain glossary's vocabulary for every term in the spec.

## Write the spec (PRD)

Draft from `templates/prd.md`. The spec MUST include:

- a problem statement and solution in the user's terms,
- explicit **acceptance criteria** (observable, testable),
- explicit **non-goals** (what it will not do),
- a **proof plan** (how an agent proves each criterion without expanding scope; prefer
  the highest existing test seam).

Keep it prose. No file paths or code snippets — they rot. The one exception: a
decision-encoding snippet (state machine, reducer, schema, type shape) inlined where
prose is less precise, trimmed to the decision-rich parts. If a throwaway prototype is
needed to de-risk a decision, route to `map-seed` first, then fold its findings (and any
such snippet) into the spec.

## Publish to Linear

Publish the finished spec as a Linear **document** on the prospect's project via
`save_document`. Return the created document id/link. The document is the spec's home;
`ghosts` reads it to cut issues.

## Templates (the canonical blueprints)

This skill owns the kit's starter templates under `templates/`; `assembler` stamps
repo-local and Linear-side copies from them. Keep them generic and placeholder-driven —
never bake in repo-specific facts or secrets.

- `templates/prd.md` — the spec/PRD blueprint.
- `templates/linear-project-doc.md` — a Linear project document scaffold.
- `templates/linear-issue.md` — an issue-description scaffold (`ghosts` stamps it).
- `templates/pull-request.md` — a PR scaffold encoding the bridge (branch carries the
  Linear issue id; the merge auto-closes the issue).

## Routing

- New idea with no Linear home yet → `prospect` first; blueprint specs onto its project.
- Unknowns that must be resolved before specifying → `research`.
- A design that must be felt before it is specified → `map-seed`; fold its findings back.
- Turning the finished spec into tracked work → `ghosts`. **Blueprint never creates issues** — when asked to "create the issues now", hand off to `ghosts`.
- Implementing a spec'd issue → `robots` (which cites `bus-first` for a minimal diff).
