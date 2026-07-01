# Canonical Skills Manifest

Single source of truth for the harness skill nucleus. Built by consolidating three home roots
(`~/.agents/skills`, `~/.codex/skills`, `~/.claude/skills`) into the repo `.agents/skills/`, then
symlinking all three roots back to it. One copy per skill, no harness prefixes, reusable across harnesses.

- Physical dirs before: 161 (across 3 roots)  ->  canonical skills: 58 at build; later 60, then trimmed by the ADR 0003 Factorio-kit cutover (see Post-consolidation). The live set is whatever `.agents/skills/` holds; `validate-skills.mjs` is the gate.
- Pruned (10): codex-issue-implementation, codex-workflow-sharpener, devenv, graduate, inspo, learn, loading, mocking, quick, vault-note

## Build rules (per skill)
- Copy the source dir to `.agents/skills/<canonical-name>/`.
- Frontmatter `name:` MUST equal the canonical dir name; fix the `# Title` heading to match.
- Drop ALL harness branding: `codex-`/`omp-`/`claude-` prefixes, and the words Codex/Claude/OMP where they are labels (keep functional references).
- In `agents/openai.yaml` (if present): clean `display_name` and `$name` in `default_prompt`.
- Rewrite hardcoded skill paths (e.g. `~/.codex/skills/...`, `~/.claude/skills/...`) to `~/.agents/skills/<canonical-name>/...`.
- NEVER copy secrets or caches: exclude `.supadata_api_key`, any `*api_key*`/`.env*`, `__pycache__/`, `*.pyc`, `.git/`.
- Do NOT run gates/tests (the orchestrator runs `validate-skills` centrally).

## Conflict resolutions
- `chronicle` -> `.codex` (escalated host process check).
- `fleet-status` -> `.codex`/`.claude` majority (rewrite hardcoded path).

## Canonical skills

| canonical name | source root | action | source path |
|---|---|---|---|
| `chrome-devtools` | .agents | copy | ~/.agents/skills/chrome-devtools |
| `chronicle` | .codex | copy+deharness | ~/.codex/skills/chronicle |
| `computer-use` | .agents | copy | ~/.agents/skills/computer-use |
| `debug-tools` | .codex | copy+deharness | ~/.codex/skills/codex-debug-tools |
| `deliverable-report` | .agents | copy | ~/.agents/skills/deliverable-report |
| `diagnose` | .agents | copy | ~/.agents/skills/diagnose |
| `find-skills` | .agents | copy | ~/.agents/skills/find-skills |
| `fleet-status` | .codex | copy+deharness | ~/.codex/skills/fleet-status |
| `grill-me` | .agents | copy | ~/.agents/skills/grill-me |
| `grill-with-docs` | .agents | copy | ~/.agents/skills/grill-with-docs |
| `handoff` | .agents | copy | ~/.agents/skills/handoff |
| `openai-docs` | .agents | copy | ~/.agents/skills/openai-docs |
| `pr-review` | .agents | copy | ~/.agents/skills/pr-review |
| `project-sanity-check` | .agents | copy | ~/.agents/skills/project-sanity-check |
| `proof-pass` | REPO | keep | (already in repo) |
| `repo-triage` | .agents | copy | ~/.agents/skills/repo-triage |
| `resume-thread` | REPO | keep | (already in repo) |
| `security-best-practices` | .agents | copy | ~/.agents/skills/security-best-practices |
| `security-ownership-map` | .agents | copy | ~/.agents/skills/security-ownership-map |
| `security-threat-model` | .agents | copy | ~/.agents/skills/security-threat-model |
| `skill-maintenance` | .agents | copy | ~/.agents/skills/skill-maintenance |
| `swiftui-pro` | .agents | copy | ~/.agents/skills/swiftui-pro |
| `tdd` | .agents | copy | ~/.agents/skills/tdd |
| `thread-organizer` | .codex | copy+deharness | ~/.codex/skills/thread-organizer |
| `tradingview-breakout-dashboard` | .agents | copy | ~/.agents/skills/tradingview-breakout-dashboard |
| `write-a-skill` | .agents | copy | ~/.agents/skills/write-a-skill |
| `zoom-out` | .agents | copy | ~/.agents/skills/zoom-out |

## Post-consolidation changes

- **Issue-lane prune (historical):** earlier consolidation removed `issue-bootstrap`/`issue-work`, leaving `issue-execution` as the single issue-lifecycle skill alongside `triage`/`to-issues`/`to-prd`.
- **ADR 0003 Factorio-kit cutover:** the previous default planning lane is now retired in favor of the tracker-picked Factorio kit (see `factorio-kit.md`, the kit's manifest). Replaced: `to-prd`->`blueprint`, `to-issues`->`ghosts`, `triage`->`inserter`, `improve-codebase-architecture`->`main-bus`, `thread-closeout`+`gh-issue-thread-chain`->`rocket-launch`, `agent-recipes`+`issue-execution`->`roboports`. Dropped (curation): `caveman`, `doc`, `pdf`, `jupyter-notebook`, `excalidraw-diagrams`, `theme-factory`, `inbox-triage`, `summarize-youtube-videos`, `teach`, `orca-cli`, `orchestration`, `cmux-project-supervision`, `terminal-steering`, `session-tree-map`, `prototype` (re-themed as `map-seed`), and the five `html-*` skills. Kept as cited engines: `tdd`, `zoom-out`, `security-threat-model`/`-best-practices`/`-ownership-map`. The bootstrap trio (`repo-workflow-bootstrap`, `workflow-kit`, `setup-matt-pocock-skills`) -> `assembler`, now that `assembler` reached parity (LOO-19): their skill dirs, table rows, and the `repo-workflow-bootstrap` routing note are removed from this manifest.
