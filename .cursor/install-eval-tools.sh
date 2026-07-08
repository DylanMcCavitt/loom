#!/usr/bin/env bash
# Idempotent cloud-agent bootstrap for Loom eval CLIs.
# Runs on every agent boot via .cursor/environment.json "install".
# Installs judge backends only; never writes secrets into the repo.

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

ensure_path
install_cursor_cli
install_codex_cli

date -u +"%Y-%m-%dT%H:%M:%SZ" > "${MARKER}"
echo "eval-tools: marker written to ${MARKER}"
echo "eval-tools: run 'bash .cursor/verify-eval-tools.sh' from ${REPO_ROOT} to confirm judge readiness"
