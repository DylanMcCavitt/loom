# Out-of-Scope Knowledge Base

The repo's `.out-of-scope/` directory stores persistent records of rejected
enhancement requests. It serves two purposes:

1. **Institutional memory** — why an enhancement was rejected, so the reasoning
   isn't lost when the issue is closed `wontfix`.
2. **Deduplication** — when a new issue matches a prior rejection, inserter
   surfaces the previous decision instead of re-litigating it.

## Directory structure

```
.out-of-scope/
├── dark-mode.md
├── plugin-system.md
└── graphql-api.md
```

One file per **concept**, not per issue. Multiple issues requesting the same
thing are grouped under one file.

## File format

Write each file as a short design note, not a database entry — paragraphs and
examples that make the reasoning clear to someone meeting it for the first time.

```markdown
# Dark Mode

This project does not support dark mode or user-facing theming.

## Why this is out of scope

The rendering pipeline assumes a single palette resolved at build time.
Supporting multiple themes would require a theme context, per-component
theme-aware resolution, and a preference persistence layer — a large
architectural change that doesn't align with the project's focus on content
authoring. Theming is a downstream concern.

## Prior requests

- ABC-42 — "Add dark mode support"
- ABC-87 — "Night theme for accessibility"
```

### Naming and reasons

Use a short kebab-case concept name (`dark-mode.md`). The reason must be
substantive and durable — project scope/philosophy, a technical constraint, or a
strategic decision — never a temporary "we're too busy" deferral.

## When to check it

During context-gathering (Inserter step 1), read all `.out-of-scope/*.md`. Match by
concept similarity, not keywords — "night theme" matches `dark-mode.md`. On a
match, surface it to the maintainer: "This resembles `.out-of-scope/dark-mode.md`,
rejected before because [reason]. Still the same call?" The maintainer may:

- **Confirm** — append the new issue to the file's "Prior requests" list, close it.
- **Reconsider** — delete/update the file; the issue proceeds through normal triage.
- **Disagree** — related but distinct; proceed with normal triage.

## When to write to it

Only when an **enhancement** (never a bug) is rejected as `wontfix`:

1. Check whether a matching file already exists.
2. If yes, append the new issue id to "Prior requests".
3. If no, create a new file with the concept name, decision, reason, and first
   prior request.
4. Post a `save_comment` linking the file and explaining the decision.
5. Apply the `wontfix` state (via the envelope's label/state map) and close.

If the maintainer later reverses a rejection, delete the file; historical issues
stay closed as records, and the new triggering issue runs through normal triage.
