#!/bin/zsh
# Daily silent refresh: collect + render (no agents, no browser). Run by launchd.
export PATH="/opt/homebrew/bin:/usr/local/bin:/etc/profiles/per-user/dylanmccavitt/bin:/usr/bin:/bin"
D="$HOME/.agents/skills/fleet-status"
mkdir -p "$HOME/fleet"
{
  echo "=== refresh $(date) ==="
  python3 "$D/collect.py"
  python3 "$D/render.py"
} >> "$HOME/fleet/refresh.log" 2>&1
