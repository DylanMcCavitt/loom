#!/usr/bin/env bash
# Idempotent cloud-agent bootstrap for Loom eval CLIs.
# Runs on every agent boot via .cursor/environment.json "install".
# Installs judge backends and wires secret-driven auth; never writes
# secrets into the repo.
#
# Cloud Agents Secrets consumed here (all optional, all env-injected):
# - CURSOR_API_KEY   — the agent CLI reads it natively; nothing to write.
# - CODEX_AUTH_JSON  — base64 of a working ~/.codex/auth.json; written to
#   ~/.codex/auth.json on boot so codex is logged in without a snapshot.
# - LOOM_JUDGE_BACKEND — optional override of the committed default in
#   benchmarks/judge/judge.config.json (cursor | codex | none).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_BIN="${HOME}/.local/bin"
MARKER="${HOME}/.config/loom/eval-tools-installed"

mkdir -p "${HOME}/.local/bin" "${HOME}/.config/loom"

ensure_path() {
  if ! grep -qxF 'export PATH="$HOME/.local/bin:$PATH"' "${HOME}/.bashrc" 2>/dev/null; then
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "${HOME}/.bashrc"
  fi
  export PATH="${LOCAL_BIN}:${PATH}"
}

install_cursor_cli() {
  if command -v agent >/dev/null 2>&1; then
    echo "eval-tools: agent CLI already present ($(agent --version 2>&1 | head -1))"
    return 0
  fi
  echo "eval-tools: installing Cursor CLI (agent)..."
  curl https://cursor.com/install -fsS | bash
  ensure_path
  if ! command -v agent >/dev/null 2>&1; then
    echo "eval-tools: agent CLI install finished but agent is not on PATH" >&2
    return 1
  fi
  echo "eval-tools: agent CLI ready ($(agent --version 2>&1 | head -1))"
}

install_codex_cli() {
  if command -v codex >/dev/null 2>&1; then
    echo "eval-tools: codex CLI already present ($(codex --version 2>&1 | head -1))"
    return 0
  fi
  echo "eval-tools: installing Codex CLI (@openai/codex)..."
  npm install -g @openai/codex --prefix "${HOME}/.local"
  ensure_path
  if ! command -v codex >/dev/null 2>&1; then
    echo "eval-tools: codex install finished but codex is not on PATH" >&2
    return 1
  fi
  echo "eval-tools: codex CLI ready ($(codex --version 2>&1 | head -1))"
}

# Secret-driven auth: this runs on a disposable cloud VM at boot (not an
# operator's live HOME), so materializing CLI auth state here is expected.
wire_codex_auth() {
  if [[ -z "${CODEX_AUTH_JSON:-}" ]]; then
    return 0
  fi
  mkdir -p "${HOME}/.codex"
  if base64 -d <<<"${CODEX_AUTH_JSON}" > "${HOME}/.codex/auth.json" 2>/dev/null \
      && [[ -s "${HOME}/.codex/auth.json" ]]; then
    chmod 600 "${HOME}/.codex/auth.json"
    echo "eval-tools: wrote ~/.codex/auth.json from CODEX_AUTH_JSON secret"
  else
    rm -f "${HOME}/.codex/auth.json"
    echo "eval-tools: CODEX_AUTH_JSON secret is set but is not valid base64 — codex stays logged out" >&2
  fi
}

auth_state() {
  case "$1" in
    agent)
      if [[ -n "${CURSOR_API_KEY:-}" ]]; then
        echo "authenticated (CURSOR_API_KEY secret)"
        return 0
      fi
      local status
      status="$(agent status 2>&1 || true)"
      if grep -qi 'not logged in' <<<"${status}"; then
        echo "NOT authenticated — add CURSOR_API_KEY to Cloud Agents Secrets (or 'agent login' + snapshot)"
      else
        echo "authenticated (subscription login)"
      fi
      ;;
    codex)
      local status
      status="$(codex login status 2>&1 || true)"
      if grep -qi 'not logged in' <<<"${status}"; then
        echo "NOT authenticated — add CODEX_AUTH_JSON to Cloud Agents Secrets (or 'codex login' + snapshot)"
      else
        echo "authenticated"
      fi
      ;;
  esac
}

readiness_summary() {
  local backend="${LOOM_JUDGE_BACKEND:-}"
  local source="LOOM_JUDGE_BACKEND env/secret"
  if [[ -z "${backend}" ]]; then
    backend="$(node -p 'JSON.parse(require("fs").readFileSync("benchmarks/judge/judge.config.json", "utf8")).defaultBackend' 2>/dev/null || true)"
    source="committed benchmarks/judge/judge.config.json default"
  fi

  echo ""
  echo "=== eval readiness (boot) ==="
  echo "eval-tools: agent CLI: $(auth_state agent)"
  echo "eval-tools: codex CLI: $(auth_state codex)"
  case "${backend}" in
    cursor|codex)
      echo "eval-tools: judge backend: ${backend} (${source})"
      ;;
    none|off)
      echo "eval-tools: judge backend: disabled (${source} = ${backend}) — bench --judge will skip" >&2
      ;;
    *)
      echo "eval-tools: judge backend: MISCONFIGURED (${source} = '${backend:-unset}') — bench --judge will not run" >&2
      ;;
  esac
}

ensure_path
install_cursor_cli
install_codex_cli
wire_codex_auth
(cd "${REPO_ROOT}" && readiness_summary)

date -u +"%Y-%m-%dT%H:%M:%SZ" > "${MARKER}"
echo "eval-tools: marker written to ${MARKER}"
echo "eval-tools: run 'bash .cursor/verify-eval-tools.sh' from ${REPO_ROOT} to confirm judge readiness"
