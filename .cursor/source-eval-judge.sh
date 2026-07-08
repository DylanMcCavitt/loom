#!/usr/bin/env bash
# OPTIONAL shell convenience: `npm run bench` reads LOOM_JUDGE_BACKEND directly
# (see resolveJudgeConfig in benchmarks/judge/judge.mjs), so sourcing this file
# is NOT required — the LOOM_JUDGE_BACKEND cloud secret alone enables the judge.
# Source it only if you want LOOM_JUDGE_CMD/LOOM_JUDGE_MODEL exported in your
# own shell. Never contains secrets.
# Auth comes from the CLIs' own subscription login state (`agent login` /
# `codex login`, persisted via environment snapshot) — no API keys.
#
# Keep the command strings below in sync with JUDGE_BACKENDS in
# benchmarks/judge/judge.mjs (that table is the source of truth).

case "${LOOM_JUDGE_BACKEND:-}" in
  codex)
    export LOOM_JUDGE_CMD='codex exec --ephemeral --sandbox read-only -m gpt-5.5 -c model_reasoning_effort=xhigh -'
    export LOOM_JUDGE_MODEL='gpt-5.5-xhigh'
    ;;
  cursor)
    export LOOM_JUDGE_CMD='agent -p --mode ask --model auto --output-format text "$(cat)"'
    export LOOM_JUDGE_MODEL='cursor-auto'
    ;;
  "")
    # No backend selected; bench --judge skips unless LOOM_JUDGE_* is set manually.
    ;;
  *)
    echo "source-eval-judge: unknown LOOM_JUDGE_BACKEND=${LOOM_JUDGE_BACKEND} (use cursor or codex)" >&2
    ;;
esac
