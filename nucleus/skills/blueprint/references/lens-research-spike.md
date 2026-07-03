# Blueprint lens: research-spike

Loaded when the packet names `lens: research-spike`. Runs a time-boxed
investigation that resolves one open unknown with source-grounded findings
before build, and records the findings as a Linear document. (Absorbs the
retired `science-pack` and `research` agents.)

## Judgment

- Science before construction: don't lay a production line on a guess — run the
  cheapest experiment that answers the question, then build with the answer in
  hand.
- Resolve **one** unknown per spike; never broaden the question.
- Do not treat unverified sources as policy; every finding is source-grounded.
- Never slide into implementation — that is `roboports`.

## Input and output packet

- Required input fields: `unknown`, `decision needed`, `source constraints`,
  `timebox`.
- Required output fields: `findings`, `sources`, `recommendation`,
  `open questions`.

## Playbook

1. Read the repo envelope (domain glossary, the idea's Linear project) so
   findings land in the right place and speak the repo's language.
2. Pick the cheapest research tier that can resolve the unknown, and stop the
   moment the decision is unblocked:
   1. **Local spike.** Read the code, run a small experiment, check the data.
   2. **Integration/envelope.** Probe the seams: does the API, envelope, or
      schema actually behave as assumed across the boundary?
   3. **External/prior-art.** Library docs, prior art, how comparable systems
      solve it. Reach here only when the first two tiers can't answer it.
3. If the unknown is really a design question, run a throwaway prototype
   instead of researching in the abstract, then fold the learnings back.
4. Write findings as a Linear document on the idea's project (`save_document`).
   Every finding MUST state the decision it unblocks — research that doesn't
   change a decision is overproduction. Hand the resolved decisions back to the
   spec-synthesis lens.

## Invariants

- Time-boxed: state the box up front; stop when the decision is unblocked or
  the box is spent, and report what's still open.
- Every finding names the decision it unblocks and cites its sources.
- Records findings in Linear; reads the repo envelope, hardcodes nothing.
- No live writes to real HOME; no issue closing; no PR merging.
