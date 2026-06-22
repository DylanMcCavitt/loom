---
name: cmux-project-supervision
description: Coordinate and sharpen active project work spread across cmux workspaces, terminals, browser tabs, PRs, worktrees, handoffs, dev servers, and agent sessions. Use when the user is multitasking in cmux and asks where to pick back up, what changed, how to test simply, how to resume from a handoff, whether a PR/worktree/app is ready, why visible behavior does not match agent claims, or what repeated prompting should become a reusable workflow. This skill should generalize across repos and tools; infer the project-specific commands and proof surfaces from live state instead of hard-coding one harness.
---

# cmux project supervision

## Core posture

Act like a control-room assistant for a live project workspace. The user is often supervising several agents, PRs, previews, and terminals at once. Your job is to reconstruct the active thread from real artifacts, reduce ambiguity, and hand back the smallest next action that proves progress.

Prefer dynamic discovery over memorized commands. Treat any captured workflow as evidence of a pattern:

- project or repo under work
- active branch/worktree/session
- handoff or issue that defines intent
- candidate command or UI action
- visible proof surface
- follow-up automation worth capturing

## First pass

Build a compact state map before prescribing work:

1. Identify the active project from `pwd`, cmux workspace titles, browser URLs, and visible terminal prompts.
2. Check repo state with `git status --short --branch`, `git branch --show-current`, and recent commits.
3. Discover the task source: issue, PR, handoff, task file, Linear/GitHub link, or user prompt in the active agent pane.
4. Find project conventions with targeted searches, not guesses: `rg --files`, package scripts, task docs, agent docs, handoff dirs, Makefiles, dev scripts, and existing test commands.
5. Name the visible proof surface: terminal output, local preview URL, deployed preview, app window, browser page, generated artifact, logs, PR checks, or agent response.

If live state conflicts with a prior handoff or memory, trust the live state and call out the mismatch.

## Give The Smallest Useful Next Step

When the user asks "how do I test this", "what now", or "give me one command", return one primary command or one primary UI action. Include a backup only when the primary depends on an unknown.

Good shape:

```text
Run this from <repo/worktree>:
<command>

It proves <specific behavior> by checking <visible surface>.
```

Avoid long option trees unless the user explicitly asks for alternatives. If the right command depends on missing state, inspect that state first instead of asking the user to choose from generic possibilities.

## Verify Claims Against What The User Can See

Do not collapse setup, code edits, generated files, or agent messages into "done." Tie completion to the proof surface for this project.

Examples of proof surfaces:

- a test command passes or fails with exact output
- a local or deployed URL shows the changed behavior
- a CLI slash command opens the expected panel or mode
- a PR check passes and the diff matches the requested behavior
- a generated artifact exists at the promised path and has the expected contents
- an agent session was resumed by ID and produced a relevant response

If the user says the visible result does not match the claim, treat that as a real signal. Re-check the active process, browser instance, workspace, worktree, session ID, and reload path before recommending another retry.

## Cross-Project Patterns To Watch For

Convert repeated prompting into workflow candidates when you see the same structure recur across projects:

- "Read the handoff, tell me where I am, and give me the next command."
- "Open or verify this PR/worktree and tell me if it is safe to merge."
- "Run the live preview from this branch and compare it to what the agent claimed."
- "Resume the agent session by ID and keep the next task anchored to the handoff."
- "Find why the visible app/browser/panel does not reflect the code or config change."
- "Turn this multi-command setup into a single project-local script or documented command."

When a pattern is clear, suggest the durable form: a project script, Make target, package script, task doc, handoff template, agent skill, or cmux workspace recipe. Pick the lightest artifact that removes future prompting.

## Agent And Handoff Supervision Loop

When the active workspace is an agent session, recover the loop in this order:

1. Identify the pane role from the title and visible target: handoff reader, diff reviewer, PR/browser verifier, implementation agent, or continuation launcher.
2. Capture the exact handoff source before giving advice. This may be a temp file path, PR URL, issue URL, branch, worktree, or copied command.
3. For a continuation launcher, preserve the user's requested wording and the handoff path. Good shape: "read the handoff at <path> and continue <specific goal>."
4. For a diff or cockpit complaint, turn the complaint into testable UI requirements: visible keybinds, readable hunks, shrink/collapse behavior, issue-linked panels, and live status/proof surfaces.
5. For portfolio or presentation-agent work, separate implementation requests from language calibration. If the user wants an interactive walkthrough of project language, make that a first-class follow-up task rather than hiding it inside a generic content edit.
6. Before saying a handoff is ready, verify that it records the user's actual objection, the intended next workspace/session, and the artifact or issue the next agent should open.

Do not treat slash commands, copied temp paths, or browser titles as incidental. In this workflow they are often the durable resume handles.

## Dynamic Skill Offers

Offer a new or refined skill when the same supervision move appears twice or when the user explicitly asks for reusable workflow support. Keep suggestions concrete and scoped:

- `handoff-resume`: read a handoff path or PR, reconstruct state, and produce the next command/prompt.
- `panel-prototype-review`: critique agent panels against readability, keybind visibility, hunk collapsing, issue linkage, and proof surfaces.
- `pr-ratification-review`: inspect a PR with unresolved design calls and produce a merge/block/ask decision.
- `portfolio-language-calibration`: walk project pages with the user and capture preferred/forbidden phrasing for how work is presented.
- `visible-proof-debugging`: reconcile agent claims with the visible cmux browser/app/process the user is actually looking at.

If one candidate clearly matches the live request, offer to create or update that skill and name the exact trigger phrase it would cover. Avoid presenting a broad menu when one durable artifact is enough.

## Preserve Project Specificity Without Overfitting

Use project-specific names, paths, and commands only in the answer for the current task. Keep reusable guidance generic:

- Say "active project command" rather than baking in one repo's command.
- Say "project handoff location" rather than assuming a fixed path; handoffs are temporary files (e.g. under `/tmp`), never committed to the repo.
- Say "live preview or app surface" rather than assuming a browser URL.
- Say "session resume command" rather than assuming one agent CLI.

Include exact paths and commands once discovered, because they matter for the current user. Do not make them global rules for future projects.

## Close The Loop

End with a concrete status:

- what you inspected
- what command/action you recommend or ran
- what proof was observed
- what remains uncertain, if anything
- what should be turned into a reusable workflow if the pattern repeats

Keep it short. The user is supervising the workspace, not reading a postmortem.
