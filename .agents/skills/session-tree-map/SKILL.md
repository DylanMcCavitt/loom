---
name: session-tree-map
description: Reconstruct, audit, and present the current agent run as a Session Tree - the conversation and tool-call graph of THIS session, not a repository or filesystem tree. Maps user turns, assistant responses, tool calls (read, bash, write, edit), files read or edited, commands run, visible artifacts and screenshots, decisions, blockers, and the current next action. Use when the user asks for a session tree, conversation tree, omp /tree, trace this thread, a tool-call tree, a clickable/jumpable session map, an agent workflow audit, unwanted tool calls, wrong-thread or wrong-terminal debugging, or what happened in this run. Default to quick text mode; only use HTML, omp /tree, or omp /debug report bundles when explicitly useful.
---

# Session Tree Map

## Overview

The `omp` `/tree` command opens the **Session Tree**: a graph of the *current
agent conversation* - user turns, assistant replies, tool calls, tool results,
summaries, and labels - keyed by entry `id`/`parentId`. It is a navigator over
**this session**, never a repository or filesystem tree.

This skill reconstructs that session graph for the current run and presents it
as a readable tree plus a short state summary (decisions, blockers, next
action). The target is the conversation, not the disk.

Default to a quick, low-overhead trace. Escalate only when needed:

- `quick` - current transcript only, 8-12 important nodes, text output.
- `full` - fuller reconstruction with files/commands/artifacts.
- `html` - clickable snapshot via `scripts/render_session_tree_html.py`.
- `live` - run `omp` `/tree` and transcribe/navigate the live `omp` session.
- `debug` - audit workflow quality and unwanted tool calls.

For a clickable/jumpable result, generate an HTML snapshot with
`scripts/render_session_tree_html.py`. Clicking nodes in that artifact jumps
inside the captured snapshot. It does not move the live transcript cursor;
only the `omp` `/tree` navigator can move the live `omp` session leaf.

If the user actually wants an on-disk repo/file map, this is the wrong skill -
handle that as a separate repo-orientation task. Do not enumerate project files
here.

## When To Use

- "Show me the session tree / conversation tree / tool-call tree."
- "Run `omp` `/tree`" or "port `/tree` behavior here."
- "Trace this thread" / "what happened in this run so far?"
- "Make this clickable / jumpable" or "give me a navigable session map."
- "Debug this thread/workflow" / "why did the agent waste tools?" / "find
  unwanted tool calls or wrong-terminal mistakes."
- A subagent or teammate needs a compact trace of turns, tool calls, decisions,
  and the next action.

Skip it for repository-structure questions (`project-structure-map`) and for
single-file lookups where the file is already named.

## Two Sources Of Truth

Use the cheapest source that satisfies the request.

### A. An `omp` terminal is available

1. In the `omp` session, open the navigator: `/tree`, the `app.session.tree`
   keybinding, or double-escape on an empty editor.
2. Read the rendered rows. The active branch (root -> current leaf) is marked
   with a visible bullet; labels render as `[label]`; children are ordered
   oldest-first (newer lower).
3. Choose the smallest filter that answers the question (`Ctrl+O` to cycle, or
   `Alt+D/T/U/L/A` to jump):
   - `default` - conversational nodes; hides `label`, `custom`,
     `model_change`, `thinking_level_change`.
   - `no-tools` - `default` minus `toolResult` rows.
   - `user-only` - user messages only.
   - `labeled-only` - labeled landmarks.
   - `all` - full internal timeline, including bookkeeping entries.
4. Transcribe the visible rows and interpret each into the node shape below.
   Note: assistant messages that contain only tool calls are hidden in filtered
   views unless they errored/aborted or are the current leaf.
5. Transcription is read-only. Selecting a node in `/tree` repositions the
   session leaf (branches/re-runs) - do **not** select or navigate unless the
   user explicitly asks to move the leaf.

If the user asks to jump within `omp`, keep the terminal in `/tree` and use the
`omp` native selection/navigation. Do not replace that with a text block.

For `omp` workflow debugging, run `/debug`, choose `Report: dump session`, then
analyze the saved bundle:

