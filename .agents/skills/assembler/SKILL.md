---
name: assembler
description: Sets a repository up for the Factorio workflow kit or refreshes its contract by reading the repo and generating the repo-local contract every other kit skill binds to. Use when setting up a repo for the kit or refreshing its Linear team/project/label map, domain glossary, build/test/lint commands, or PR/issue/doc templates.
---

# Assembler

The assembling machine that builds the machines: it lays out the per-repo factory the rest of the kit runs on. `assembler` reads a repo once and stamps the repo-local **contract** — the single artifact every other kit skill binds to. It re-themes the retired bootstrap trio's machinery (`repo-workflow-bootstrap` and friends): the same inspect-then-stamp idea, now Factorio-framed and Linear-aware.

This skill writes only contract files. It never creates Linear objects, branches, or PRs (`prospect` and `ghosts` create planning objects; `robots` writes code), and it asks the user only for facts no tool can supply.

## The contract

Home: `.agents/contract/` in the target repo. Four bindings:

- `linear-map.md` — which Linear team, project(s), labels, and workflow states map to this repo, plus the GitHub bridge convention: the branch carries the Linear issue id; the PR auto-links and auto-closes the issue on merge.
- `domain.md` — the repo's domain glossary: nouns, bounded contexts, and the words specs and issues must use.
- `commands.md` — the real build / test / lint / run commands and the default branch.
- `templates/` — repo-local PR / issue / doc templates, stamped from `blueprint`'s canonical `templates/`.

This contract is the **single binding point**. Every kit skill reads it instead of hardcoding a tracker: `prospect` and `ghosts` read the Linear map; `blueprint` reads the glossary and owns the template source; `robots` and `rocket-launch` read the commands and the PR template. When a repo's facts change, refresh the contract — not each skill.

## Workflow

1. **Read the repo.** Detect stack, default branch, the build/test/lint/run commands, existing docs/ADRs, and any prior `.agents/contract/`. Use `list_teams`, `list_projects`, `list_issue_labels`, and `list_issue_statuses` to discover the available Linear mapping.
2. **Ask only for the gaps.** Confirm the team/project and the label-to-state mapping the tools cannot infer. Never ask for anything the repo or Linear already answers.
3. **Generate, create-missing-only.** Write each contract file that is absent; never clobber one that exists — a refresh proposes a diff and asks before overwriting. Stamp `templates/` from `blueprint`'s `templates/`, substituting the repo's real names; never copy placeholders verbatim.
4. **Cross-check.** Make the four bindings agree — same project, same commands, same template paths the other skills reference.

## Invariants

- **Never writes secrets.** No tokens, keys, or credentialed URLs ever land in the contract — record where a secret lives (the env var name), never its value.
- **Create-missing-only.** Generation never overwrites an existing contract file; a refresh is an explicit, confirmed diff.
- **Single binding point.** The contract is the one place repo facts live; skills read it, they do not re-derive it.
- **Minimal diff.** Stamp the least that makes the kit work and cite `bus-first` — do not scaffold files no skill reads.

## Routing

- Setting up or refreshing repo facts lands here.
- "Create an issue" / "make tickets" → `ghosts`. Assembler maps the tracker; it never opens issues.
- Spec or template *content* → `blueprint` (it owns the canonical templates assembler stamps).
- A brand-new idea → `prospect`.

## Out of scope (enrichment)

Full per-repo skill/agent generation — synthesizing repo-specific skills or subagents from the contract — is deliberately deferred. The MVP stamps the four contract bindings and stops.
