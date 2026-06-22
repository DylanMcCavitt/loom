---
name: html-code-approaches
description: Create a self-contained html-effectiveness style comparison of code approaches. Use when the user asks how to implement something, wants options before coding, says the approach is unclear, asks for tradeoffs, wants to compare designs, or needs a visual HTML artifact for choosing between multiple implementation paths.
---

# HTML Code Approaches

Create an HTML comparison artifact for choosing an implementation path before edits begin. Mirror the html-effectiveness "Three code approaches" use case: side-by-side approach cards, tradeoff notes, affected files, risk map, validation, and a clear recommendation.

## Workflow

1. Read the problem and constraints.
2. Inspect relevant code and tests before inventing options.
3. Define 2-4 plausible approaches.
4. Score each approach on:
   - correctness risk
   - implementation effort
   - blast radius
   - testability
   - fit with existing patterns
   - rollback path
5. Recommend one path and explain why.
6. Build one self-contained HTML file outside the target repo unless asked otherwise.
7. Verify desktop/mobile rendering.

## Required HTML Sections

- Header: repo/project, problem, decision needed.
- Context box: constraints, acceptance criteria, non-goals.
- Approach cards: one card per path with sketch, files touched, pros, cons, risks.
- Comparison matrix: rows are criteria, columns are approaches.
- Code sketches: short snippets or pseudocode for each approach.
- Risk map: files/modules with attention levels.
- Validation plan: exact tests/checks/manual flows per approach.
- Recommendation: chosen approach, why, first implementation step.
- Copyable next prompt: optional, for launching the implementation thread.

## Visual Contract

Read `references/visual-grammar.md`. Use `assets/template.html` as a starting point.

This artifact should help the user choose. Avoid:
- pretending there is only one path when tradeoffs exist
- generic best-practice prose
- hiding the recommendation
- making cards decorative instead of comparative

## Decision Rules

- Prefer the repo's established patterns unless there is a clear reason to diverge.
- Prefer smaller blast radius when correctness is similar.
- Prefer approaches with focused verification.
- Make uncertainty explicit.
