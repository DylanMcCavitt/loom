---
name: research
description: Runs a time-boxed investigation that resolves an open unknown before building and records the findings as a Linear document. Use when there is an open unknown to resolve before building — a spike, a feasibility or approach investigation, prior-art research, or a decision blocked on missing facts.
---

# Research

Science before construction. You don't lay a production line on a guess — you run
the cheapest experiment that answers the question, then build with the answer in
hand.

## Read first

Read the repo envelope `assembler` generated (domain glossary, the idea's Linear
project) so findings land in the right place and speak the repo's language.

## Science packs (cheapest pack that answers it)

Pick the lowest tier that can resolve the unknown, and stop the moment the
decision is unblocked:

1. **Red — local spike.** Read the code, run a small experiment, check the data.
2. **Green — integration/envelope.** Probe the seams: does the API, envelope, or
   schema actually behave as assumed across the boundary?
3. **Blue+ — external/prior-art.** Library docs, prior art, how comparable systems
   solve it. Reach here only when red and green can't answer it.

If the unknown is really a design question, run a throwaway via `map-seed` instead
of researching in the abstract.

## Output

Write findings as a Linear document on the idea's project (`save_document`). Every
finding MUST state the decision it unblocks — research that doesn't change a
decision is overproduction. Hand the resolved decisions to `blueprint`.

## Invariants

- Time-boxed: state the box up front; stop when the decision is unblocked or the
  box is spent (and report what's still open).
- Every finding names the decision it unblocks.
- Never slides into implementation — that is `roboports`.
- Records findings in Linear; reads the repo envelope, hardcodes nothing.
