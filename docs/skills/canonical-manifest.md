# Canonical Skills Manifest

Single source of truth for the harness skill nucleus. Built by consolidating three home roots
(`~/.agents/skills`, `~/.codex/skills`, `~/.claude/skills`) into the repo `.agents/skills/`, then
symlinking all three roots back to it. One copy per skill, no harness prefixes, reusable across harnesses.

- Physical dirs before: 161 (across 3 roots)  ->  canonical skills: 58
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
- `repo-workflow-bootstrap` -> `.codex` (self-contained; bundles scripts/templates/agents; rewrite paths).

## Canonical skills

| canonical name | source root | action | source path |
|---|---|---|---|
| `caveman` | .agents | copy | ~/.agents/skills/caveman |
| `chrome-devtools` | .agents | copy | ~/.agents/skills/chrome-devtools |
| `chronicle` | .codex | copy+deharness | ~/.codex/skills/chronicle |
| `cmux-project-supervision` | .codex | copy+deharness | ~/.codex/skills/cmux-project-supervision |
| `computer-use` | .agents | copy | ~/.agents/skills/computer-use |
| `debug-tools` | .codex | copy+deharness | ~/.codex/skills/codex-debug-tools |
| `deliverable-report` | .agents | copy | ~/.agents/skills/deliverable-report |
| `diagnose` | .agents | copy | ~/.agents/skills/diagnose |
| `doc` | .agents | copy | ~/.agents/skills/doc |
| `excalidraw-diagrams` | .agents | copy | ~/.agents/skills/excalidraw-diagrams |
| `find-skills` | .agents | copy | ~/.agents/skills/find-skills |
| `fleet-status` | .codex | copy+deharness | ~/.codex/skills/fleet-status |
| `gh-issue-thread-chain` | .codex | copy+deharness | ~/.codex/skills/gh-issue-thread-chain |
| `grill-me` | .agents | copy | ~/.agents/skills/grill-me |
| `grill-with-docs` | .agents | copy | ~/.agents/skills/grill-with-docs |
| `handoff` | .agents | copy | ~/.agents/skills/handoff |
| `html-annotated-pr-review` | .agents | copy | ~/.agents/skills/html-annotated-pr-review |
| `html-code-approaches` | .agents | copy | ~/.agents/skills/html-code-approaches |
| `html-implementation-plan` | .agents | copy | ~/.agents/skills/html-implementation-plan |
| `html-module-map` | .agents | copy | ~/.agents/skills/html-module-map |
| `html-ticket-triage-board` | .agents | copy | ~/.agents/skills/html-ticket-triage-board |
| `improve-codebase-architecture` | .agents | copy | ~/.agents/skills/improve-codebase-architecture |
| `inbox-triage` | .agents | copy | ~/.agents/skills/inbox-triage |
| `issue-bootstrap` | .agents | copy | ~/.agents/skills/issue-bootstrap |
| `issue-work` | .agents | copy | ~/.agents/skills/issue-work |
| `jupyter-notebook` | .agents | copy | ~/.agents/skills/jupyter-notebook |
| `openai-docs` | .agents | copy | ~/.agents/skills/openai-docs |
| `orca-cli` | .agents | copy | ~/.agents/skills/orca-cli |
| `orchestration` | .agents | copy | ~/.agents/skills/orchestration |
| `pdf` | .agents | copy | ~/.agents/skills/pdf |
| `pr-review` | .agents | copy | ~/.agents/skills/pr-review |
| `project-sanity-check` | .agents | copy | ~/.agents/skills/project-sanity-check |
| `proof-pass` | REPO | keep | (already in repo) |
| `prototype` | .agents | copy | ~/.agents/skills/prototype |
| `repo-triage` | .agents | copy | ~/.agents/skills/repo-triage |
| `repo-workflow-bootstrap` | .codex | copy+deharness | ~/.codex/skills/repo-workflow-bootstrap |
| `resume-thread` | REPO | keep | (already in repo) |
| `security-best-practices` | .agents | copy | ~/.agents/skills/security-best-practices |
| `security-ownership-map` | .agents | copy | ~/.agents/skills/security-ownership-map |
| `security-threat-model` | .agents | copy | ~/.agents/skills/security-threat-model |
| `session-tree-map` | .codex | copy+deharness | ~/.codex/skills/session-tree-map |
| `setup-matt-pocock-skills` | .agents | copy | ~/.agents/skills/setup-matt-pocock-skills |
| `skill-maintenance` | .agents | copy | ~/.agents/skills/skill-maintenance |
| `summarize-youtube-videos` | .agents | copy | ~/.agents/skills/summarize-youtube-videos |
| `swiftui-pro` | .agents | copy | ~/.agents/skills/swiftui-pro |
| `tdd` | .agents | copy | ~/.agents/skills/tdd |
| `teach` | .agents | copy | ~/.agents/skills/teach |
| `terminal-steering` | .codex | copy+deharness | ~/.codex/skills/codex-omp-terminal-steering |
| `theme-factory` | .agents | copy | ~/.agents/skills/theme-factory |
| `thread-closeout` | REPO | keep | (already in repo) |
| `thread-organizer` | .codex | copy+deharness | ~/.codex/skills/thread-organizer |
| `to-issues` | .agents | copy | ~/.agents/skills/to-issues |
| `to-prd` | .agents | copy | ~/.agents/skills/to-prd |
| `tradingview-breakout-dashboard` | .agents | copy | ~/.agents/skills/tradingview-breakout-dashboard |
| `triage` | .agents | copy | ~/.agents/skills/triage |
| `workflow-kit` | .agents | copy | ~/.agents/skills/workflow-kit |
| `write-a-skill` | .agents | copy | ~/.agents/skills/write-a-skill |
| `zoom-out` | .agents | copy | ~/.agents/skills/zoom-out |
