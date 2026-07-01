# ADR 0001: OMP Agent Tree Is Parameterized Appliable Source

## Status

Accepted.

## Context

The repository tracks `omp/.omp/agent/` as the OMP layer of the nucleus harness. The resource manifest already treats OMP user/project resources and workflow-kit guidance as `track`, while runtime state and private history are `local-only`. `omp/.omp/agent/RULES.md` also forbids secrets, credentials, account IDs, and private environment values in tracked workflow files.

The tracked `omp/.omp/agent/config.yml` had drifted into a verbatim machine mirror: personal model role selections, a local ignored-skill list, and a granted autoqa consent value were stored beside portable base settings.

## Decision

`omp/.omp/agent/` is parameterized appliable source.

- Portable base files are tracked and may be rendered by future dry-run/apply tooling.
- Personal/account/operator values are carved out into a gitignored `local-only` overlay.
- `omp/.omp/agent/config.yml` is the portable base config.
- `omp/.omp/agent/config.local.yml` is the local-only overlay for this operator.
- `omp/.omp/agent/config.example.yml` documents the overlay shape without personal values.

## Rejected Alternative

Treating `omp/.omp/agent/` as a reference-only snapshot is rejected. That would preserve the mirror problem and leave future render/apply tooling without an explicit source/overlay boundary.

## Consequences

Future renderers must merge the tracked portable base with an optional local-only overlay before writing live OMP config. Tracked files must not contain personal model picks, local skill-suppression preferences, consent grants, credentials, or private environment values.

## 2026-07-01 Addendum: Source Root Move

Per ADR 0004 and LOO-107, the tracked OMP source root moved from
`omp/.omp/agent/` to `adapters/omp/source/`. The source/overlay contract is
unchanged: `config.yml` remains the portable base, `config.local.yml` remains
the local-only overlay, and `config.example.yml` documents the overlay shape
without personal values.
