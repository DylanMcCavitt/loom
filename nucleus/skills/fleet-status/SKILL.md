---
name: fleet-status
description: Build a single source-of-truth HTML dashboard of every local git repo under ~/src and ~/projects — branch/dirty/unpushed state, open PRs and checks, GitHub issues, staleness, plus per-repo findings, next-ups, and an agent summary. Use when the user wants to see what's in flight across all their projects, what needs attention, or what to pick up next.
disable-model-invocation: true
---

# fleet-status

Generates `~/fleet/index.html` — one coherent section per repo, sorted by what needs attention. Source of truth is regenerated on every run.

## Flow

1. **Collect** — run the scanner:
   ```bash
   python3 ~/.agents/skills/fleet-status/collect.py
   ```
   Writes `~/fleet/data.json`. Discovers repos under `~/src` and `~/projects` (depth ≤2), gathers git state, and queries `gh` for PRs/issues **only on repos the user owns** (skips vendored upstreams). Excludes are in `EXCLUDE_NAMES` (currently `dots`, `browser-harness`).

2. **Agent summaries** (the enrichment layer) — read `~/fleet/data.json` and pick the repos with `needs_attention: true`. For each, spawn a read-only subagent (`Explore`) **in parallel** (one message, multiple Agent calls). Give it the repo `path`, `diffstat`, `recent_commits`, and PR titles. Ask for strict JSON:
   ```json
   {"summary": "1–2 sentences on what's in flight", "findings": ["≤3 terse items"], "next_ups": ["≤3 concrete next actions"]}
   ```
   Keep it tight — no dumps. Assemble all results into `~/fleet/summaries.json` keyed by repo name:
   ```json
   { "portfolio-": {"summary": "...", "findings": ["..."], "next_ups": ["..."]} }
   ```
   The renderer merges these with the auto-derived findings/next-ups (deduped). Skip this step if invoked with `--no-agents` (fast pass).

3. **Render** — build the HTML:
   ```bash
   python3 ~/.agents/skills/fleet-status/render.py
   ```
   Writes `~/fleet/index.html`. Reads `summaries.json` if present.

4. **Open** — `open ~/fleet/index.html` (macOS) so it surfaces in the browser.

5. **Report** — in chat, give a 3–5 line summary: count needing attention, the top 2–3 repos and why, and anything urgent (diverged, failing CI, large unpushed work).

## Notes
- `data.json` and `summaries.json` are intermediate; `index.html` is the artifact.
- Only **direct children** of `~/src` and `~/projects` are scanned (depth-1; nested repos ignored).
- Classification: a repo is **active** if touched ≤30d, or has uncommitted/unpushed work. **Parked** repos are hidden unless they have work. **needs-attention** = has auto-findings (dirty / unpushed / diverged / no-upstream / failing checks).
- PR section shows title + checks only (no per-PR diffs).
- To track/untrack a repo, edit `EXCLUDE_NAMES`, `ROOTS`, or `ACTIVE_DAYS` at the top of `collect.py`.
- Stale `gh` auth → PR/issue sections are simply empty; the rest still works.

## Daily refresh
`refresh.sh` runs collect + render silently (no agents, no browser pop) and is wired to a launchd job (`~/Library/LaunchAgents/com.dylan.fleet-status.plist`, daily 08:00). It preserves the last `summaries.json`, so the morning view keeps yesterday's agent notes until you run `/fleet-status` again for fresh ones.
