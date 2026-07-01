---
name: tradingview-breakout-dashboard
description: Use when the user asks to run or review a TradingView breakout chartbook/dashboard, analyze configured stock universes for breakout context, or generate the local HTML dashboard with Codex Analysis from tradingview-mcp artifacts.
---

# TradingView Breakout Dashboard

Use this workflow for local TradingView Desktop chartbook dashboards in
`tradingview-mcp`. The output is chart review context only: no ranking, no
recommendations, no alerts, no broker calls, and no order actions.

## Repo

Prefer the active cwd if it is a `tradingview-mcp` checkout. Otherwise use:

```bash
/Users/dylanmccavitt/projects/tradingview-mcp
```

If the issue worktree has newer unmerged dashboard work, use that worktree
instead.

## Default Run

Default to:

- group: `semis`
- tier: `core`
- profile: `breakout`
- preset: `focus`
- session: `manual-breakout`
- render timeout: `30000`
- render settle: `3000`

If the user names a group, tier, or session, use their values.

## Port Detection

1. Try the TradingView MCP/status tool on port `9333`, then `9222`.
2. If MCP tools are not available, run:

```bash
npm run tv:health -- --port 9333
npm run tv:health -- --port 9222
```

3. If both fail, inspect the running app:

```bash
ps -axo pid,args | rg "TradingView.*remote-debugging-port"
lsof -nP -iTCP -sTCP:LISTEN | rg "9222|9333"
```

4. If TradingView is not reachable, launch it:

```bash
npm run tv:launch -- --port 9333
```

If an existing TradingView process was launched without CDP, tell the user to
quit TradingView once, then relaunch with the command above.

## Run Command

Use the repo shortcut:

```bash
npm run tv:breakout-dashboard -- --group semis --tier core --session manual-breakout --port 9333
```

For a user-provided universe:

```bash
npm run tv:breakout-dashboard -- --group <group> --tier <core|extended|all> --session <session-id> --port <port>
```

If the shortcut does not exist in the current checkout, fall back to:

```bash
npm run tv:chartbook -- --group <group> --tier <tier> --profile breakout --preset focus --session <session-id> --port <port> --render-timeout-ms 30000 --render-settle-ms 3000
```

## Verification

After the run:

1. Confirm command status.
2. Confirm the dashboard exists.
3. Check the HTML contains `Codex Analysis`.
4. Report the dashboard as a clickable local file link.
5. If any symbol/timeframe failed, report the failures and still link the
   dashboard.

Useful check:

```bash
rg -n "Codex Analysis|Status</strong>OK|FAILED" artifacts/tradingview-chartbooks/<session-id>/index.html
```

## Response Shape

Keep the response concise:

- state the group/tier/session and port used
- link `index.html`
- summarize whether all symbols succeeded
- mention any extraction limitations or failed symbols

Do not call the output a scan, signal, recommendation, or trade plan.
