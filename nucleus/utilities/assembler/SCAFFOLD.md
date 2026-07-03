# Scaffolding repo-specific skills and agents

The generic kit is repo-agnostic. Some repos need tooling only they need — a
recurring domain workflow, a generator, a review lens for their real risk areas.
`assembler` synthesizes that from the envelope. This is the "assemblies = agents
and skills per your repo" capability.

## When to scaffold (not before)

Create a repo-specific skill or agent only when a workflow recurs and the envelope
already names the domain it serves. Cite `bus-first`: if the generic kit skills
plus the envelope already cover it, build nothing. A repo with no recurring
special workflow gets zero repo-specific skills — that is the correct outcome.

## Repo-specific skill

Home: `<repo>/.agents/skills/<repo>-<capability>/SKILL.md`, one level deep, no
harness prefix. It MUST:

- have frontmatter `name:` equal to the directory name;
- have a third-person `description` with a concrete `Use when ...` trigger;
- read the repo envelope for commands/domain rather than hardcoding;
- cite the generic kit skill it specializes (e.g. a domain build flow cites
  `roboports`), not duplicate it.

It MUST pass `validate-skills` (one level deep, concrete trigger, no secrets, no
name collision with kit or global skills).

## Repo-specific agent

Home: `<repo>/.agents/agents/<role>.md`. Use for a persistent specialist the repo
needs (e.g. a reviewer scoped to its auth surface). Give it a tight role, the
files/areas it owns, and the gates it must not run (the main agent runs project
gates once). Read-only review agents get no write/exec tools.

## Discipline

- Scaffold the minimum a real workflow needs; never speculative tooling.
- Generated skills/agents are repo-local — they live in the consumer repo, never
  back in this kit.
- Re-running `assembler` is create-missing-only: it proposes new scaffolds and
  diffs, never silently overwrites a repo-specific skill the team edited.
