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
# bench reads LOOM_JUDGE_BACKEND directly (benchmarks/judge/judge.mjs) and
# falls back to the committed default in benchmarks/judge/judge.config.json,
# so the judge is enabled on every thread with no per-thread configuration.
BACKEND="${LOOM_JUDGE_BACKEND:-}"
BACKEND_SOURCE="LOOM_JUDGE_BACKEND"
if [[ -z "${BACKEND}" ]]; then
  BACKEND="$(node -p 'JSON.parse(require("fs").readFileSync("benchmarks/judge/judge.config.json", "utf8")).defaultBackend' 2>/dev/null || true)"
  BACKEND_SOURCE="benchmarks/judge/judge.config.json default"
fi
case "${BACKEND}" in
  cursor)
    echo "ok: judge backend cursor (${BACKEND_SOURCE}) → agent -p --mode ask --model auto --output-format text \"\$(cat)\""
    ;;
  codex)
    echo "ok: judge backend codex (${BACKEND_SOURCE}) → codex exec --ephemeral --sandbox read-only -m gpt-5.5 -c model_reasoning_effort=xhigh -"
    ;;
  none|off)
    echo "note: judge backend disabled (${BACKEND_SOURCE}=${BACKEND}) — bench --judge will skip"
    ;;
  "")
    echo "hint: no judge backend — set defaultBackend in benchmarks/judge/judge.config.json or LOOM_JUDGE_BACKEND=cursor|codex"
    ;;
  *)
    echo "warn: unknown judge backend '${BACKEND}' from ${BACKEND_SOURCE} (use cursor or codex) — bench --judge will fail loudly" >&2
    ;;
esac

echo ""
echo "=== Auth hints (non-fatal) ==="
# Both CLIs may print "Not logged in" while still exiting 0, so check output too.
if [[ -n "${CURSOR_API_KEY:-}" ]]; then
  echo "ok: agent CLI authenticated via CURSOR_API_KEY secret"
else
  AGENT_STATUS="$(agent status 2>&1)" && ! grep -qi 'not logged in' <<<"${AGENT_STATUS}" \
    && echo "ok: agent CLI is logged in (Cursor subscription)" \
    || echo "hint: add CURSOR_API_KEY to Cloud Agents Secrets (persists across threads), or run 'agent login' once and snapshot the environment"
fi
CODEX_STATUS="$(codex login status 2>&1)" && ! grep -qi 'not logged in' <<<"${CODEX_STATUS}" \
  && echo "ok: codex CLI is logged in (ChatGPT/Codex subscription)" \
  || echo "hint: add CODEX_AUTH_JSON (base64 of a working ~/.codex/auth.json) to Cloud Agents Secrets, or run 'codex login' once and snapshot the environment"

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
  echo "  npm run bench -- --judge roboports"
  exit 0
fi
echo ""
echo "not ready: install missing tools first" >&2
exit 1
