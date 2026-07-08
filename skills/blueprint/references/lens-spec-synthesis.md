# Blueprint lens: spec-synthesis (default)

Loaded when the packet names `lens: spec-synthesis` or names no lens at all.
Turns current context into a PRD/spec with acceptance criteria, non-goals, a
proof plan, and explicit open decisions.

## Judgment

- Synthesize, never interview. Produce the spec from context already in hand —
  the conversation, the idea doc, research notes, and the codebase. If a genuine
  unknown blocks the spec, route to the research-spike lens instead of
  relitigating intent with the user.
- The tracker is the planning system of record; the spec lands as a tracker
  **document** on the originating idea's project, not as a code-host issue or a
  repo file.
- Use the repo envelope's domain glossary vocabulary for every term in the spec;
  never invent names the glossary already provides.

## Playbook

1. Read the repo envelope (tracker team/project/label map, domain glossary,
   commands, template set), the originating idea/brief, and any research
   document. Do not hardcode a tracker, team, labels, or commands.
2. Draft from `templates/prd.md`. The spec MUST include:
   - a problem statement and solution in the user's terms,
   - explicit **acceptance criteria** (observable, testable),
   - explicit **non-goals** (what it will not do),
   - a **proof plan** (how an agent proves each criterion without expanding
     scope; prefer the highest existing test seam).
3. Keep it prose. No file paths or code snippets — they rot. The one exception:
   a decision-encoding snippet (state machine, reducer, schema, type shape)
   inlined where prose is less precise, trimmed to the decision-rich parts.
4. Publish the finished spec as a tracker document on the project and return the
   created document id/link. The document is the spec's home; the
   issue-decomposition lens reads it to cut issues.

## Templates

This package owns the kit's starter templates under `templates/` (`prd.md`,
`linear-project-doc.md`, `linear-issue.md`, `pull-request.md`). Keep them
generic and placeholder-driven — never bake in repo-specific facts or secrets.

## Boundaries

- Blueprint never creates issues; when asked to "create the issues now", switch
  to the issue-decomposition lens.
- Implementing a spec'd issue is `roboports`.
- A design that must be felt before it is specified goes through a throwaway
  prototype first; fold its findings back into the spec.

## Packet output

- spec document id/link
- acceptance criteria
- non-goals
- proof plan
- open decisions and coverage gaps
