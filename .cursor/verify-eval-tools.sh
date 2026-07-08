#!/usr/bin/env bash
# Readiness check for cloud-agent eval runs. Exit 0 when structural gates pass;
# prints hints for missing auth without failing (judge may still skip gracefully).

set -euo pipefail

export PATH="${HOME}/.local/bin:${PATH}"
FAIL=0

check_cmd() {
  if command -v "$1" >/dev/null 2>&1; then
    echo "ok: $1 ($("$1" --version 2>&1 | head -1))"
  else
    echo "missing: $1 (run bash .cursor/install-eval-tools.sh)" >&2
    FAIL=1
  fi
}

echo "=== Loom eval tool verification ==="
check_cmd node
check_cmd npm
check_cmd agent
check_cmd codex

if [[ -f package.json ]]; then
  echo "ok: loom repo root ($(pwd))"
else
  echo "missing: package.json — run from the loom repo root" >&2
  FAIL=1
fi

echo ""
echo "=== Judge backend ==="
source "$(dirname "$0")/source-eval-judge.sh" 2>/dev/null || true
if [[ -n "${LOOM_JUDGE_CMD:-}" ]]; then
  echo "ok: LOOM_JUDGE_BACKEND=${LOOM_JUDGE_BACKEND:-unset} → LOOM_JUDGE_CMD is set"
  echo "     model label: ${LOOM_JUDGE_MODEL:-unset}"
else
  echo "hint: set LOOM_JUDGE_BACKEND=cursor or codex in Cloud Agents Secrets"
fi

echo ""
echo "=== Auth hints (non-fatal) ==="
if [[ -n "${CURSOR_API_KEY:-}" ]]; then
  echo "ok: CURSOR_API_KEY is set (agent headless auth)"
else
  echo "hint: add CURSOR_API_KEY to Secrets when using LOOM_JUDGE_BACKEND=cursor"
fi
if [[ -n "${CODEX_API_KEY:-}" ]]; then
  echo "ok: CODEX_API_KEY is set"
else
  echo "hint: add CODEX_API_KEY to Secrets, or run 'codex login' once then snapshot the environment"
fi

echo ""
echo "=== Structural gate ==="
if npm run check >/dev/null 2>&1; then
  echo "ok: npm run check"
else
  echo "warn: npm run check failed — fix before trusting eval output" >&2
fi

if [[ "${FAIL}" -eq 0 ]]; then
  echo ""
  echo "ready: CLIs installed. Run judge with:"
  echo "  source .cursor/source-eval-judge.sh && npm run bench -- --judge roboports"
  exit 0
fi
echo ""
echo "not ready: install missing tools first" >&2
exit 1