```bash
python3 ~/.agents/skills/session-tree-map/scripts/analyze_session_jsonl.py \
  ~/.omp/reports/<report>.tar.gz
```

The report bundle usually contains `session.jsonl`, `system.json`, `env.json`,
`config.json`, and optional `subagents/*.jsonl`. Prefer this path when the user
asks about unwanted tool calls, wasted work, slow steps, or bad workflow shape.

### B. No `omp` terminal - rebuild from transcript history

Reconstruct the tree from the current conversation and tool history alone. Walk
the run in order and emit one node per event. Use exactly what is in the
transcript: never invent files, commands, results, artifacts, or outcomes that
were not observed. Flag anything uncertain as `[unverified]` and missing spans
as `[gap]`.

## Node Shape

Capture each entry as:

- `role/type` - user | assistant | tool-call | tool-result | summary | label
- `summary` - one line of what it said or did
- tool specifics:
  - `read` -> file(s) read (+ line ranges)
  - `bash` -> command run (+ pass/fail or exit code)
  - `write` / `edit` -> file(s) created or modified
  - artifacts -> screenshots, images, or files produced
- `decision` / `blocker` - when the node resolves or blocks a choice

## Output

Render quick text by default. Render richer outputs only when requested.

1. **Tree** - indented parent -> child, active path marked with `*`, labels as
   `[label]`. When transcribing `omp` output, render the `omp` active bullet as `*`:

```text
user: "<turn-1 ask>"
+-- assistant: plan
    |-- * tool read: src/app.ts:1-80
    |-- * tool bash: `npm test` (fail)
    `-- * assistant: fix + re-run (pass)   [milestone]
```

2. **State summary** - 4-6 lines:
   - Files read / edited
   - Commands run (+ results)
   - Artifacts / screenshots produced
   - Decisions made
   - Open blockers
   - **Current next action**

For `quick` mode, stop here. Keep the answer under about 20 lines unless the
user asks for more.

3. **Optional clickable snapshot** - when the user asks for a clickable,
   jumpable, or navigable map, create a compact JSON snapshot and render it:

```bash
python3 ~/.agents/skills/session-tree-map/scripts/render_session_tree_html.py \
  /path/to/session-tree.json \
  --output /path/to/session-tree.html
```

Use this JSON shape:

```json
{
  "title": "Session Tree",
  "summary": ["current next action: ..."],
  "nodes": [
    {
      "id": "n1",
      "parent": "",
      "type": "user",
      "label": "asked for a clickable session tree",
      "summary": "One-line observed event.",
      "active": true,
      "files": [],
      "commands": [],
      "artifacts": [],
      "details": []
    }
  ]
}
```

Return the generated HTML path/link. Be explicit that links jump within the
snapshot artifact, not to the exact live transcript message.

4. **Optional debug audit** - when the user asks to debug workflow quality,
   include:

   - Tool counts and repeated reads.
   - Failed commands or tool results.
   - Wrong-target risks: wrong thread, wrong terminal, prompt sent to chat,
     stale terminal input, browser/app mismatch.
   - Proof gaps: claims without validation, file check, screenshot, or visible
     runtime proof.
   - User correction loops: places where the user corrected scope or target.
   - Slow/high-token steps.
   - One concrete workflow fix for the next run.

## Rules

- The Session Tree is the conversation/tool-call graph of THIS run - never a
  repo or filesystem tree.
- Never fabricate events. Only nodes backed by a real turn or tool call appear;
  mark uncertainty `[unverified]` and gaps `[gap]`.
- Prefer `quick` mode unless the user asks for full, clickable, live, or
  debug output. Avoid running `omp`, reading scripts, or rendering HTML for a
  simple trace request.
- Read-only by default: transcribing `/tree` must not branch or move the live
  session leaf unless the user explicitly asks.
- Do not claim this app can click-jump to an exact live transcript turn unless
  an app API or plugin for transcript anchors is available. Offer `omp` `/tree`
  live navigation or an HTML snapshot instead.
- Use the smallest filter that answers the question; expand to `all` only when
  bookkeeping entries matter.
- Keep it tight - tree plus short summary, not a full transcript dump.
