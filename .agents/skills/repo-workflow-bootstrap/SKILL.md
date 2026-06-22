---
name: repo-workflow-bootstrap
description: 'Bootstrap a software repo with a repo-local workflow architecture: stable project contract, mutable next-thread handoff, per-issue runbook, role definitions, issue template, and PR template. Use when creating or cleaning up a new project so future issue work runs through a consistent one-issue-one-worktree-one-PR flow.'
---

# Repo Workflow Bootstrap

## Overview
Use this skill to scaffold or clean up a repo-local workflow system modeled on
the stronger parts of the `pulse` architecture:

- stable project contract
- mutable next-thread handoff
- explicit role boundaries
- explicit per-issue lifecycle
- executable issue packets
- evidence-aware PR template

This skill complements the shared workflow kit. The workflow kit provides the
cross-project rules; this skill writes the repo-local files that make those
rules concrete inside a new codebase.

## Use when

Use this skill when the user asks to:

- bootstrap a new software repo or project workflow
- create repo-local `AGENTS.md` / workflow docs / issue templates
- standardize issue execution, handoffs, or PR rules for a new repo
- turn an ad hoc project into a repeatable issue-driven architecture
- clean up a repo where workflow rules exist but drift across files

Do not use this for:

- non-software writing/admin projects
- one-off issue execution inside a repo that already has a clear local
  workflow playbook
- repos where the user explicitly wants a radically different workflow shape

## Expected outcome

After using this skill, the repo should usually have:

- `docs/HANDOFF.md`
- `docs/NEXT_THREAD_HANDOFF.md`
- `docs/PLAN.md`
- `docs/AGENTS.md`
- `docs/WORKFLOW.md`
- `docs/issues/ISSUE_TEMPLATE.md`
- `.github/pull_request_template.md`

Adjust paths only if the repo already uses a different documented layout.

## Fast path

Use the bundled helper script when you want to stamp the baseline files into a
repo quickly:

```bash
python3 ~/.agents/skills/repo-workflow-bootstrap/scripts/bootstrap_repo_workflow.py \
  --repo /absolute/path/to/repo \
  --project-name "Project Name"
```

By default the script:

- creates missing workflow files from the templates
- does not overwrite existing files
- replaces the `<Project>` placeholder with the provided project name or the
  repo folder name

Use `--force` only when you intentionally want to replace existing workflow
files with the template baseline.

## Workflow

1. Inspect the repo before writing docs.
   - Confirm default branch, stack, build/test commands, CI shape, and whether
     the repo already has a local workflow file that should take precedence.
   - Identify whether the project is app-heavy, backend-heavy, UI-heavy, or
     release-heavy so verification sections are realistic.

2. Lock the repo-local document split.
   - `HANDOFF.md`:
     stable project contract only.
   - `NEXT_THREAD_HANDOFF.md`:
     mutable "what just changed / what next" artifact.
   - `PLAN.md`:
     roadmap, dependency graph, issue index.
   - `AGENTS.md`:
     role boundaries.
   - `WORKFLOW.md`:
     exact per-issue runbook.

3. Write the issue packet contract.
   Every issue template should include:
   - metadata
   - objective
   - scope
   - non-goals
   - constraints
   - acceptance criteria
   - owned paths
   - expected files touched
   - verification commands
   - required evidence

4. Keep the workflow narrow and executable.
   Default to:
   - one issue -> one worktree -> one branch -> one PR
   - alignment before execution
   - execution before PR review
   - merge only when current with the default branch and CI is green
   - reruns stay on the same PR

5. Separate stable vs changing state.
   - Never let `HANDOFF.md` become a running status log.
   - Put current branch/PR/next-issue state in `NEXT_THREAD_HANDOFF.md`.

6. Adapt verification to the repo type.
   - backend/data repos: runtime commands, artifact inspection, sample inputs
   - app/UI repos: simulator/device context, screenshots, manual behaviors
   - release flows: archive/build numbers, portal actions, human-run steps

7. Make the docs agree with each other.
   Cross-check:
   - path references
   - issue packet fields
   - PR template requirements
   - role responsibilities
   - any repo-local skills or scripts that point at these docs

## Strong defaults

- Prefer `docs/` for repo-local workflow files.
- Prefer one orchestrator-owned issue flow. Do not require the human to start a
  separate thread between alignment, execution, and review.
- Keep `ALIGNMENT.md` branch-local if you adopt an alignment memo.
- Require `Owned Paths` to reduce file-overlap drift.
- Require `Required Evidence` so UI and release work do not stop at
  "looks good locally."
- Keep PRs reviewable. If a packet no longer fits, split the issue instead of
  widening the branch.

## Bootstrap checklist

Use this order unless the repo already has a stronger local convention:

1. Create `docs/HANDOFF.md`.
2. Create `docs/NEXT_THREAD_HANDOFF.md`.
3. Create `docs/PLAN.md`.
4. Create `docs/AGENTS.md`.
5. Create `docs/WORKFLOW.md`.
6. Create `docs/issues/ISSUE_TEMPLATE.md`.
7. Update or create `.github/pull_request_template.md`.
8. If the repo already has issue packets, retrofit the active ones first.
9. Refresh `NEXT_THREAD_HANDOFF.md` so it points at merged default-branch state.
10. Sanity-check references across all files.

## Adaptation rules

- If the repo already has a stable architecture doc, reference it from
  `HANDOFF.md` instead of duplicating it.
- If the repo uses `main` vs `master`, reflect the real branch name.
- If the repo has a canonical local checkout separate from issue worktrees,
  document that explicitly in `WORKFLOW.md`.
- If the repo has human-gated steps, keep them explicit instead of pretending
  they can be automated.
- If the repo uses different owner routing for UI vs backend work, put that in
  `AGENTS.md` or the issue template metadata.

## Templates

Use the files under `templates/` as the starting point. Replace placeholders
with the real repo details instead of copying them verbatim.

- [AGENTS.md](templates/AGENTS.md)
- [WORKFLOW.md](templates/WORKFLOW.md)
- [HANDOFF.md](templates/HANDOFF.md)
- [NEXT_THREAD_HANDOFF.md](templates/NEXT_THREAD_HANDOFF.md)
- [PLAN.md](templates/PLAN.md)
- [ISSUE_TEMPLATE.md](templates/ISSUE_TEMPLATE.md)
- [pull_request_template.md](templates/pull_request_template.md)

## Helper script

The bundled helper lives at:

- [scripts/bootstrap_repo_workflow.py](scripts/bootstrap_repo_workflow.py)

Typical use:

```bash
python3 ~/.agents/skills/repo-workflow-bootstrap/scripts/bootstrap_repo_workflow.py \
  --repo /absolute/path/to/repo \
  --project-name "My App"
```

Preview without writing:

```bash
python3 ~/.agents/skills/repo-workflow-bootstrap/scripts/bootstrap_repo_workflow.py \
  --repo /absolute/path/to/repo \
  --project-name "My App" \
  --dry-run
```

Overwrite existing workflow files intentionally:

```bash
python3 ~/.agents/skills/repo-workflow-bootstrap/scripts/bootstrap_repo_workflow.py \
  --repo /absolute/path/to/repo \
  --project-name "My App" \
  --force
```
