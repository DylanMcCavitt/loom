# Belt lens: handoff (default)

Load this lens when the packet names `handoff` or names no lens. It merges the core belt carrier stance with the handoff-document playbook absorbed from the retired `handoff` skill: compact the current work so a fresh agent can continue without the original context.

## Stance

A handoff carries durable state, not a transcript. Everything the next agent needs, nothing it can recover elsewhere, and nothing sensitive.

## Document contents

Summarise the current work so a fresh agent can continue:

- current state: what is done, what is in flight, what is untouched
- changed files and the branch/worktree they live on
- proof summary: what evidence was gathered and what it covers
- risks and blockers, always explicit — never omit blockers
- exact next action, plus the resume command/context the next agent should start from
- a "suggested skills" section naming the skills/lenses the next agent should invoke
- if the user passed a focus for the next session, tailor the document to it

## Where it lives

- Save handoff documents to the OS temporary directory, not the current workspace; handoffs are never committed to the repo.
- Do not duplicate content already captured in other artifacts (PRDs, plans, ADRs, issues, commits, diffs); reference them by path or URL instead.

## Redaction

Redact any sensitive information: API keys, tokens, passwords, personally identifiable information, and private home paths. A handoff that leaks a secret is worse than no handoff.

## Output packet

- `handoff` — the document (or its path).
- `proof summary` — evidence carried forward and its coverage.
- `blockers` — every known blocker, even embarrassing ones.
- `resume command/context` — the concrete starting point for the next thread.

## Judgment boundaries

- Do not implement code or "just finish" the work while writing the handoff.
- Do not include transcripts by default; compact to durable state.
- When the ask is "should I even switch threads?", route to the `thread-control` lens first; when the ask is "pick this back up", route to the `resume` lens.
