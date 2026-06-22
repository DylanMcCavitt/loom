---
name: html-module-map
description: Create a self-contained html-effectiveness style module map for understanding code. Use when the user asks how a repo/module works, where to start reading, what files matter, for a codebase walkthrough, architecture map, onboarding map, call graph, dependency map, or visual HTML explanation of unfamiliar code.
---

# HTML Module Map

Create a navigable HTML artifact that explains a repo area spatially. Mirror the html-effectiveness module-map use case: boxes and arrows, hot path highlighted, key files, boundaries, invariants, read order, and what to ignore on a first pass.

## Workflow

1. Identify the module/scope.
2. Read manifests, docs, entry points, and tests before mapping internals.
3. Trace the main user/data/control flow.
4. Separate:
   - entry points
   - domain model
   - state/persistence
   - UI/API boundary
   - adapters/integrations
   - tests/evidence
5. Build one self-contained HTML file outside the target repo unless asked otherwise.
6. Verify desktop/mobile rendering.

## Required HTML Sections

- Header: repo, module, purpose.
- First-read order: the 5-8 files to read first.
- Module diagram: boxes/arrows with hot path highlighted.
- File map: file, role, why it matters, risk/change frequency.
- Main flow: numbered steps from entry to output.
- Boundaries and invariants: what this module owns and must not own.
- Extension points: where future work should plug in.
- First-pass ignore list: low-signal files or generated/vendor surfaces.
- Copyable orientation prompt for a next thread.

## Visual Contract

Read `references/visual-grammar.md`. Use `assets/template.html` as a starting point.

Keep the map practical:
- Use diagrams and tables, not a long essay.
- Link local files with absolute paths when possible.
- Distinguish facts from inference.
- Do not over-map unrelated modules.

## Code Reading Rules

- Trust code/tests over stale docs.
- Use `rg` and targeted file reads.
- Do not modify code for a map unless the user explicitly asks.
- If a module is changing quickly, say what was verified live.
