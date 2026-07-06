# OMP Ownership

This document is the operator-facing ownership matrix for OMP-sourced surfaces in `docs/harness/resource-manifest.json`. It records only category-level ownership state; runtime and private local contents remain outside the repo.

## OMP ownership state matrix

| Resource ID | Ownership state | Intended repo target | Local-only surface |
| --- | --- | --- | --- |
| `omp-built-in-runtime-resources` | `reference-only` | `distributions/snapshots/omp-builtins/` | `no` |
| `omp-user-project-resources` | `track` | `adapters/omp/source/ and docs/harness/omp/` | `no` |
| `omp-personal-local-overrides` | `local-only` | `none` | `yes` |
| `omp-runtime-state` | `local-only` | `none` | `yes` |

`local-only` rows are not repo-owned or trackable. They may be reported by path pattern during dry-run checks, but their live contents are never read, copied, normalized, or written by repo tooling.

## Ownership states

- `track`: loom owns the declarative repo source and may render a candidate for a live path. Live writes still use the dry-run-first, create-missing-only install flow.
- `reference-only`: loom may snapshot or document portable facts, but does not install or mutate the live source.
- `local-only`: loom may mention the path pattern in safety guards, but must never read, copy, normalize, migrate, or write the live contents.

Runtime apply status is still reported separately by the renderer:

- `user-file`: a live path exists and is not known to be loom-owned. The renderer skips it.
- `repo-mirror`: a live symlink points into this repo — a legacy state from pre-copy-mode installs. New applies never create these; converting or retargeting one requires the explicit OMP repo-owned approval gate. Existing mirrors can be converted to operator-owned copies (see the overlay-split conversion in `docs/operator/install-update.md`).
- `marker-owned`: loom previously wrote the file (as a copy) and recorded the marker manifest. Live edits after apply are operator-owned; drift from the tracked default is expected and reported before any replacement.

## Operator decision points

1. Run the renderer in dry-run mode first and inspect ownership/status output.
2. Leave `user-file` paths untouched unless the operator explicitly decides they should become repo-owned.
3. Use create-missing-only writes for normal installs; pre-existing user files are skipped.
4. Use `--approve-omp-repo-owned` only when intentionally claiming or retargeting OMP repo mirrors.
5. Keep local-only runtime state out of tracked source even when a dry run reports that a path exists.

## Local-only surfaces

The local-only OMP rows cover private or runtime-owned data such as:

- `~/.omp/agent/config.local.yml`
- `~/.omp/agent/*.local.yml`
- secrets and credentials
- sessions and terminal sessions
- caches and blobs
- logs
- databases and SQLite files

These surfaces stay operator-owned. They are guarded by path pattern, not copied into loom.
