# Loom skill judge rubric

LLM-as-judge rubric scoring for `skills/<name>/SKILL.md` files — tier 2 of the
eval ladder. The judge model is a **grader only**: it never performs worker
(implementation) runs, its configuration is separate from any worker
configuration, and its scores never gate CI (worker != grader).

## Inputs the judge receives

- This rubric.
- The full `SKILL.md` under judgment.
- The skill's `evals/evals.json` when present, as **routing intent**: the
  prompts the skill is supposed to activate (or explicitly not activate) on.
  Judge the skill text against that intent, not against imagined use cases.

## Dimensions (score each 0-5, integers)

1. **conciseness** — Is every section pulling its weight for its length?
   - 0: bloated; most sections could be halved with no behavior loss.
   - 3: mostly tight; a few paragraphs restate the obvious.
   - 5: no filler; removing any sentence would lose real guidance.
2. **delta_over_base** — Does each section change behavior a competent agent
   wouldn't already show? Generic best practice ("write tests", "keep diffs
   small" with no operational teeth) scores low.
   - 0: nearly all content is what a strong agent does unprompted.
   - 3: clear behavioral deltas exist but are diluted by baseline advice.
   - 5: nearly every rule changes a concrete decision or output.
3. **agnosticism** — Is the skill free of vendor/harness coupling? Penalize
   hard-coded harness names, vendor-specific tool invocations, or paths that
   only exist in one runtime; naming a tracker or format the pack contract
   already owns is fine.
   - 0: unusable outside one harness/vendor.
   - 3: portable core with some incidental coupling.
   - 5: fully harness-neutral; any coupling is explicitly parameterized.
4. **actionability** — Can an agent execute the guidance directly? Prefer
   checkable rules, ordered steps, and concrete outputs over vibes.
   - 0: aspirational prose; nothing checkable.
   - 3: actionable core with vague edges.
   - 5: every rule is executable or verifiable as written.

## Trim candidates

List concrete trim candidates: sections or sentences that add nothing over
base agent behavior or duplicate other pack docs. Quote the exact `##`/`###`
heading for a whole section, or the exact sentence for a line-level trim.
An empty list is a valid answer for a tight skill.

## Output contract

Respond with **only** a JSON object, no prose around it:

```json
{
  "scores": {
    "conciseness": 0,
    "delta_over_base": 0,
    "agnosticism": 0,
    "actionability": 0
  },
  "trim_candidates": ["## Exact Section Heading", "Exact sentence to cut."],
  "notes": "One short paragraph of overall judgment."
}
```
