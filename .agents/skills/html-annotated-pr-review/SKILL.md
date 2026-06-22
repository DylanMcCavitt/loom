---
name: html-annotated-pr-review
description: Create a self-contained html-effectiveness style annotated pull request review. Use when the user asks for a PR review, code review, diff walkthrough, review packet, review HTML, annotated diff, or wants a visual artifact for reviewing a pull request or git diff. Especially useful for GitHub PRs, Linear issue closeout, large diffs, UI PRs with evidence, and repo handoff review.
---

# HTML Annotated PR Review

Create a focused HTML review artifact that makes the PR easy to scan and act on. Mirror the html-effectiveness PR review pattern: ivory page, serif headings, white bordered cards, mono chips, dark diff panes, and review bubbles.

## Workflow

1. Resolve the review target:
   - Prefer the PR URL/number if given.
   - Otherwise use the supplied git diff range.
   - If neither exists, inspect local branches and ask only if the target is ambiguous.
2. Gather source context:
   - PR title/body, author, branch, base, merge state.
   - Diff stat and changed files.
   - Relevant issue text, repo `AGENTS.md`, handoff, architecture, decisions, tests.
   - CI/check status and evidence screenshots when available.
3. Review the diff before writing HTML.
   - Identify files needing attention, worth a look, and safe.
   - Extract real diff hunks for the artifact. Do not substitute prose for code.
   - Lead with correctness, regression, data-loss, security, accessibility, and missing-test risks.
4. Build one self-contained HTML file.
   - Default output: `output/html-artifacts/<repo-or-topic>-pr-review.html` in the current non-target workspace, or `/tmp/html-artifacts/` if writing inside the target repo would be misleading.
   - Do not commit the artifact unless the user explicitly asks.
5. Verify the artifact.
   - Check it starts with `<!doctype html>`, has viewport metadata, and has no broken local references.
   - Use headless Chrome screenshots for desktop and mobile when available.
   - Fix horizontal overflow and text overlap before calling it done.

## Required HTML Sections

- PR header card: repo, PR number, title, author, branch, add/delete/file counts.
- What this PR does: 3-5 bullets grounded in the PR body and diff.
- Diff command: exact command or URL used to reproduce the reviewed diff.
- Risk map: file chips with `safe`, `medium`, or `attention` classes.
- Files: cards for important changed files.
  - Include selected real diff hunks in dark panes.
  - Add review bubbles anchored to line numbers or hunk labels.
  - Collapse lower-risk files with `details`.
- Checks consulted: CI, local checks, screenshots, tests, skipped checks.
- Copyable review note: findings first, severity labels, line references, short closeout.

## Visual Contract

Read `references/visual-grammar.md` before writing the final HTML. Use `assets/template.html` as the structural starting point when helpful.

Keep the artifact tool-like:
- No landing-page hero.
- No gradients, blobs, decorative dashboards, or marketing copy.
- No giant screenshots unless evidence review requires them.
- Use code/diff panes for actual code, not screenshots of code.
- Include copy/export controls only when they help the workflow.

## Review Rules

- Findings must be actionable and line-specific.
- If there are no findings, say so clearly in the review note and call out residual risk or test gaps.
- Do not over-list low-value style concerns.
- Preserve the user's repo workflow: issue, branch, PR, checks, handoff, canonical main sync where relevant.
- If a PR is already merged, review the merge/head range and state that it is a post-merge review.
