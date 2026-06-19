# Claude Adapter Plan

Issue #42 defines the Claude-side adapter plan for the unified OMP/Codex/Claude harness nucleus. This slice is a plan and validation package only. It does not write to live `~/.claude`, does not symlink or copy the entire Claude home directory, does not copy private Claude runtime/session/history/cache/daemon/auth data, does not delete duplicate skills, and does not modify active panel or side-panel prototype work.

Canonical data lives in `docs/harness/claude-adapter-plan/adapter-plan.json`. Parseable dry-run templates live under `docs/harness/claude-adapter-plan/templates/`.

The reusable repo workflow source for the harness nucleus is the OMP workflow-kit at `~/.omp/agent/workflow-kit`. This issue treats it as a reference-only source: translate the workflow into Claude-native instructions, settings, agents, and skills, but do not copy live OMP runtime state into `~/.claude`.

## Claude Conventions Used

Claude-side inspection for this issue was read-only and limited to declarative documentation, small declarative samples, and path/category-only listings where local state could contain private data.

Local declarative inputs:

- `~/.claude/docs/authoring-agents.md`: agent Markdown locations, required `name` and `description` frontmatter, and optional `tools` allowlists.
- `~/.claude/docs/authoring-skills.md`: skill folder shape, `SKILL.md` frontmatter, and progressive-disclosure references.
- `~/.claude/docs/architecture.md`: `CLAUDE.md` instructions, `settings.json` categories, and the rule that secrets live outside tracked config.
- `~/.claude/agents/{scout,dotclaude}.md`: small declarative agent samples only.
- `~/.claude/skills/codex-issue-implementation/SKILL.md`: one small declarative skill sample only.

Path/category-only inputs:

- Declarative candidates: `~/.claude/{agents,skills,docs,scripts,templates,settings.json,keybindings.json}`.
- Local-only runtime categories: `~/.claude/{projects,sessions,history.jsonl,session-env,shell-snapshots,tasks,teams,jobs,file-history,cache,paste-cache,plugins,daemon,daemon-auth-*,settings.local.json,*.log,backups,workflows}`.

## Repository Workflow Nucleus

The nucleus workflow follows the OMP workflow-kit repo model, expressed in Claude-native language.

Portable policy:

- Keep a global layer for default workflow instructions, sticky safety rules, and reusable skills.
- Keep a project layer for repo-local instructions, repo config, `docs/agents` guidance, scope ledger, handoffs, issue/PR templates, labels, and project skills.
- Use an idempotent apply/check model where a marker manifest defines what "applied" means and existing files are not overwritten.
- Preserve traceability from grilled plan to PRD, issues, triage, one issue/worktree/PR implementation, verification evidence, and handoff when blocked.
- Keep project skills exactly one directory below `.agents/skills`, with `SKILL.md` frontmatter and concrete `Use when ...` triggers.
- Treat GitHub issue/PR templates and workflow labels as repo workflow surfaces when a repo uses GitHub.

Claude translation:

- Project-specific workflow policy belongs in a repo `CLAUDE.md` bridge plus repo-local `.agents/skills` where it is useful across harnesses.
- General reusable workflow policy belongs in user-level instruction or skill surfaces such as `~/.claude/CLAUDE.md` and `~/.agents/skills`.
- Claude agents are role adapters. They do not replace the workflow-kit issue lifecycle.
- Future renderers must produce dry-run manifests before writing any live `~/.claude` file.

## Declarative Candidates

| Candidate | Kind | Claude surface | Candidate destinations |
| --- | --- | --- | --- |
| Claude instructions | tracked template | `CLAUDE.md` instruction bridge | `CLAUDE.md`, `.claude/CLAUDE.md`, `~/.claude/CLAUDE.md` |
| Claude settings | tracked template | `settings.json` | `.claude/settings.json`, `~/.claude/settings.json` |
| Claude agents | tracked template | agent Markdown | `.claude/agents/*.md`, `~/.claude/agents/*.md` |
| Claude skills | tracked template | skill Markdown | `.claude/skills/*/SKILL.md`, `~/.claude/skills/*/SKILL.md` |
| Curated skill symlinks | symlink target | skill directories | `~/.claude/skills/<name>`, `.claude/skills/<name>` |

Claude reads `CLAUDE.md`, not `AGENTS.md`, so the instruction bridge imports `@AGENTS.md` when the repo has shared workflow guidance. Skills are populated later through curated per-skill symlinks from shared `.agents/skills` roots, never by whole-root symlinks or copies.

## OMP Agent Mapping

The #39 snapshot contains eight bundled OMP agents. The Claude plan maps each one deliberately instead of copying OMP frontmatter directly.

