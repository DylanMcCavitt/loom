#!/usr/bin/env bash
# Sources judge defaults for cloud-agent sessions. Never contains secrets.
# Set LOOM_JUDGE_BACKEND to "cursor" or "codex" in the environment Secrets tab.
# Optional: CURSOR_API_KEY (Cursor headless auth), CODEX_API_KEY (Codex API auth).

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
