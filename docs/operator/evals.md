# Loom eval playbook

Use this runbook to run evals on the pack’s existing three-tier ladder. The pack
is harness-agnostic and does **not** drive worker agents in-repo. Effective
evals mean using the ladder as designed, not bolting on a second harness.

Related: [`loop.md`](loop.md) (Plan → Act → Verify → Record → Stop),
[`benchmarks/README.md`](../../benchmarks/README.md) (bench CLI),
[`docs/skills/factorio-kit.md`](../skills/factorio-kit.md) (five harness layers).

## Ladder at a glance

| Layer | What it measures | Command | CI? |
| --- | --- | --- | --- |
| Lint + envelopes | Frontmatter, budgets, skill invariants | `npm run check` | Yes |
| Trigger corpora | Routing intent in `skills/*/evals/evals.json` | Validated in check; **not LLM-executed** | Schema only |
| Judge | Skill text quality vs `benchmarks/judge/RUBRIC.md` | `npm run bench -- --judge [skill]` | No |
| Doctrine | Workflow discipline on 6 fixed roboports tasks | materialize → **external worker** → `--score` | No |
| Ablation | Full / absent / trimmed uplift | `npm run bench -- --ablate <skill>` then re-score | No |

## Cadence

### 1. Every change (always)

```sh
npm run check
```

This is the always-on eval gate: validators, content-envelope tests, golden-path
mock bridge, and bench CLI smoke. Do not treat model scores as a substitute.

### 2. After skill text or routing changes (tier 2)

```sh
# dry run (no network)
LOOM_JUDGE_MOCK=1 npm run bench -- --judge

# live grader (env only; never commit keys)
export LOOM_JUDGE_API_KEY=...
export LOOM_JUDGE_MODEL=...
# optional: LOOM_JUDGE_BASE_URL=...
npm run bench -- --judge            # all skills
npm run bench -- --judge roboports  # one skill
```

Scorecards land in `retro/judge-scorecard-*.{json,md}` (gitignored). Use them as
trim candidates and regression notes; they do not gate CI. Each skill’s
`evals/evals.json` is fed to the judge as routing intent.

**Worker ≠ grader:** keep `LOOM_JUDGE_*` separate from whatever configures the
implementer agent. Prefer scoring `roboports`, `biters`, `lab`, and
`rocket-launch` first when starting live judge runs.

### 3. After roboports or delivery-doctrine changes (tier 3a)

The only fully wired behavior benchmark today is
[`benchmarks/roboports/`](../../benchmarks/roboports/).

```sh
npm run bench -- --list
npm run bench -- --materialize /tmp/roboports-run --force
# Install/activate the skill variant in your worker harness
# Run each tasks/0N-*.md as a fresh worker arm in that sandbox
npm run bench -- --score /tmp/roboports-run
```

Pass bar: [`benchmarks/roboports/SPEC.md`](../../benchmarks/roboports/SPEC.md).
`correct` (and intended `safe`) are hard gates; `loc` / `new_deps` / `scope`
are mechanical. Attach score JSON as PR evidence when skill behavior changes.

Start with **one** task end-to-end before scaling to all six.

### 4. When asking “does this skill help?” (tier 3b)

```sh
npm run bench -- --ablate roboports --dest /tmp/ablation --force
# Activate each variant under /tmp/ablation/skill-variants/ in the worker
# Run arms, then:
npm run bench -- --score /tmp/ablation/<variant-workspace>
```

Compare full vs absent vs trimmed via `ablation-manifest.json`. Use ablation for
uplift claims, not for every PR. `--ablate` requires the same judge enablement
as `--judge` (`LOOM_JUDGE_MOCK` or live `LOOM_JUDGE_*`); without it the CLI
prints a skip notice and exits 0.

### 5. Loop discipline while iterating

```sh
npm run loop
npm run guard:worktree
```

Verify owns `npm run check` plus the named proof (including bench/eval when that
is the evidence). Record durable scorecards under `retro/`; do not rely on chat
memory.

## What not to do

- Do not put live judge, ablation, or worker arms into CI — model-scored gates
  are forbidden by design.
- Do not expect `evals/evals.json` to be “run” today — they are authoring and
  coverage artifacts consumed by quality validation and the judge context.
- Do not ask the implementer (`roboports`) to grade itself; use `biters` /
  `lab` (or the judge) as separate graders.
- Do not invent a parallel bus-first benchmark directory — that methodology was
  absorbed into the `biters` `minimal-diff` lens; `roboports` is the live
  two-arm shape.

## Deferred gaps

These are intentional absences, not broken setup:

- No trigger-eval LLM runner for `skills/*/evals/evals.json`.
- No automated worker driver — arms are manual/external (`--ablate` prep only).
- `safe` / `discipline` scorers are specified in roboports `SPEC.md` but not
  fully implemented in `checks/score.mjs`.
- Content-envelope tests are missing for `belt`, `lab`, and `repair-pack` (CI
  still covers eval schema and golden-path presence).

Highest-leverage future addition: a `bench --triggers` mode that LLM-judges
each `evals.json` prompt against `expected_output` on the same `LOOM_JUDGE_*`
path — still opt-in, never CI.

## Success criteria

- Every PR: `npm run check` green.
- Skill-text PRs: fresh judge scorecard attached or linked (not committed).
- Doctrine / skill-behavior PRs: roboports `--score` JSON attached; ablation
  only when claiming uplift.
- No secrets or scorecards committed; worker and grader configs stay separate.