| OMP agent | Recommendation | Claude surface | Candidate | Rationale |
| --- | --- | --- | --- | --- |
| `designer` | adapt | agent | `omp-designer` | UI/UX review is a narrow reusable role with read-heavy tools. |
| `explore` | adapt | agent | `omp-explorer` | Read-only codebase scouting is useful without OMP runtime semantics. |
| `librarian` | adapt | agent or skill | `omp-librarian` | Source-verified library/API research is distinct enough to preserve. |
| `oracle` | drop | native main thread | none | Broad senior-engineer behavior overlaps Claude's main thread and adds routing ambiguity. |
| `plan` | adapt | agent | `omp-planner` | Complex architectural planning benefits from a focused planning role. |
| `quick_task` | keep | native task delegation | native quick delegation | Mechanical low-reasoning work can remain native to Claude's normal delegation/tooling model. |
| `reviewer` | adapt | agent | `omp-reviewer` | Review discipline can be preserved as a read-only Claude review agent. |
| `task` | keep | native task delegation | native task | General-purpose delegated execution is already native Claude behavior. |

The candidate agent templates included in this slice are dry-run examples for the five adapted roles.

## Skill Candidate Mapping

Issue #40 identified six OMP command behaviors that can become shared harness skills. Issue #42 keeps shared workflow source distinct from generated Claude adapter surfaces.

| OMP command | Future Claude skill | Shared workflow source | Generated adapter |
| --- | --- | --- | --- |
| `btw` | `omp-btw` | `.agents/skills/omp-btw` | future reviewed symlink candidate |
| `guided-goal` | `omp-guided-goal` | `.agents/skills/omp-guided-goal` | future reviewed symlink candidate |
| `handoff` | `omp-handoff` | `.agents/skills/omp-handoff` | dry-run `templates/skills/omp-handoff/SKILL.md` example |
| `omfg` | `omp-complaint-to-rule` | `.agents/skills/omp-complaint-to-rule` | future reviewed symlink candidate |
| `plan` | `omp-plan` | `.agents/skills/omp-plan` | dry-run `templates/skills/omp-plan/SKILL.md` example |
| `tan` | `omp-tangent` | `.agents/skills/omp-tangent` | future reviewed symlink candidate |

No live Claude skills are installed in this issue.

## Skill Root Duplication Risks

Skills overlap across multiple roots. This slice records risks only; deduplication is deferred to a future skill-root audit.

| Root | Ownership | Risk | Issue #42 action |
| --- | --- | --- | --- |
| `~/.agents/skills` | user shared | Reusable workflow skills can drift from repo `.agents/skills`. | document-only; prefer curated per-skill symlink candidates; forbid-bulk-symlink |
| `~/.codex/skills` | Codex user | Codex-specific copies can diverge from shared and Claude copies. | document-only; do not mirror into Claude |
| `~/.claude/skills` | Claude user | Existing duplicates can be shadowed by new names or symlinks. | document-only; do not delete, move, disable, rewrite, or dedupe existing skills |
| `repo:.agents/skills` | repo project | Project skills can collide by name across scopes. | document-only; keep as project-scoped source of truth |
| `~/.omp/agent/workflow-kit` | OMP reference | Copying workflow-kit content would entangle live OMP workflow state with Claude adapters. | document-only; translate policy, do not copy |

## Template Boundaries

### Instruction Bridge Template

Template: `docs/harness/claude-adapter-plan/templates/instructions/CLAUDE.md.template.md`

Candidate destinations after explicit approval: `CLAUDE.md`, `.claude/CLAUDE.md`, or `~/.claude/CLAUDE.md`.

The bridge imports `@AGENTS.md` when shared repo workflow guidance exists. It must not paste secrets, machine-local paths, session history, or runtime state.

### Settings Template

Template: `docs/harness/claude-adapter-plan/templates/settings.template.json`

Candidate destinations after explicit approval: `.claude/settings.json` or `~/.claude/settings.json`.

Allowed: `includeCoAuthoredBy`, `cleanupPeriodDays`, and `permissions.deny` rules. Forbidden: credential helpers, auth refresh scripts, `env`, MCP server config, default model changes, `hooks`, local memory paths, organization announcements, and local override data.

### Agent Templates

Templates live under `docs/harness/claude-adapter-plan/templates/agents/`.

Candidate destinations after explicit approval: project-scoped `.claude/agents/*.md` or user-scoped `~/.claude/agents/*.md`.

Required frontmatter is `name` and `description`; the dry-run examples also include a narrow `tools` allowlist. Review/scout agents must not grant `Write`, `Edit`, or `Bash`, and no agent may embed credentials, MCP server config, or live machine paths.

### Skill Templates And Symlink Manifest

Dry-run skill template examples live under `docs/harness/claude-adapter-plan/templates/skills/`. The curated per-skill symlink candidate manifest is `docs/harness/claude-adapter-plan/templates/skill-symlinks.template.json`.

Every future link mode must be `symlink`, every target must be a per-skill path, and the manifest must never copy, vendor, delete, or whole-root link existing skills.

