# Live nucleus inventory — 2026-06-25

Scope: read-only baseline for LOO-85 before any nucleus apply work. Commands below were run without `--write`; no live `~/.omp`, `~/.codex`, `~/.claude`, `.agents`, or repo config mutation was performed.

## Evidence commands

- `npm run render-nucleus -- --json` — passed; rendered 15 temp-only candidates, 6 appliable, 9 reported, 0 findings.
- `node scripts/dry-run-harness-inventory.mjs --check-live` — passed; path-only live metadata reported for manifest resources.
- `node scripts/dry-run-harness-safety-gate.mjs --check-live` — passed; 12 manifest resources, 83 local-only patterns blocked, 5 Codex and 9 Claude generated surfaces covered, 110 tracked files scanned.

## Already effective

- `~/.agents/skills` is present as a symlink to `<repo>/.agents/skills`.
- OMP live tracked files are present as symlinks into the repo mirror:
  - `~/.omp/agent/AGENTS.md` -> `../../loom/omp/.omp/agent/AGENTS.md`.
  - `~/.omp/agent/RULES.md` -> `../../loom/omp/.omp/agent/RULES.md`.
  - `~/.omp/agent/config.yml` -> `../../loom/omp/.omp/agent/config.yml`.
- Repo OMP mirror files are present:
  - `omp/.omp/agent/AGENTS.md`.
  - `omp/.omp/agent/RULES.md`.
  - `omp/.omp/agent/config.yml`.
  - `omp/.omp/agent/config.example.yml`.
- Claude user surfaces exist but are live-local, not renderer-owned:
  - `~/.claude/CLAUDE.md` is a present file.
  - `~/.claude/settings.json` is a present file.
  - `~/.claude/agents/` is a present directory.
  - `~/.claude/skills` is present as a symlink to `<repo>/.agents/skills`.

## Planned but not live

- Codex generated custom-agent candidates are rendered by the dry run but absent from live `~/.codex/agents/`:
  - `~/.codex/agents/omp-designer.toml`.
  - `~/.codex/agents/omp-planner.toml`.
  - `~/.codex/agents/omp-reviewer.toml`.
- Codex generated config/profile surfaces remain future-issue candidates:
  - `.codex/config.toml`.
  - `~/.codex/omp-harness.config.toml`.
  - `.codex/agents/*.toml`.
  - `~/.codex/config.toml skills.config entries`.
- Claude generated candidates remain future-issue candidates:
  - `.claude/CLAUDE.md`.
  - `.claude/settings.json`.
  - `.claude/agents/*.md`.
  - `~/.claude/agents/*.md`.
  - `.claude/skills/*/SKILL.md`.
  - `~/.claude/skills/*/SKILL.md`.
  - `per-skill symlink manifest`.

## Blocked

- `~/.codex/config.toml skills.config entries` would merge into an existing live `~/.codex/config.toml`; future apply work needs explicit review and HITL approval.
- Claude user instruction/settings candidates target existing live files:
  - `~/.claude/CLAUDE.md` would overwrite an existing file.
  - `~/.claude/settings.json` would overwrite an existing file.
- Whole-root Claude skill symlink normalization is not allowed by the current plan; future Claude skill links must be curated per-skill candidates.
- Duplicate skill roots remain an audit item, not activation work in LOO-85:
  - `~/.agents/skills/`.
  - `~/.codex/skills/`.
  - `~/.claude/skills/`.
  - `repo:.agents/skills/`.
  - `~/.omp/agent/workflow-kit/`.

## Unsafe to write / local-only

The safety gate rejected local-only surfaces as write targets and reported them only by path/pattern. These remain unsafe to copy, normalize, or repo-own:

- OMP runtime and local overlays: `~/.omp/agent/config.local.yml`, `~/.omp/agent/*.local.yml`, sessions, terminal sessions, blobs, cache, logs, `*.db`, `*.sqlite`.
- Codex runtime state: sessions, archived sessions, auth, history, logs, cache, plugin cache, blobs, attachments, generated images, sqlite/db files, state JSON, automations, browser/computer-use state, shell snapshots, memories.
- Claude runtime state: credentials, history, projects, sessions, session env, shell snapshots, tasks, teams, jobs, file history, cache, paste cache, plugin cache/data, daemon state, local settings, logs, backups, workflows, todos, statsig, db/sqlite files.

## Result

Read-only baseline is captured. OMP is already effective through live symlinks to repo mirror files. Shared skills are effective through `~/.agents/skills -> <repo>/.agents/skills`; Claude also points `~/.claude/skills` at that root. Codex custom-agent candidates are planned but absent. Claude generated candidates are planned but not live-applied. Existing live Codex and Claude files require future HITL review before any write path.
