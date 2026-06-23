# Bus Map (report format)

Present the candidate tangles as a single self-contained HTML **bus map** so the
human can see the spaghetti and pick what to open. Write it to the OS temp dir
(resolve `$TMPDIR`, fall back to `/tmp` / `%TEMP%`) as
`<tmpdir>/bus-map-<timestamp>.html` so nothing lands in the repo, then open it
(`open` on macOS, `xdg-open` on Linux, `start` on Windows) and tell the user the
absolute path. The map is the *presentation*; the durable record is the ADR/doc.

Tailwind (CDN) for layout; Mermaid (CDN) for graph-shaped diagrams; hand-built
divs/SVG for editorial visuals. Mix them — don't lean on Mermaid for everything.
Every candidate gets a **before/after**: before = spaghetti (consumers wired
straight to each other, the material re-implemented per feature); after = a clean
lane on the bus with pull-offs.

## Scaffold

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Bus map — {{repo}}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script type="module">
      import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
      mermaid.initialize({ startOnLoad: true, theme: "neutral", securityLevel: "loose" });
    </script>
    <style>
      .lane { stroke-width: 6; }       /* a clean bus lane */
      .spaghetti { stroke: #dc2626; }  /* a parallel line that should tap the bus */
      .deep { background: linear-gradient(135deg, #0f172a, #1e293b); }
    </style>
  </head>
  <body class="bg-stone-50 text-slate-900 font-sans">
    <main class="max-w-5xl mx-auto px-6 py-12 space-y-12">
      <header>...</header>
      <section id="candidates" class="space-y-10">...</section>
      <section id="top-recommendation">...</section>
    </main>
  </body>
</html>
```

## Header

Repo name, date, and a compact legend: solid box = module, thick band = a lane on
the bus, red cross-wire = spaghetti, thick dark box = deep module. No intro
paragraph — straight into the candidates.

## Candidate card

One `<article>` per tangle. The diagram carries the weight; prose is sparse and
uses the [LANGUAGE.md](LANGUAGE.md) terms without ceremony.

- **Title** — names the restructure (e.g. "Pull Order pricing onto the bus").
- **Badges** — recommendation strength (`Strong` emerald / `Worth exploring` amber
  / `Speculative` slate) + dependency category (`in-process`,
  `local-substitutable`, `ports & adapters`, `mock`).
- **Files** — monospaced, `font-mono text-sm`.
- **Before / After** — the centrepiece, side by side. Before: spaghetti, red
  cross-wires. After: one clean lane, consumers tapping off it.
- **Problem** — one sentence. **Solution** — one sentence.
- **Wins** — bullets ≤6 words, in glossary terms: "leverage: one lane, N
  consumers", "locality: bugs concentrate in one module", "interface shrinks;
  implementation absorbs the copies".
- **ADR callout** (if it touches a standing ADR) — one amber-tinted line.

No paragraphs of explanation. If a diagram needs a paragraph to be understood,
redraw the diagram.

## Diagram patterns

Pick the pattern that fits; mix them; don't make every diagram look the same.

- **Mermaid flowchart** — the workhorse for "consumer → consumer →
  re-implemented material, look at the mess". `classDef` the spaghetti edges red,
  the lane thick, the deep module dark. Sequence diagrams suit "before: 6
  round-trips; after: 1".
- **Hand-built lanes** — horizontal lanes (`<div>` with a thick left border) for
  the bus, pull-off arrows (inline SVG `<line>`/`<path>`) to each consumer. Best
  for the "after", where you want one thick lane with greyed internals.
- **Cross-section** — stacked thin bands (before: many shallow layers each doing
  nothing) collapsing into one thick band (after: the consolidated lane).
- **Mass diagram** — two rectangles per module (interface vs implementation).
  Before: interface nearly as tall as implementation (shallow). After: short
  interface, tall implementation (deep).

Keep diagrams ~320px tall so before/after sits side by side without scrolling. Use
`text-xs uppercase tracking-wider` for module labels so they read as schematic.

## Vocabulary

Use exactly: module, interface, implementation, depth, deep, shallow, seam,
adapter, leverage, locality, lane. Never substitute component, service, unit (for
module), API, signature (for interface), or boundary (for seam). End with a **Top
recommendation** card: which lane to open first and why, with an anchor link to
its card.