## Local-Only Claude Surfaces

Live `~/.claude` inspection for this issue was path/category-only for private state; no private Claude runtime files were opened. The plan treats these surfaces as local-only:

- credential/auth cache: `~/.claude/.credentials.json`, `~/.claude.json`, `~/.claude/daemon-auth-*`
- session and history: `~/.claude/projects/`, `~/.claude/sessions/`, `~/.claude/history.jsonl`
- runtime state: `~/.claude/session-env/`, `~/.claude/shell-snapshots/`, `~/.claude/tasks/`, `~/.claude/teams/`, `~/.claude/jobs/`, `~/.claude/todos/`, `~/.claude/workflows/`
- interaction history: `~/.claude/file-history/`, `~/.claude/paste-cache/`
- plugin/cache state: `~/.claude/cache/`, `~/.claude/plugins/cache/`, `~/.claude/plugins/data/`, `~/.claude/statsig/`
- daemon/local overrides: `~/.claude/daemon/`, `~/.claude/settings.local.json`
- logs, backups, and databases: `~/.claude/*.log`, `~/.claude/backups/`, `~/.claude/*.db`, `~/.claude/*.sqlite*`

Generated candidates are dry-run-only in this issue:

- `.claude/CLAUDE.md` or `~/.claude/CLAUDE.md` from the instruction template
- `.claude/settings.json` or `~/.claude/settings.json` from the settings template
- `.claude/agents/*.md` or `~/.claude/agents/*.md` from agent templates
- `.claude/skills/*/SKILL.md` or `~/.claude/skills/*/SKILL.md` from skill templates
- curated per-skill symlink candidates from the symlink manifest

## Dry-Run Render And Validation Strategy

Before any live Claude modification is allowed:

1. Render templates into a temporary directory, never directly into `~/.claude` or project `.claude`.
2. Parse every rendered JSON template with `JSON.parse` and every agent or skill Markdown template's YAML frontmatter.
3. Compare OMP agent mapping rows against `docs/harness/omp-builtins/source.json`; fail when a bundled agent is missing or duplicated.
4. Compare OMP skill candidate rows against `docs/harness/omp-builtins/portability-matrix.json`; require shared workflow source to stay distinct from generated Claude adapter templates.
5. Validate that the Claude adapter preserves the workflow-kit repo lifecycle as portable policy rather than copying live OMP or Claude runtime files.
6. Reject rendered content containing absolute private home paths, API key/token-looking text, credential-cache destinations, MCP/provider/auth keys, hooks, env secrets, or a default model change.
7. Validate that the instruction bridge imports `@AGENTS.md` and the skill symlink template uses curated per-skill candidates only.
8. Print a dry-run manifest showing candidate destination paths, required human approvals, and skipped local-only surfaces.
9. Require a separate future issue and PR before writing to live `~/.claude`, project `.claude`, or shared `.agents/skills`.

Run local validation:

```sh
node scripts/validate-claude-adapter-plan.mjs
node --test tests/claude-adapter-plan.test.mjs
```

## Human Decisions Before Implementation

| Decision | Resolution |
| --- | --- |
| Which adapted OMP roles should become project-scoped .claude/agents versus user-scoped ~/.claude/agents? | Project-specific roles should be project-scoped under `.claude/agents`; general reusable roles should be user-scoped under `~/.claude/agents`. |
| Should adapted Claude agents pin a model if local Claude docs later expose a stable model field, or should they inherit the parent session model? | Inherit the parent session model in this slice because the local Claude authoring docs inspected here establish `name`, `description`, and `tools` conventions without requiring a model field. |
| Which skill candidates should be repo-local .agents/skills versus personal ~/.agents/skills, and how should Claude consume them? | Use the workflow-kit split: repo workflow and domain skills go in `.agents/skills`; general reusable workflow skills go in `~/.agents/skills`; Claude consumes them via curated per-skill symlinks or reviewed adapter templates, never whole-root copies. |
| Should Claude instructions duplicate AGENTS.md or bridge to it? | Bridge: a project `CLAUDE.md` imports `@AGENTS.md` when present, so shared workflow policy remains in one reviewable source instead of drifting copies. |
| What review/approval policy is required before writing any generated template into live ~/.claude? | Default to a strict manual gate: separate issue/PR, dry-run rendered diff, dangerous-key validation, backup of any live file, and explicit human approval before any write. |

Approval policy options for a future live config issue:

- `strict-manual` (recommended): separate issue/PR, dry-run diff, validation pass, live-file backup, and explicit human approval before writing any `~/.claude` or project `.claude` file.
- `checked-local-apply`: allow a local apply command only after the dry-run checker passes and creates a backup; still forbid credential, auth, MCP, env-secret, hook, and default-model changes.
- `docs-only`: never write live Claude config from the harness; render instructions and let the human manually copy reviewed entries.
