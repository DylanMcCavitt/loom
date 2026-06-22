# ADR 0002: Loom Is The Skill/Harness Library, No Project Agents Layer

## Status

Accepted.

## Context

`~/.omp/agent/AGENTS.md` documents a default workflow whose step 3 reads `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, and `docs/agents/domain.md` "when present." Those references describe a per-project agent layer: issue-tracker conventions, triage labels, and domain language a consumer repo carries so agents can ground their work.

Loom (the `oh-my-pi-config` nucleus harness) carries no `docs/agents/` directory. It is the declarative skill/harness-nucleus library: it tracks portable OMP source under `omp/.omp/agent/`, adapter plans and manifests under `docs/harness/`, validators under `scripts/`, tests under `tests/`, and the disposition manifest in `docs/harness/resource-manifest.md`. Runtime state stays in `~/.omp`, `~/.codex`, and `~/.claude`; the repo owns only portable surfaces. It is not a kit-managed product project with its own issue tracker, triage labels, or business domain.

This raised a question: does Loom need to author a `docs/agents/` project layer to satisfy the AGENTS.md references?

## Decision

Loom does not carry a `docs/agents/` project layer, and none is created.

- The `docs/agents/*` references in `~/.omp/agent/AGENTS.md` are generic guidance for downstream consumer repos that adopt the workflow kit.
- They are conditional ("when present"), and Loom legitimately has none.
- Loom is the source library those downstream repos draw from, not a product project that consumes the layer it provides.

## Rejected Alternative

Creating `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, and `docs/agents/domain.md` inside Loom is rejected. Loom has no project-specific issue tracker, triage taxonomy, or business domain to record; such files would be empty scaffolding that misrepresents a library repo as a product project and contradicts the tracked/portable boundary defined in `docs/harness/resource-manifest.md`.

## Consequences

Agents working in Loom skip AGENTS.md workflow step 3: there is no `docs/agents/` to read, and its absence is expected, not a gap. Downstream repos that adopt the workflow kit are the place where `docs/agents/` is authored. If Loom ever ships its own project layer, this ADR must be superseded.
