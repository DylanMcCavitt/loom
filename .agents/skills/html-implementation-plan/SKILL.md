---
name: html-implementation-plan
description: Create a self-contained html-effectiveness style implementation plan. Use when the user asks for issue planning, implementation planning, an approach plan, a handoff plan, next-thread prompt, migration/refactor plan, feature plan, or wants a visual HTML artifact before coding. Best for risky, multi-step, direction-sensitive, or cross-module work.
---

# HTML Implementation Plan

Create a planning artifact that can be handed to the next coding thread. Mirror the html-effectiveness implementation-plan pattern: prompt box, summary strip, milestone timeline, diagrams, mock states, code contracts, risk table, and copyable next-thread prompt.

## Workflow

1. Gather the real sources:
   - Handoff doc first when resuming work.
   - Active plan doc if one exists.
   - Linear/GitHub issue text and acceptance criteria.
   - `AGENTS.md`, architecture docs, decisions, relevant code and tests.
2. Identify the work boundary.
   - What is in scope.
   - What is explicitly out of scope.
   - Which existing code paths are authoritative.
   - Which prior direction changes or design contracts matter.
3. Choose the plan shape:
   - Use milestones for sequential implementation.
   - Use approach comparison when there are multiple viable paths.
   - Use data-flow diagrams for service/model/state changes.
   - Use mock states for UI or product behavior.
4. Build one self-contained HTML file.
   - Default output: `output/html-artifacts/<issue-or-topic>-implementation-plan.html` outside the target repo when possible.
   - Do not commit it unless explicitly requested.
5. Verify the artifact with static checks and desktop/mobile screenshots when available.

## Required HTML Sections

- Page heading with project/context.
- Prompt box: the exact planning question or issue request.
- Summary strip: 4-6 compact facts such as next issue, effort, surfaces touched, feature flag, validation.
- Milestones: timeline with reviewable slices, owners/files/tags, and sequencing.
- Data flow or architecture diagram when the task touches state, persistence, API, or cross-module behavior.
- Mock states when the task has UI states.
- Key code/contracts: short pseudocode or interface sketches for the riskiest parts.
- Risk table: risk, why it matters, validation.
- Validation plan: tests, builds, screenshots, manual flows.
- Copyable next-thread prompt when the user is likely to continue in another thread.

## Visual Contract

Read `references/visual-grammar.md`. Use `assets/template.html` as a starting point.

Keep it useful:
- Do not turn planning into a marketing page.
- Do not hide hard decisions in vague prose.
- Prefer diagrams, matrices, and timelines over long paragraphs.
- Keep text dense but readable.
- Include copy buttons only for prompts or commands users will reuse.

## Project Workflow Rules

- Respect repo docs over chat memory when they conflict.
- If `AGENTS.md` defines resume/truth order, follow it.
- If the user mentions a Linear issue, make the plan issue-specific.
- If the plan is meant for coding, end with the exact next implementation step and checks.
