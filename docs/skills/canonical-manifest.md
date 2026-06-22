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
| `caveman` | .agents | copy | /Users/dylanmccavitt/.agents/skills/caveman |
| `chrome-devtools` | .agents | copy | /Users/dylanmccavitt/.agents/skills/chrome-devtools |
| `chronicle` | .codex | copy+deharness | /Users/dylanmccavitt/.codex/skills/chronicle |
| `cmux-project-supervision` | .codex | copy+deharness | /Users/dylanmccavitt/.codex/skills/cmux-project-supervision |
| `computer-use` | .agents | copy | /Users/dylanmccavitt/.agents/skills/computer-use |
| `debug-tools` | .codex | copy+deharness | /Users/dylanmccavitt/.codex/skills/codex-debug-tools |
| `deliverable-report` | .agents | copy | /Users/dylanmccavitt/.agents/skills/deliverable-report |
| `diagnose` | .agents | copy | /Users/dylanmccavitt/.agents/skills/diagnose |
| `doc` | .agents | copy | /Users/dylanmccavitt/.agents/skills/doc |
| `excalidraw-diagrams` | .agents | copy | /Users/dylanmccavitt/.agents/skills/excalidraw-diagrams |
| `find-skills` | .agents | copy | /Users/dylanmccavitt/.agents/skills/find-skills |
| `fleet-status` | .codex | copy+deharness | /Users/dylanmccavitt/.codex/skills/fleet-status |
| `gh-issue-thread-chain` | .codex | copy+deharness | /Users/dylanmccavitt/.codex/skills/gh-issue-thread-chain |
| `grill-me` | .agents | copy | /Users/dylanmccavitt/.agents/skills/grill-me |
| `grill-with-docs` | .agents | copy | /Users/dylanmccavitt/.agents/skills/grill-with-docs |
| `handoff` | .agents | copy | /Users/dylanmccavitt/.agents/skills/handoff |
| `html-annotated-pr-review` | .agents | copy | /Users/dylanmccavitt/.agents/skills/html-annotated-pr-review |
| `html-code-approaches` | .agents | copy | /Users/dylanmccavitt/.agents/skills/html-code-approaches |
| `html-implementation-plan` | .agents | copy | /Users/dylanmccavitt/.agents/skills/html-implementation-plan |
| `html-module-map` | .agents | copy | /Users/dylanmccavitt/.agents/skills/html-module-map |
| `html-ticket-triage-board` | .agents | copy | /Users/dylanmccavitt/.agents/skills/html-ticket-triage-board |
| `improve-codebase-architecture` | .agents | copy | /Users/dylanmccavitt/.agents/skills/improve-codebase-architecture |
| `inbox-triage` | .agents | copy | /Users/dylanmccavitt/.agents/skills/inbox-triage |
| `issue-bootstrap` | .agents | copy | /Users/dylanmccavitt/.agents/skills/issue-bootstrap |
| `issue-work` | .agents | copy | /Users/dylanmccavitt/.agents/skills/issue-work |
| `jupyter-notebook` | .agents | copy | /Users/dylanmccavitt/.agents/skills/jupyter-notebook |
| `openai-docs` | .agents | copy | /Users/dylanmccavitt/.agents/skills/openai-docs |
| `orca-cli` | .agents | copy | /Users/dylanmccavitt/.agents/skills/orca-cli |
| `orchestration` | .agents | copy | /Users/dylanmccavitt/.agents/skills/orchestration |
| `pdf` | .agents | copy | /Users/dylanmccavitt/.agents/skills/pdf |
| `pr-review` | .agents | copy | /Users/dylanmccavitt/.agents/skills/pr-review |
| `project-sanity-check` | .agents | copy | /Users/dylanmccavitt/.agents/skills/project-sanity-check |
| `proof-pass` | REPO | keep | (already in repo) |
| `prototype` | .agents | copy | /Users/dylanmccavitt/.agents/skills/prototype |
| `repo-triage` | .agents | copy | /Users/dylanmccavitt/.agents/skills/repo-triage |
| `repo-workflow-bootstrap` | .codex | copy+deharness | /Users/dylanmccavitt/.codex/skills/repo-workflow-bootstrap |
| `resume-thread` | REPO | keep | (already in repo) |
| `security-best-practices` | .agents | copy | /Users/dylanmccavitt/.agents/skills/security-best-practices |
| `security-ownership-map` | .agents | copy | /Users/dylanmccavitt/.agents/skills/security-ownership-map |
| `security-threat-model` | .agents | copy | /Users/dylanmccavitt/.agents/skills/security-threat-model |
| `session-tree-map` | .codex | copy+deharness | /Users/dylanmccavitt/.codex/skills/session-tree-map |
| `setup-matt-pocock-skills` | .agents | copy | /Users/dylanmccavitt/.agents/skills/setup-matt-pocock-skills |
| `skill-maintenance` | .agents | copy | /Users/dylanmccavitt/.agents/skills/skill-maintenance |
| `summarize-youtube-videos` | .agents | copy | /Users/dylanmccavitt/.agents/skills/summarize-youtube-videos |
| `swiftui-pro` | .agents | copy | /Users/dylanmccavitt/.agents/skills/swiftui-pro |
| `tdd` | .agents | copy | /Users/dylanmccavitt/.agents/skills/tdd |
| `teach` | .agents | copy | /Users/dylanmccavitt/.agents/skills/teach |
| `terminal-steering` | .codex | copy+deharness | /Users/dylanmccavitt/.codex/skills/codex-omp-terminal-steering |
| `theme-factory` | .agents | copy | /Users/dylanmccavitt/.agents/skills/theme-factory |
| `thread-closeout` | REPO | keep | (already in repo) |
| `thread-organizer` | .codex | copy+deharness | /Users/dylanmccavitt/.codex/skills/thread-organizer |
| `to-issues` | .agents | copy | /Users/dylanmccavitt/.agents/skills/to-issues |
| `to-prd` | .agents | copy | /Users/dylanmccavitt/.agents/skills/to-prd |
| `tradingview-breakout-dashboard` | .agents | copy | /Users/dylanmccavitt/.agents/skills/tradingview-breakout-dashboard |
| `triage` | .agents | copy | /Users/dylanmccavitt/.agents/skills/triage |
| `workflow-kit` | .agents | copy | /Users/dylanmccavitt/.agents/skills/workflow-kit |
| `write-a-skill` | .agents | copy | /Users/dylanmccavitt/.agents/skills/write-a-skill |
| `zoom-out` | .agents | copy | /Users/dylanmccavitt/.agents/skills/zoom-out |
