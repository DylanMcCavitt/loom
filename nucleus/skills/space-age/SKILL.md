---
name: space-age
description: Coordinates delivery beyond a single repo or environment — promoting an artifact through a CI/CD pipeline planet by planet and landing cross-repo changes in dependency order, reusing the per-hop launch gates. Use when work crosses one repo or one environment: CI/CD pipelines, releasing/promoting through environments, or coordinating a change across multiple repos/services.
---

# Space Age

Beyond one planet. `rocket-launch` ships one change off one planet; `space-age`
runs the logistics *between* planets — promoting an artifact through environments
and coordinating a change across repos. Interplanetary logistics, not a single
launch.

This skill does not deploy, promote artifacts, trigger pipelines, or merge across repos while being validated. During real work it plans and drives the
promotion path and the cross-repo landing order, deferring each individual
gate/merge to `rocket-launch`.

## The space platform and its planets

- Each environment or repo is a **planet** with its own constraints (staging,
  prod, edge — like Vulcanus, Fulgora, Gleba, Aquilo: each hostile in its own
  way, each demanding its own gates).
- The CI/CD pipeline is the **space platform** that carries an artifact from
  planet to planet. You promote the artifact that already passed — you carry it
  forward, you do not rebuild it at each stop.

## Required reading: the repo envelope

Read the repo envelope `assembler` generated before moving anything: the
environment list and promotion path, each environment's commands/CI, the merge
policy, and (for multi-repo work) the cross-repo dependency graph. Never hardcode
environments, pipelines, or commands; read them from the envelope. If it is
missing, route to `assembler` first.

## The promotion path

Lay out the ordered hops between planets (e.g. staging → prod → edge) from the
envelope. The path is a DAG, not a single line when repos fan out: each hop
carries the same built artifact forward to the next planet.

## Per-planet gates

Every planet has its own gravity. The **`rocket-launch` gates apply per environment** — per-environment gates, not a single global check. At each hop, run
that destination's gates before the artifact lands there:

- Reuse `rocket-launch` per hop to run that environment's gate set (tests,
  review, acceptance, CI, minimal-diff) and perform the merge/deploy — do not
  reinvent merge or gate logic here.
- **Never promote past a red gate.** A red gate on any planet stops the platform:
  the artifact does not advance to the next environment. Report which planet's
  gate failed and why; promotion resumes only once it is green.

## Multi-repo coordination

When a change spans repos/services, **cross-repo changes are dependency-ordered**:
land each repo after the repos it depends on, so a dependent never ships against
an envelope that has not landed yet. Walk the dependency graph from the envelope,
ship the base repos through `rocket-launch` first, and only then the dependents.
Each repo still rides its own one-issue-one-branch-one-PR bridge via `roboports`.

## Routing

- A single PR ship on one planet is `rocket-launch`, not this skill.
- Implementing the feature itself is `roboports`.
- This skill engages only when work crosses an environment or a repo boundary.

## Invariants

- Every promotion passes that environment's gates; **never promotes past a red
  gate**.
- Cross-repo changes are dependency-ordered; dependents land after what they
  depend on.
- Reuses `rocket-launch` per hop rather than reinventing merge/gate logic.
- Reads the repo envelope for environments, pipelines, and commands; never
  hardcodes them.
