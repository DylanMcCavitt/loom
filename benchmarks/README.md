# Benchmarks

Benchmarks are opt-in behavior-eval rigs for roster agents. They are not part of
`npm run check` when they require model calls; only cheap deterministic helpers
and tests for those helpers belong in the normal check path.

## Adding a roster-agent benchmark

Give each benchmark a directory named for the roster agent or behavior under
measurement, for example `benchmarks/roboports/`. A benchmark directory should
contain:

- `SPEC.md` — the falsifiable claim, arms, metric, scoring rules, pass bar, and
  what evidence a behavior-changing PR must refresh.
- `README.md` — operator instructions for materializing/running the rig without
  model calls in CI.
- `tasks/` — fixed issue prompts or task definitions. Keep the set stable; add a
  new versioned task instead of silently changing an existing one.
- `template/` — the sandbox source used to create throwaway run repos.
- `checks/` — deterministic acceptance checks and mechanical scorers.

Expose deterministic, dependency-free entry points through `scripts/bench.mjs`
and `npm run bench`. The bench CLI may list scenarios, materialize sandboxes,
and score completed run directories. It must not call models, mutate live
trackers, close PRs, or become part of CI for model-in-the-loop arms.

## Current benchmarks

| Benchmark | Scenarios | Deterministic CLI |
| --- | ---: | --- |
| `roboports` | 6 | `npm run bench -- --list`, `--materialize <dir>`, `--score <runDir>` |

## Model-in-the-loop modes (opt-in, never CI)

Tiers 2–3 of the eval ladder live behind explicit flags on the same CLI. They
are **never** part of `npm run check`, the validators, or CI: with no judge
credentials configured, both modes print a skip notice and exit 0.

Configuration is env-var only (names below, never values; no secrets in
tracked files or generated output):

- `LOOM_JUDGE_API_KEY` — bearer token for an OpenAI-compatible
  chat-completions endpoint. Required for live judge calls.
- `LOOM_JUDGE_MODEL` — judge model name. Required when the API key is set.
- `LOOM_JUDGE_BASE_URL` — endpoint base URL (defaults to the OpenAI API).
- `LOOM_JUDGE_MOCK` — set to any non-empty value for a deterministic canned
  judge with no network calls (used by tests and offline dry runs); a value
  starting with `{` is parsed as the canned judge JSON itself.

Worker != grader: the `LOOM_JUDGE_*` variables configure the **grader** model
only. They are deliberately separate from any worker (implementer) agent
configuration, and nothing model-scored gates CI.

### Judge (`--judge`)

```sh
npm run bench -- --judge          # score all shipped skills
npm run bench -- --judge belt     # score one skill
```

Scores each `skills/<name>/SKILL.md` 0–5 on conciseness, delta-over-base,
agnosticism, and actionability per `benchmarks/judge/RUBRIC.md`, and asks the
judge for concrete trim candidates. The skill's `evals/evals.json` (when
present) is included in the judge context as routing intent. Output is a
timestamped scorecard pair `retro/judge-scorecard-<ISO>.{json,md}`; generated
scorecards are gitignored and must not be committed.

### Ablation (`--ablate`)

```sh
npm run bench -- --ablate <skill> [--dest <dir>] [--force]
```

Builds three skill variants — `full` (SKILL.md as shipped), `absent` (no
skill), `trimmed` (SKILL.md minus the latest judge scorecard's trim
candidates, or minus every section after the first when no judge output
covers the skill) — and materializes one roboports sandbox per variant under
`<dest>` (a temp dir by default; destinations inside the Loom repo are
refused). Variant SKILL.md files land under `<dest>/skill-variants/` for the
operator to activate in the worker harness; they are not part of the sandbox
repos.

Full arm execution needs a live worker model, which this CLI never drives; it
degrades gracefully by running the rig's deterministic checks and mechanical
scorer once per variant (recording the pre-arm baseline outcome) and writing
`<dest>/ablation-manifest.json` with per-variant sizes, baseline outcomes,
deltas vs `full`, and instructions for running and re-scoring the arms with
`npm run bench -- --score <workspace>`.
