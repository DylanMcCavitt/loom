#!/usr/bin/env bash
# OPTIONAL shell convenience: `npm run bench` reads LOOM_JUDGE_BACKEND directly
# and falls back to the committed default in benchmarks/judge/judge.config.json
# (see resolveJudgeConfig in benchmarks/judge/judge.mjs), so sourcing this file
# is NOT required — the judge is enabled with no per-thread configuration.
# Source it only if you want LOOM_JUDGE_CMD/LOOM_JUDGE_MODEL exported in your
# own shell. Never contains secrets.
# Auth comes from the CURSOR_API_KEY / CODEX_AUTH_JSON secrets or the CLIs'
# own subscription login state (`agent login` / `codex login`).
#
# Keep the command strings below in sync with JUDGE_BACKENDS in
# benchmarks/judge/judge.mjs (that table is the source of truth).

_loom_backend="${LOOM_JUDGE_BACKEND:-}"
if [[ -z "${_loom_backend}" ]]; then
  _loom_backend="$(node -p 'JSON.parse(require("fs").readFileSync("benchmarks/judge/judge.config.json", "utf8")).defaultBackend' 2>/dev/null || true)"
fi

case "${_loom_backend}" in
  codex)
    export LOOM_JUDGE_CMD='codex exec --ephemeral --sandbox read-only -m gpt-5.5 -c model_reasoning_effort=xhigh -'
    export LOOM_JUDGE_MODEL='gpt-5.5-xhigh'
    ;;
  cursor)
    export LOOM_JUDGE_CMD='agent -p --mode ask --model auto --output-format text "$(cat)"'
    export LOOM_JUDGE_MODEL='cursor-auto'
    ;;
  ""|none|off)
    # No backend selected (or opted out); bench --judge skips unless
    # LOOM_JUDGE_* is set manually.
    ;;
  *)
    echo "source-eval-judge: unknown judge backend '${_loom_backend}' (use cursor or codex)" >&2
    ;;
esac
unset _loom_backend
