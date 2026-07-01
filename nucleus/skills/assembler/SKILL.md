---
name: assembler
description: Sets a repository up for the Factorio workflow kit or refreshes its envelope by reading the repo and generating the repo-local envelope every other kit skill binds to, plus the harness wiring and repo-specific skills and agents. Use when setting up a repo for the kit or refreshing its Linear team/project/label map, domain glossary, build/test/lint commands, PR/issue/doc templates, or repo-specific skills and agents.
---

# Assembler

The assembling machine that builds the machines: it lays out the per-repo factory the rest of the kit runs on. `assembler` reads a repo and stamps the repo-local **envelope**, wires the harness to it, and scaffolds the repo-specific tooling the kit needs there. It replaces the retired bootstrap trio — `repo-workflow-bootstrap`, `workflow-kit`, and `setup-matt-pocock-skills` — folding their machinery into one Factorio-framed, Linear-aware skill.

This skill writes only envelope, wiring, and scaffold files. It never creates Linear objects, branches, or PRs (`prospect` and `ghosts` create planning objects; `roboports` writes code), and it asks the user only for facts no tool can supply.

## The envelope

Canonical source: `.agents/envelope/` in the target repo. It contains four human-authored Markdown bindings:

- `linear-map.md` — which Linear team, project(s), labels, and workflow states map to this repo (including the `inserter` triage roles → state/label map), plus the GitHub bridge convention: the branch carries the Linear issue id; the PR auto-links and auto-closes the issue on merge.
- `domain.md` — the repo's domain glossary: nouns, bounded contexts, and the words specs and issues must use.
- `commands.md` — the real build / test / lint / run commands and the default branch.
- `templates/` — repo-local PR / issue / doc templates, stamped from `blueprint`'s canonical `templates/`.

This Markdown envelope is the **single binding point**. The local Factory Nucleus state file at `~/.loom/factory-nucleus/<id>/envelope/envelope.yaml` is a generated/validated mirror for schema/runtime checks, not a second source to edit. Every kit skill reads it instead of hardcoding a tracker. See [ENVELOPE.md](ENVELOPE.md) for the full shape of each binding.

## Repo wiring

Once the envelope exists, wire the harness to it: add or update an `## Agent skills` block in the repo's `AGENTS.md` (or `CLAUDE.md` if that is the one present — never create the other when one already exists) pointing the kit at `.agents/envelope/`. This is how a fresh agent in the repo discovers the envelope instead of re-deriving it.

## Repo-specific skills and agents

Synthesize the tooling the envelope implies but the generic kit cannot carry — a `<repo>-<capability>` skill for a recurring domain workflow, or a reviewer agent scoped to the repo's real risk areas. Generate them under the repo's own `.agents/skills/` and `.agents/agents/`, one level deep, each with a concrete `Use when` trigger and no harness prefix. See [SCAFFOLD.md](SCAFFOLD.md). Generate only what a real workflow needs (cite `bus-first`); never scaffold a speculative skill.

## Workflow

1. **Read the repo.** Detect stack, default branch, build/test/lint/run commands, existing docs/ADRs, `AGENTS.md`/`CLAUDE.md`, and any prior `.agents/envelope/`. Use `list_teams`, `list_projects`, `list_issue_labels`, and `list_issue_statuses` to discover the Linear mapping.
2. **Ask only for the gaps.** Confirm the team/project and the label-to-state mapping the tools cannot infer. Never ask for anything the repo or Linear already answers.
3. **Generate, create-missing-only.** Write each envelope file that is absent; never clobber one that exists. Stamp `templates/` from `blueprint`'s canonical `templates/`, substituting the repo's real names; never copy placeholders verbatim. Wire the `## Agent skills` block. Scaffold the repo-specific skills/agents the envelope implies.
4. **Verify.** Cross-check the Markdown bindings agree, the generated YAML mirror validates when present, and the envelope is complete before declaring the repo ready; see [VERIFY.md](VERIFY.md). A refresh proposes a diff and asks before overwriting.

## Invariants

- **Never writes secrets.** No tokens, keys, or credentialed URLs ever land in the envelope — record where a secret lives (the env var name), never its value.
- **Create-missing-only.** Generation never overwrites an existing envelope file; a refresh is an explicit, confirmed diff.
- **Single binding point.** `.agents/envelope/` is the author-owned source for repo facts; the YAML file under `~/.loom/factory-nucleus/<id>/envelope/` is only its generated/validated mirror.
- **Minimal diff.** Stamp the least that makes the kit work and cite `bus-first` — never scaffold a file, skill, or agent no workflow reads.

## Routing

- Setting up / refreshing repo facts, harness wiring, or repo-specific tooling lands here.
- "Create an issue" / "make tickets" → `ghosts`. Assembler maps the tracker; it never opens issues.
- Spec or template *content* → `blueprint` (it owns the canonical templates assembler stamps).
- A brand-new idea → `prospect`.
