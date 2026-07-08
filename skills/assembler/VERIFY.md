# Verify / refresh the envelope

A repo is "kit-ready" only when the envelope is complete and internally
consistent. Run this after generating, and any time you refresh.

## Checklist

- **Bindings present.** `linear-map.md`, `domain.md`, `commands.md`, and a
  non-empty `templates/` all exist under `.agents/envelope/`.
- **Bindings agree.** The project in `linear-map.md` is the one the templates and
  the `## Agent skills` block reference; the default branch in `commands.md`
  matches the bridge branch shape in `linear-map.md`.
- **States cover the roles.** Every triage role (`blueprint` triage lens) maps to a real state or
  label string that exists in the tracker team (cross-check `list_issue_statuses`
  / `list_issue_labels`).
- **Commands are real.** Each command in `commands.md` exists in the repo (a
  package script, Makefile target, or documented invocation) — not a guess.
- **Wiring points home.** The `## Agent skills` block exists in exactly one of
  `AGENTS.md` / `CLAUDE.md` and points at `.agents/envelope/`.
- **Scaffolds are valid.** Any repo-specific skill passes `validate-skills`; any
  repo-specific agent has a tight role and the right tool posture.
- **No secrets.** No token, key, or credentialed URL anywhere in the envelope.

## Output

Report kit-ready or list the exact gaps (missing binding, role with no state,
command that doesn't exist, wiring absent). On a refresh, present a diff per
changed file and ask before overwriting — never silently clobber a file the team
edited.
