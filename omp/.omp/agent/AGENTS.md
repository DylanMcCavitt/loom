# Dylan's Oh My Pi Agent Setup

## Workflow kit

Use `~/.omp/agent/workflow-kit/` as the reusable workflow kit for global and per-project agent setup.

## Default workflow

1. Start from the current repo state.
2. Read the nearest project `.omp/AGENTS.md` when present.
3. Read `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, and `docs/agents/domain.md` when present.
4. Use a matching project skill from `.agents/skills/` when the task matches its description.
5. Keep one issue/task to one branch/worktree to one PR unless the repo explicitly says otherwise.
6. Verify behavior with the project’s documented commands before calling work complete.
7. Leave a handoff in `docs/handoffs/` when work stops or blocks.

## Skill authoring

Global reusable skills live in `~/.agents/skills/`.
Project-specific skills live in `<repo>/.agents/skills/`.
Each skill must be one directory containing `SKILL.md` with `name` and `description` frontmatter.
