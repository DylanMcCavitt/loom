---
name: debug-tools
description: Diagnose app and agent workflow failures, especially omp /debug report bundles, unwanted tool calls, wrong thread or terminal mistakes, stale input, repeated reads, failed commands, slow or high-token steps, missing proof, subagent issues, logs, config, env, and system-info triage. Use when the user asks to debug an agent run, inspect an agent thread, mirror omp /debug, analyze a session dump, or identify concrete next debugging actions.
---

# Debug Tools

## Overview

Use this skill as the native counterpart to the `omp` `/debug` tools. It
supports two paths:

- Analyze an `omp` `/debug` report bundle or extracted report directory.
- Audit the current agent thread from the visible transcript, terminal,
  files touched, command outputs, and proof gaps.

## Oracle Path

When the user asks to mirror or verify `omp` `/debug`, use `omp` as the source of
truth when available:

1. Open or use the terminal sidebar attached to the relevant project.
2. Resume the target `omp` session if the user provided one:

```bash
omp --resume SESSION_ID
```

3. If `omp` says the session belongs to another project, prefer resuming from the
   original cwd rather than forking into the current directory unless the user
   explicitly wants a fork.
4. Run `/debug` and inspect the selector. Read
   `references/debug-observed.md` when exact observed menu behavior matters.
5. Prefer `Report: dump session` for low-impact evidence. It creates a bundle
   under `~/.omp/reports/`.
6. Sample `View: system info` and `View: recent logs` when the user asks for
   runtime context or log behavior. Avoid `Report: memory issue`,
   `Report: performance issue`, or profiling unless the task needs those heavier
   captures.
7. Analyze the bundle:

```bash
python3 ~/.agents/skills/debug-tools/scripts/analyze_debug_bundle.py \
  ~/.omp/reports/<report>.tar.gz
```

Use `--json` when another tool or report needs structured output.

## Native Path

This app does not expose a live `/debug` menu API (as `omp` does) for the current
thread. When no `omp` report is available, run a transcript-based audit instead:

1. Confirm the target: current thread, named thread, terminal sidebar, browser,
   repo, worktree, or `omp` session id.
2. Inspect available local evidence:
   - current terminal output with the app terminal tool when available;
   - `git status --short` and relevant touched files for code work;
   - saved reports, screenshots, logs, or output artifacts;
   - the current conversation/tool history visible in context.
3. Build a short diagnostic report with:
   - tool counts and repeated file reads;
   - failed commands, nonzero exits, and recovery actions;
   - wrong-target risks such as wrong thread, wrong terminal, stale input,
     browser/app mismatch, or side-panel confusion;
   - missing proof after claims of completion;
   - slow or high-token steps;
   - user correction loops and the decision that should have been made;
   - subagent launches, outputs, and handoff gaps;
   - the next concrete debugging action.

Never invent hidden transcript events. Mark unavailable evidence as `[gap]`.

## Bundle Analysis

`scripts/analyze_debug_bundle.py` accepts:

- an `omp` `/debug` `.tar.gz` report;
- an extracted report directory containing `session.jsonl`;
- a single `session.jsonl` file.

The script summarizes `system.json`, `config.json`, `env.json`, `session.jsonl`,
and `subagents/*.jsonl` when present. It redacts env values by default and only
lists secret-like key names. Do not paste raw env values or full session dumps
into chat unless the user explicitly asks and secrets have been reviewed.

Use the script output as evidence, then add human judgment. The heuristics can
flag likely repeated reads, failures, wrong-target language, correction loops,
slow steps, and proof gaps, but they cannot know intent without the user request
and surrounding transcript.

## Output Shape

Keep debug output concise unless the user asks for a full report:

```text
Debug target: current agent thread or omp report path
Evidence: files/reports/logs inspected
Findings:
- P1/P2 issue: observed behavior, evidence, impact
- P2 issue: ...
Next actions:
- concrete command/check/edit to run next
Limitations:
- unavailable live API, missing logs, or unverified claim
```

For code-review-style debugging, lead with findings and include file/line
references. For workflow debugging, lead with the behavioral failure and the
specific fix for the next run.

## Guardrails

- Do not modify other skills' files while using this skill unless the user
  explicitly asks for that skill to change.
- Treat `omp` report bundles as sensitive. Redact secrets, account ids, tokens,
  cookies, private prompts, and raw thinking text.
- Prefer low-impact report dumps before CPU profiling or heap snapshots.
- Do not claim this app has a live debug menu equivalent to `omp` unless an app
  or plugin exposes one in the current environment.
- Separate evidence from inference. Say when a finding is heuristic.
