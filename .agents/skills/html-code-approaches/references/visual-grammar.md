# HTML Effectiveness Visual Grammar

Use this grammar for final artifacts unless the user explicitly asks for a different style.

## Palette

- Page: `#FAF9F5`
- Text: `#141413`
- Secondary text: `#87867F`
- Borders: `#D1CFC5`
- Muted panel: `#F0EEE6`
- White cards: `#FFFFFF`
- Clay accent: `#D97757`
- Olive accent: `#788C5D`
- Oat accent: `#E3DACC`
- Rust/delete: `#B04A3F`

## Typography

- Headings: `ui-serif, Georgia, "Times New Roman", serif`, weight 500.
- Body: system sans.
- Labels, chips, code, commands: `ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace`.
- Keep headings editorial but not hero-sized. Most artifact `h1` values should be 30-38px desktop and 22-31px mobile.

## Layout

- Use an ivory page with a centered max-width container.
- Use white cards with `1.5px solid #D1CFC5` and `12px` radius.
- Use compact sections with 40-64px vertical spacing.
- Use mono eyebrow labels and compact metadata chips.
- Use responsive grids that collapse to one column on mobile.
- Set `overflow-wrap: anywhere` for long titles, paths, branches, URLs, and issue keys.

## Patterns

- PR review: header card, prose bullets, risk chips, file cards, dark diff panes, review bubbles, collapsed details, copyable review note.
- Implementation plan: prompt box, summary strip, milestone timeline, diagram, mock states, code contracts, risk table, next-thread prompt.
- Code approaches: approach cards, comparison matrix, risk map, code sketches, recommendation.
- Module map: read-order list, diagram, file map, flow, boundaries, first-pass ignore list.
- Triage editor: sticky toolbar, counts, draggable cards, filters, reset, copy/export.

## Avoid

- Marketing-page heroes.
- Decorative gradient/orb backgrounds.
- Dashboard chrome unless the artifact is actually an editor.
- Long Markdown pasted into an HTML shell.
- Screenshots of code when a diff or code block would be clearer.
- Nonfunctional copy/export buttons.
