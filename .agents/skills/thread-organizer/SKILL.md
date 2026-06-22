---
name: thread-organizer
description: Organize desktop chats/threads by inspecting a selected or current thread for issue-linked artifacts, extracting the issue number from the artifact/link evidence, and renaming the thread to `issue-#NUMBER`. Use when the user asks to organize threads, click through thread chats, rename chats by issue number, or clean up sidebar thread titles from artifact-linked issues without relying on repo names, branch names, or fixed naming conventions.
---

# Thread Organizer

## Overview

Rename threads from evidence inside the thread, especially issue links exposed by artifacts, outputs, sources, or issue chips/buttons. Treat repository names, branch names, prior examples, and sidebar title patterns as context only; the issue number must come from the selected thread's artifact or linked issue evidence. Use the canonical title format `issue-#NUMBER`, such as `issue-#40`.

## Workflow

1. Identify the target thread.
   - If the user names a thread, locate that visible sidebar row or use an available thread-management tool to read it.
   - If the user says "this thread" or has clicked a thread, operate on the active/current thread.
   - For batch cleanup, repeat this workflow one thread at a time and keep a short record of renamed, skipped, and ambiguous threads.

2. Inspect issue evidence from artifacts first.
   - Check the thread's visible artifact/output/source panel, artifact buttons, linked issue chips, attached output cards, and main conversation messages that refer to artifacts.
   - Prefer explicit issue links or artifact labels over inferred text.
   - If a tool can read thread metadata or artifacts directly, use it before UI automation. If not, use the desktop UI: select the thread row, inspect the visible artifact/source/output area, and open artifact or issue controls only as needed to read the identifier.

3. Extract the issue identifier.
   - GitHub issue URL such as `/issues/40`: extract `40` and use final thread title `issue-#40`.
   - Display text such as `issue-40`, `Issue 40`, or `#40`: normalize to `issue-#40`.
   - Linear/Jira-style keys such as `ABC-123`: normalize to `issue-ABC-123`.
   - If multiple issue identifiers appear, choose the one tied to the primary artifact for that thread. If none is clearly primary, ask before renaming.

4. Rename the thread.
   - Prefer a native thread tool such as `set_thread_title` when available and when it can target the correct thread.
   - Otherwise use the desktop UI fallback: open the target thread row menu, choose `Rename chat`, replace the title with the normalized `issue-#NUMBER` title, and click `Save`.
   - Do not add brackets, repo prefixes, branch fragments, task names, or status words unless they are part of the identifier shown by the artifact evidence.

5. Verify and report.
   - Confirm the sidebar row or thread header now shows the new identifier.
   - Report the old title, new title, and evidence source in one concise line per thread.
   - For skipped threads, say whether the issue artifact was missing or ambiguous.

## Evidence Rules

- Required evidence: an issue identifier visible in or reachable from the selected thread's artifacts, outputs, sources, or linked artifact messages.
- Allowed fallback: use conversation text only if it contains a direct issue link or explicit issue artifact reference.
- Disallowed fallback: do not infer the issue from repository name, branch name, worktree path, previous recordings, sidebar title shape, or a naming convention from another repo.
- If no issue evidence exists, leave the title unchanged and ask whether the user wants a non-issue title.

## UI Fallback Notes

Use stable accessibility labels rather than coordinates. The observed rename path is: select the thread row, open its row actions or context menu, choose `Rename chat`, edit the text field, then `Save`.
