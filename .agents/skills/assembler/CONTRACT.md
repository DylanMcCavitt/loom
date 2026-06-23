# The repo contract: full shape

Everything `assembler` writes lives in the target repo at `.agents/contract/`
(plus the `## Agent skills` block in the repo's `AGENTS.md`/`CLAUDE.md`). Each
binding is plain Markdown a human can read and edit.

## `linear-map.md`

- **Team** — the Linear team key + name this repo files under.
- **Project(s)** — the default project (and any sub-projects) issues land in.
- **Labels** — the repo's label vocabulary, including the parent groups.
- **States** — the workflow states, mapped to the `dispatch` triage roles:
  `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`
  → the repo's actual state/label strings. `dispatch` reads this map; it never
  hardcodes a state.
- **Bridge** — the GitHub convention: the branch carries the Linear issue id; the
  PR auto-links and auto-closes the issue on merge. Record the branch-name shape.

## `domain.md`

The glossary specs and issues must speak: the repo's nouns, bounded contexts, and
the canonical word for each concept (and the words to avoid). `blueprint`, `ghosts`,
and `main-bus` read this so planning artifacts use the repo's language.

## `commands.md`

The real commands, copied from the repo (package.json scripts, Makefile, CI), not
guessed: `build`, `test`, `lint`, `run`, plus the default branch. `robots`,
`rocket-launch`, `modules`, and `quality` read these instead of inventing commands.

## `templates/`

Repo-local PR / issue / doc templates, stamped from `blueprint`'s canonical
`templates/` with the repo's real names substituted. The repo's
`.github/pull_request_template.md` is materialized from `templates/pull-request.md`.

## The `## Agent skills` block (in AGENTS.md / CLAUDE.md)

A short block so a fresh agent discovers the contract:

```markdown
## Agent skills

This repo runs the Factorio workflow kit. The per-repo contract is in
`.agents/contract/` — read it before planning or building:

- `linear-map.md` — Linear team/project/label/state map + the GitHub bridge.
- `domain.md` — domain glossary.
- `commands.md` — build/test/lint/run + default branch.
- `templates/` — PR/issue/doc templates.

Repo-specific skills and agents live in `.agents/skills/` and `.agents/agents/`.
```

Edit one binding when a repo fact changes; never edit it in N skills.
