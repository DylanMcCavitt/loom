# Loom eval playbook

Use this runbook to run evals on the pack’s existing three-tier ladder. The pack
is harness-agnostic and does **not** drive worker agents in-repo. Effective
evals mean using the ladder as designed, not bolting on a second harness.

Related: [`loop.md`](loop.md) (Plan → Act → Verify → Record → Stop),
[`benchmarks/README.md`](../../benchmarks/README.md) (bench CLI),
[`docs/skills/factorio-kit.md`](../skills/factorio-kit.md) (five harness layers).

## Where to run

| Eval | Machine | Working directory |
| --- | --- | --- |
| `npm run check` | Laptop or cloud VM | **Loom repo root** (where `package.json` lives) |
| `npm run bench -- --judge` | Machine with judge CLI + auth | **Loom repo root** — reads `skills/`, writes `retro/judge-scorecard-*` |
| `npm run bench -- --ablate` | Same as judge | **Loom repo root** to launch; workspaces under `/tmp/...` |
| Roboports benchmark | Machine with worker agent | **Materialize outside repo** (`/tmp/roboports-run`); **score from repo root** |

**Start on a cloud VM** once `.cursor/environment.json` is committed and the
environment is snapshotted (see below). Until then, your laptop is fine for
judge runs.

## Cloud VM setup (persistent across threads)

Committed [`.cursor/environment.json`](../../.cursor/environment.json) tells
every cloud agent how to install eval CLIs on boot, and the committed
[`benchmarks/judge/judge.config.json`](../../benchmarks/judge/judge.config.json)
selects the judge backend (`defaultBackend`, currently `codex`) with **no
per-thread configuration**. Auth persists through **Cloud Agents Secrets**, so
every new thread is eval-ready without a snapshot; a snapshot is only an
optimization to skip the cold CLI install.

### One-time operator steps

1. **Merge** the branch with `.cursor/environment.json` and
   `benchmarks/judge/judge.config.json` (or cherry-pick those files).
2. Open [Cloud Agents → loom environment](https://cursor.com/dashboard/cloud-agents) and confirm the repo picks up `.cursor/environment.json` (it overrides personal defaults when present).
3. In **Secrets** for that environment, add the auth for the backend(s) you use:
   - `CURSOR_API_KEY` (from cursor.com/settings → API keys) — the `agent` CLI
     reads it natively; enables the `cursor` judge headlessly.
   - `CODEX_AUTH_JSON` — base64 of a working `~/.codex/auth.json` from a
     machine where `codex login` succeeded; the install script writes it to
     `~/.codex/auth.json` on every boot. Secret values are capped at 4096
     chars and the blob is usually longer, so split it into ordered chunks
     `CODEX_AUTH_JSON_1`, `CODEX_AUTH_JSON_2`, ... (up to `_8`):
     ```sh
     # macOS (Linux: base64 -w0 ~/.codex/auth.json instead of the first line)
     b64="$(base64 -i ~/.codex/auth.json | tr -d '\n')"
     echo "${b64:0:4000}"      # -> secret CODEX_AUTH_JSON_1
     echo "${b64:4000:4000}"   # -> secret CODEX_AUTH_JSON_2
     echo "${b64:8000:4000}"   # -> CODEX_AUTH_JSON_3 (only if non-empty)
     ```
     Gzip-compressed payloads (`gzip -c ~/.codex/auth.json | base64`) are
     also accepted and may fit fewer chunks.
   - Optionally `LOOM_JUDGE_BACKEND` = `cursor` or `codex` to override the
     committed default (`none` disables the judge entirely). No other keys.
4. Start a cloud agent on `main`. The `install` step runs
   `bash .cursor/install-eval-tools.sh && npm ci` and prints an
   **eval readiness** summary (CLI auth + active judge backend) in the boot log.
5. From the **loom repo root**, verify:
   ```sh
   bash .cursor/verify-eval-tools.sh
   npm run bench -- --judge roboports   # committed default backend, no env needed
   ```
6. Open `retro/judge-scorecard-*.md` in markdown preview.
7. Optional: **snapshot** the environment from the dashboard so future threads
   skip the cold CLI install. If you prefer subscription logins over secrets,
   run `agent login` / `codex login` once in the VM and snapshot — but secrets
   are the mechanism that survives with zero manual steps.

### Per-thread eval commands (cloud VM, repo root)

```sh
cd /workspace   # or your loom checkout — must be repo root

npm run check                                          # always
npm run bench -- --judge roboports                     # one skill first; committed default backend applies
npm run bench -- --judge                               # full pack when ready

npm run bench -- --materialize /tmp/roboports-run --force   # sandbox outside repo
# worker arm in /tmp/roboports-run using .bench/tasks/01-*.md
npm run bench -- --score /tmp/roboports-run                   # grade from repo root
```

Optional: `source .cursor/source-eval-judge.sh` exports the mapped
`LOOM_JUDGE_CMD`/`LOOM_JUDGE_MODEL` into your shell for manual use; bench does
not need it.

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
# default: committed backend from benchmarks/judge/judge.config.json — no env needed
npm run bench -- --judge

# dry run (no network; canned scores, not a real judgment)
LOOM_JUDGE_MOCK=1 npm run bench -- --judge

# live grader via API key (env only; never commit keys)
export LOOM_JUDGE_API_KEY=...
export LOOM_JUDGE_MODEL=...
# optional: LOOM_JUDGE_BASE_URL=...
npm run bench -- --judge            # all skills
npm run bench -- --judge roboports  # one skill

# live grader via a subscription CLI (no API key needed):
# OpenAI Codex plan — GPT-5.5 at xhigh reasoning, stdin prompt, read-only
LOOM_JUDGE_CMD='codex exec --ephemeral --sandbox read-only -m gpt-5.5 -c model_reasoning_effort=xhigh -' \
LOOM_JUDGE_MODEL='gpt-5.5-xhigh' npm run bench -- --judge
# Cursor plan (agent CLI): -p takes the prompt as an ARGUMENT, not stdin,
# so "$(cat)" captures the piped prompt; --mode ask keeps it read-only.
LOOM_JUDGE_CMD='agent -p --mode ask --model auto --output-format text "$(cat)"' \
LOOM_JUDGE_MODEL='cursor-auto' npm run bench -- --judge
```

`LOOM_JUDGE_CMD` runs once per skill with the judge prompt on stdin and must
print the rubric JSON on stdout. `LOOM_JUDGE_MODEL` is only a scorecard label
in this mode. Read the freshest `retro/judge-scorecard-*.md` in a markdown
preview — the rubric table is the dashboard; diff two scorecards across skill
versions to spot regressions.

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
uplift claims, not for every PR. `--ablate` uses the same judge enablement as
`--judge` (committed default backend, `LOOM_JUDGE_MOCK`, or live
`LOOM_JUDGE_*`); with `LOOM_JUDGE_BACKEND=none` the CLI prints a skip notice
and exits 0.

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
