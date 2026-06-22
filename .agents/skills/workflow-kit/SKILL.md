---
name: workflow-kit
description: Configure Dylan's reusable Oh My Pi workflow kit and bootstrap project-specific skills, project agent docs, issue tracker conventions, and handoff rules. Use when the user asks to set up Oh My Pi globally, configure a repo for agent work, create project-specific skills, or validate workflow-kit installation.
---

# Workflow Kit

## When to use

Use this skill for Oh My Pi workflow setup, project bootstrapping, project-specific skill creation, and workflow validation.

## Read first

1. `/Users/dylanmccavitt/.omp/agent/workflow-kit/README.md`
2. Target repo `.omp/AGENTS.md` when present
3. Target repo `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, and `docs/agents/domain.md` when present

## Bootstrap a project

Run `/Users/dylanmccavitt/.omp/agent/workflow-kit/scripts/init-project.sh <repo>`.
Then review generated files and replace placeholders with repo facts.

## Validate a project

Run `/Users/dylanmccavitt/.omp/agent/workflow-kit/scripts/check-project.sh <repo>`.
Then run the repo's own verification commands.

## Project-specific skills

Create project skills under `<repo>/.agents/skills/<project>-<capability>/SKILL.md`.
Descriptions must say exactly when to use the skill.
Do not nest skills deeper than one directory under `.agents/skills`.
