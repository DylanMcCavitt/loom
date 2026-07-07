# ADR 0008: Factory Nucleus Contract

## Status

Accepted.

## Context

ADR 0003 introduced the Factorio workflow kit with per-repo tracker binding. Factory Nucleus (`scripts/factory-nucleus/`, `docs/architecture/factory-nucleus.md`) implements the tracker-neutral planning and delivery layer: ghosts, envelopes, recipes, and radar checks.

Operators need durable workflow policy without committing private tracker credentials or team maps to the repo. Science maturity must be observed from evidence, not declared.

## Decision

1. **Envelope is VM-local.** Durable policy lives at `~/.loom/factory-nucleus/<factory-id>/envelope/envelope.yaml`. The repo tracks only a pointer (`.loom.yml` identity); envelope YAML is never committed.
2. **Tracker-neutral ghosts.** A planned unit of work is a ghost mapped by peer adapters (Linear, GitHub Issues). New envelopes start with `tracker.provider: none`; binding requires explicit operator choice via `choose-tracker` / `bind-tracker`.
3. **Science unlock ladder.** `scripts/factory-nucleus/science.mjs` computes maturity from observed evidence (`base` → `red` → `green` → `blue` → `purple` → `yellow` → `space`). Missing unlocks cap the level; subagent capacity is not evidence.
4. **Zero-footprint scan.** `scan` inspects repo metadata, stack signals, and optional integrated envelope pointers without writing tracker, blueprint, or repo state; secret-like values are redacted from artifacts.
5. **Radar is check-only.** Drift recommendations never rewrite tracker or repo files.

## Rejected Alternative

Storing tracker tokens, team/project maps, or proof overrides in tracked repo files is rejected. That would break the portable library boundary and leak operator credentials into version control.

## Consequences

Per-VM bootstrap follows `docs/operator/envelope-bootstrap.md`. Default validation stays offline (`npm run check`); live tracker smoke is opt-in (`npm run smoke:live`). If Factory Nucleus ever commits envelope policy to the repo, this ADR must be superseded.

