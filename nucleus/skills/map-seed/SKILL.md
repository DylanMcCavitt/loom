---
name: map-seed
description: Plans around fixed constraints, runs a fast throwaway prototype, retros what worked versus what didn't, then restarts carrying the learnings instead of polishing a doomed first run. Use when the user wants to prototype or de-risk a design before committing, work out the kinks under fixed or awkward constraints, or run a quick throwaway then iterate.
---

# Map Seed

In Factorio you don't always roll a good starting map. You don't fight the
terrain you were dealt — you **plan around** the cliffs and the thin ore patches,
run a fast game to learn the layout, and if the seed turns out doomed you
**reroll** and start fresh carrying what you learned, rather than grinding a base
that can never scale.

A map-seed run is **throwaway code that answers a design question under
constraints you can't change**. The answer is the only keepsake; the run itself
gets deleted. The point is to de-risk a design *before* committing — not to ship
the prototype.

## The loop

1. **Read the terrain — plan around fixed constraints** you can't change.
2. **Run a throwaway prototype** — pick a branch and build the smallest thing
   that exposes the answer.
3. **Retro the run** — what worked, what didn't, what to keep.
4. **Reroll the seed — restart fresh carrying the learnings** when the first run
   was doomed; don't polish it.
5. **Fold the findings into `blueprint`** — never ship the prototype to
   production directly.

## 1. Read the terrain — plan around fixed constraints

Before building, name the constraints you are *stuck with* and cannot change in
this run: a legacy or third-party API you must call, a fixed schema, a hard
deadline, a platform limit, a data shape you don't own. Write them down in one
line at the top of the prototype.

You plan **around** these, not against them. A constrained map is still worth
prototyping: mock or stub the awkward piece (an in-memory fake of the legacy API,
a hardcoded sample of the data you can't fetch yet) so the run can still answer
its question. The constraint is the terrain; the question is "given this terrain,
does the design hold?"

## 2. Run a throwaway prototype — pick a branch

Identify which question is being answered — from the prompt, the surrounding
code, or by asking if the user is around. The branches produce very different
artifacts; getting this wrong wastes the whole run.

- **"Does this logic / state model feel right?"** → [LOGIC.md](LOGIC.md). A tiny
  interactive terminal app that pushes the state machine through cases that are
  hard to reason about on paper.
- **"What should this look like?"** → [UI.md](UI.md). Several radically different
  UI variations on a single route, switchable from a floating bottom bar.

If genuinely ambiguous and the user isn't reachable, default to whichever branch
matches the surrounding code (backend module → logic; page/component → UI) and
state the assumption at the top of the prototype.

## 3. Retro the run

When the run has driven the question hard, stop and retro it — this is the step
that makes rerolling cheap instead of wasteful:

- **What worked** — the parts of the design that held up under real cases.
- **What didn't** — where it "shouldn't be possible but is", where a constraint
  bit harder than expected, where the model felt wrong.
- **What to keep** — the validated decisions worth carrying forward. The *answer*
  to the question is the only thing worth keeping; the throwaway code is not.

## 4. Reroll the seed — restart with the learnings

If the retro shows the first run was built on a doomed footing, **do not polish
it**. Reroll: throw the run away and start a fresh, minimal one that bakes in
what the last run taught you. A few cheap throwaway runs beat one expensive run
you keep patching. Loop steps 1–3 until a run answers the question cleanly. Stop
as soon as the design holds — the loop is for learning, not for building.

## 5. Fold the findings into `blueprint`

The validated decisions fold back into `blueprint` (the spec) as
**decision-encoding notes** — short rationale for *why* the design landed where
it did, plus the constraints it had to plan around. A map-seed prototype
**never ships to production directly**: it was written under throwaway
constraints (no tests, minimal error handling, mocked constraints), so its
verdict graduates into the spec, and the code is deleted.

## Rules that apply to every run

1. **Throwaway from day one, clearly marked.** Locate it next to what it prototypes for, named so a casual reader sees it's a prototype; obey existing routing/task conventions, don't invent new structure.
2. **One command to run.** Whatever the project's task runner supports — the user starts it without thinking.
3. **No persistence by default.** State lives in memory; if the question *is* persistence, use a scratch store named "PROTOTYPE — wipe me".
4. **Skip the polish.** No tests, no error handling beyond what makes it runnable, no abstractions. Learn fast, then delete.
5. **Surface the state.** After every action (logic) or variant switch (UI), render the full relevant state so the user sees what changed.
6. **Delete or absorb when done.** Either delete the run or fold the validated decision into the real code; never leave it rotting in the repo.

## Routes elsewhere

- Writing the final PRD/spec → `blueprint` (map-seed only *feeds* it findings).
