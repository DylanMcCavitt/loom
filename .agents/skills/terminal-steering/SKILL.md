---
name: terminal-steering
description: Open or use a terminal to start an omp (Oh My Pi) session and speak with Claude through that session. Use when the user says things like "use this skill to speak with Claude in omp", "ask Claude in omp", "open a terminal and run omp", "talk to Claude through Oh My Pi", or similar casual/typo-filled phrasing. This is an action skill: launch/control omp and relay Claude's response, not a written explanation of how the user could do it.
---

# Terminal Steering

## Purpose

Use `omp` as the active surface for talking with Claude from a terminal. When
this skill triggers, do the `omp` interaction rather than only describing the
steps.

The recorded workflow showed:

1. In the app, press `Command-T`.
2. A terminal tab opens with a focused text field labeled `Terminal input`.
3. Type `omp` and press `Return`.
4. The tab title changes from `omp` to a pi-prefixed `omp` session title such as
   `pi: new-chat-2`.
5. Type the prompt into `Terminal input` and submit it.

Use those UI labels as stable targets. Do not rely on screen coordinates.

## When The User Gives A Prompt

1. Identify the message to send to Claude in `omp`. Use the user's latest request
   unless they explicitly provide different text.
2. Launch or reuse an `omp` session in the terminal attached to the current
   workspace. Do not `cd` elsewhere unless the user names a target directory.
3. Send the prompt to `omp`.
4. Wait for Claude/`omp` to respond. Read enough output to know whether the
   response completed, errored, or needs follow-up.
5. Relay the result back to the user. Include the important answer, any command
   or model error, and whether the `omp` session is still open.

## Preferred Tool Flow

When shell tools are available, use an interactive terminal session:

```text
Run: omp
Submit: <user prompt>
Read: omp response
Optional: /quit
```

- Start `omp` with a TTY when the tool supports it.
- Use the returned session id for follow-up input.
- If `omp` is already open and attached to the correct workspace, reuse it.
- For a one-off request, close `omp` with `/quit` after capturing the answer.
- For an explicit live steering request, keep `omp` open and say which session is
  active.

If the only available path is the app UI, replay the recorded UI flow:

1. Focus the app and press `Command-T`.
2. Confirm a terminal tab with `Terminal input` exists.
3. Type `omp`, press `Return`, and wait for the `omp` session title/prompt.
4. Type the prompt, press `Return`, then read and relay the response.

## Guardrails

- Do not start raw `claude` unless the user specifically asks for Claude Code;
  this skill is for `omp`.
- Do not invent `omp` flags for model selection. If the user asks for a specific
  Claude model, inspect the current `omp` model selector/config or ask a short
  clarifying question if it cannot be discovered.
- Do not type into the app chat composer by mistake. The target is
  `Terminal input`.
- Do not hard-code the recorded thread name, project, or prompt text.
- Do not include secrets, private prompt contents, or account details in a
  generated summary beyond what is necessary to answer the user.

## Failure Handling

If `omp` fails to start:

1. Report the exact failure line.
2. Check whether `omp` is on `PATH`.
3. Inspect the current working directory and shell only as needed.
4. Do not fall back to a normal direct answer while implying Claude-in-`omp` was
   consulted.

## Completion Format

Keep the close-out short:

```text
I sent this through omp: <brief prompt summary>
Claude/omp said: <answer or key result>
Session: <closed | still open | failed with reason>
```
