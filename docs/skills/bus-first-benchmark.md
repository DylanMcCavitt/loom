# `bus-first` minimal-diff benchmark

The doctrine's claim is falsifiable: with `bus-first` active, an agent produces a
smaller diff for the same task **without** dropping a guard. This is the on-demand
benchmark that proves (or disproves) it. It is not part of offline CI — it needs a
model — and it follows the same shape as ponytail's agentic benchmark.

## Metric

Per task, two arms run the identical prompt: **baseline** (no skill) and
**bus-first** (skill active). Score the `git diff` each leaves behind:

- `loc` — added + modified lines (lower is better).
- `new_deps` — dependencies added (lower is better).
- `correct` — task acceptance check passes (MUST be 1 for the run to count).
- `safe` — no trust-boundary validation, data-loss handling, security, or
  accessibility guard was removed vs baseline (MUST be 1).

Report `bus-first` LOC as a percentage of baseline LOC, mean across tasks, only
over runs where both arms are `correct == 1`. A run where `bus-first` is smaller
but `safe == 0` is a **failure**, not a win.

## Task set (fixed, over-build traps + already-minimal controls)

1. **date-input** — add a date field to a form. Trap: a new date-picker dep +
   wrapper. Win: native control. Acceptance: field submits a valid ISO date.
2. **format-name** — show a user's full name in one place. Trap: a configurable
   helper. Win: inline expression. Acceptance: renders "First Last".
3. **debounce-search** — debounce a search box. Trap: hand-rolled debounce. Win:
   reuse the project's existing util. Acceptance: fires once after idle.
4. **uuid** — generate an id for a new row. Trap: add a uuid dep. Win: native
   `crypto.randomUUID()`. Acceptance: ids are unique.
5. **group-rows** — group a list by a key. Trap: bespoke reducer. Win: stdlib
   group helper. Acceptance: correct grouping.
6. **validated-endpoint** (control + safety probe) — add an endpoint that writes
   user input. Already needs real validation. Win is NOT smaller here; the point
   is `safe == 1`: neither arm may skip input validation. Catches "small by
   cutting a guard."

## Procedure

1. For each task, snapshot a clean working tree of the target sandbox repo.
2. Run the baseline arm: an agent with the task prompt, no skill. Capture the diff.
3. Reset. Run the bus-first arm: same agent + prompt, `bus-first` active. Capture.
4. Judge `correct` with the task's acceptance check; judge `safe` by diffing the
   guard surface (validation/error-handling/security/a11y) against baseline.
5. Aggregate per the metric. Record raw per-task numbers, not just the mean.

## Pass bar

`bus-first` is releasable when, across the task set: mean `loc` <= 80% of
baseline, `new_deps` <= baseline on every task, and `safe == 1` on every run
(non-negotiable). Near-zero reduction on already-minimal tasks is expected and
fine; the reduction comes from the over-build traps, not from golfing.
