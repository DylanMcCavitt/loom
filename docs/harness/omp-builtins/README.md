# OMP Built-ins Snapshot

This directory is a versioned, non-live reference snapshot of portable OMP built-in resources from `@oh-my-pi/pi-coding-agent`.

- `agents/` contains bundled task agents exported with `omp agents unpack --dir <temp> --json`.
- `source.json` records source package metadata, expected agent names, hashes, and refresh commands.
- `commands.json` indexes built-in slash commands by name, aliases, source type, and portability class.
- `resource-index.json` indexes built-in prompt categories and default rules by path and hash.

Runtime-only surfaces are indexed but not copied. This snapshot must not include live `~/.omp/agent` sessions, terminal state, blobs, caches, logs, databases, auth state, or project `.omp/agents`.

Compare the installed OMP package against this snapshot:

```sh
node scripts/refresh-omp-builtins-snapshot.mjs
```

Refresh the checked-in snapshot after an intentional OMP update:

```sh
node scripts/refresh-omp-builtins-snapshot.mjs --write
node scripts/validate-omp-builtins-snapshot.mjs --check-live
```
