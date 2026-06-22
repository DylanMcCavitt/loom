---
name: html-ticket-triage-board
description: Create a self-contained html-effectiveness style interactive ticket triage board. Use when the user asks to triage issues, sort Linear/GitHub tickets, choose next work, prioritize backlog, plan a cycle, split Now/Next/Later/Cut, or wants a draggable HTML editor that exports the ordering as Markdown.
---

# HTML Ticket Triage Board

Create a small custom editor for prioritizing issues. Mirror the html-effectiveness triage-board pattern: sticky toolbar, counts, draggable columns, compact issue cards, tag filters, reset, and copy/export as Markdown.

## Workflow

1. Gather tickets:
   - Use supplied issue list when provided.
   - If the user asks for live Linear/GitHub state and tools are available, fetch current issues/PRs.
   - Preserve exact issue keys, titles, statuses, owners, priorities, and blockers.
2. Normalize each ticket:
   - key
   - title
   - kind/tag
   - size/effort
   - owner/agent if known
   - status
   - dependencies/blockers
   - why it belongs in its starting column
3. Choose columns:
   - Default: Now, Next, Later, Cut.
   - For repo work, use columns that match the user's active workflow if more useful.
4. Build one self-contained HTML file.
   - Include drag/drop interactions.
   - Include tag filter chips.
   - Include reset.
   - Include copy/export as Markdown.
5. Verify the artifact in desktop/mobile screenshots and test copy/export behavior when possible.

## Required HTML Sections

- Header: project/cycle, source, triage objective.
- Hint line explaining drag/filter/export.
- Sticky toolbar: counts, active filter, reset, copy/export.
- Board columns with counts.
- Issue cards with compact metadata.
- Column estimate/point totals if effort is known.
- Export function producing Markdown grouped by current column.

## Visual Contract

Read `references/visual-grammar.md`. Use `assets/template.html` as a starting point.

Keep it an editor:
- The user should be able to manipulate the plan in the browser.
- Every interaction should support a real workflow.
- Do not make a passive report when the task is triage.

## Triage Rules

- Use live tracker state when requested; do not rely on stale issue order.
- Avoid dumping every issue into Now.
- Put blocked or speculative work in Later or Cut with a reason.
- Make the exported Markdown useful as a handoff or planning note.
