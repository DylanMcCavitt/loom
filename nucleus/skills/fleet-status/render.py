#!/usr/bin/env python3
"""Render ~/fleet/data.json (+ optional summaries.json) into ~/fleet/index.html.

summaries.json (optional, written by the agent-summary step) maps:
  { "<repo-name>": {"summary": str, "findings": [str], "next_ups": [str]} }
"""
from __future__ import annotations
import json, html, time
from pathlib import Path

FLEET = Path.home() / "fleet"
DATA = FLEET / "data.json"
SUMM = FLEET / "summaries.json"
OUT = FLEET / "index.html"


def esc(s):
    return html.escape(str(s))


def diff_html(raw):
    out = []
    for line in raw.splitlines():
        cls = ""
        if line.startswith("+") and not line.startswith("+++"):
            cls = "add"
        elif line.startswith("-") and not line.startswith("---"):
            cls = "del"
        elif line.startswith("@@"):
            cls = "hunk"
        elif line.startswith("diff ") or line.startswith("index "):
            cls = "meta"
        out.append(f'<span class="{cls}">{esc(line)}</span>')
    return "\n".join(out)


def badge(label, kind=""):
    return f'<span class="badge {kind}">{esc(label)}</span>'


def repo_card(r, summ, compact=False):
    p = []
    gh = f'https://github.com/{r["github"]}' if r.get("github") and r.get("owned") else None
    title = f'<a href="{gh}" target="_blank">{esc(r["name"])}</a>' if gh else esc(r["name"])

    badges = [badge(r["branch"], "branch")]
    if r["dirty_count"]:
        badges.append(badge(f'{r["dirty_count"]} uncommitted', "dirty"))
    if r["ahead"]:
        badges.append(badge(f'{r["ahead"]}↑ ahead', "warn"))
    if r["behind"]:
        badges.append(badge(f'{r["behind"]}↓ behind', "warn"))
    if not r["has_upstream"] and r["has_commits"]:
        badges.append(badge("no upstream", "warn"))
    if r["prs"]:
        badges.append(badge(f'{len(r["prs"])} PR', "pr"))
    if r["issues"]:
        badges.append(badge(f'{len(r["issues"])} issue', "muted"))

    p.append(f'<div class="card{" attn" if r["needs_attention"] else ""}">')
    p.append(f'<div class="card-h"><h3>{title}</h3><span class="age">{esc(r["last_commit_rel"])}</span></div>')
    p.append(f'<div class="badges">{"".join(badges)}</div>')
    p.append(f'<div class="path">{esc(r["path"])}</div>')

    if summ and summ.get("summary"):
        p.append(f'<div class="ai"><span class="ai-tag">summary</span>{esc(summ["summary"])}</div>')

    findings = list(r["findings"])
    nexts = list(r["next_ups"])
    if summ:
        for f in summ.get("findings", []):
            if f not in findings:
                findings.append(f)
        for n in summ.get("next_ups", []):
            if n not in nexts:
                nexts.append(n)

    cols = []
    if findings:
        items = "".join(f"<li>{esc(x)}</li>" for x in findings)
        cols.append(f'<div class="col"><h4>findings</h4><ul class="findings">{items}</ul></div>')
    if nexts:
        items = "".join(f"<li>{esc(x)}</li>" for x in nexts[:6])
        cols.append(f'<div class="col"><h4>next ups</h4><ul class="nexts">{items}</ul></div>')
    if cols:
        p.append(f'<div class="cols">{"".join(cols)}</div>')

    if r["prs"]:
        rows = []
        for pr in r["prs"]:
            ck = pr["checks"]
            cb = badge(ck, {"failing": "dirty", "passing": "ok", "pending": "warn"}.get(ck, "muted")) if ck != "none" else ""
            draft = badge("draft", "muted") if pr["draft"] else ""
            link = f'https://github.com/{r["github"]}/pull/{pr["number"]}'
            rows.append(f'<li><a href="{link}" target="_blank">#{pr["number"]}</a> {esc(pr["title"])} {cb}{draft} <span class="muted">{esc(pr["updated"])}</span></li>')
        p.append(f'<div class="col prs-block"><h4>open PRs</h4><ul class="prs">{"".join(rows)}</ul></div>')

    det = []
    if r["recent_commits"]:
        c = "".join(f"<li>{esc(x)}</li>" for x in r["recent_commits"])
        det.append(f'<div class="sub"><h5>recent commits</h5><ul class="commits">{c}</ul></div>')
    if r["diffstat"]:
        det.append(f'<div class="sub"><h5>diffstat</h5><pre class="stat">{esc(r["diffstat"])}</pre></div>')
    if r["raw_diff"].strip():
        trunc = ' <span class="muted">(truncated)</span>' if r["diff_truncated"] else ""
        det.append(f'<div class="sub"><h5>diff{trunc}</h5><pre class="diff">{diff_html(r["raw_diff"])}</pre></div>')
    if r["issues"]:
        c = "".join(f'<li><a href="https://github.com/{r["github"]}/issues/{i["number"]}" target="_blank">#{i["number"]}</a> {esc(i["title"])} <span class="muted">{esc(i["updated"])}</span></li>' for i in r["issues"])
        det.append(f'<div class="sub"><h5>open issues ({len(r["issues"])})</h5><ul class="issues">{c}</ul></div>')
    if det:
        p.append(f'<details><summary>details</summary><div class="det">{"".join(det)}</div></details>')

    p.append("</div>")
    return "\n".join(p)


def main():
    data = json.loads(DATA.read_text())
    summaries = json.loads(SUMM.read_text()) if SUMM.exists() else {}
    repos = data["repos"]

    attn = [r for r in repos if r["needs_attention"]]
    active_clean = [r for r in repos if r["active"] and not r["needs_attention"]]
    parked_work = [r for r in repos if not r["active"] and r["has_work"]]
    parked_quiet = [r for r in repos if not r["active"] and not r["has_work"]]

    gen = time.strftime("%a %b %d, %Y · %H:%M", time.localtime(data["generated_ts"]))

    def section(title, items, compact=False, sub=""):
        if not items:
            return ""
        cards = "\n".join(repo_card(r, summaries.get(r["name"]), compact) for r in items)
        s = f'<h2><span class="dot"></span>{esc(title)} <span class="count">{len(items)}</span></h2>'
        if sub:
            s += f'<p class="shint">{esc(sub)}</p>'
        return s + f'<div class="grid">{cards}</div>'

    quiet_line = ""
    if parked_quiet:
        names = " ".join(f'<span class="chip">{esc(r["name"])}</span>' for r in parked_quiet)
        quiet_line = (f'<h2><span class="dot"></span>parked &amp; clean <span class="count">{len(parked_quiet)}</span></h2>'
                      f'<p class="shint">no uncommitted or unpushed work — hidden by default</p>'
                      f'<div class="chips">{names}</div>')

    body = "\n".join([
        section("needs attention", attn, sub="uncommitted, unpushed, diverged, or failing checks"),
        section("active — clean", active_clean, compact=True),
        section("parked — has work", parked_work),
        quiet_line,
    ])

    htmlout = TEMPLATE.format(
        gen=gen,
        n_attn=len(attn), n_active=len(active_clean) + len(attn),
        n_repos=len(repos), n_park=len(parked_work) + len(parked_quiet),
        body=body,
        has_ai="yes" if summaries else "no",
    )
    OUT.write_text(htmlout)
    print(f"wrote {OUT}  (attention {len(attn)}, active {len(active_clean)+len(attn)}, parked {len(parked_work)+len(parked_quiet)})")


TEMPLATE = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fleet Status</title>
<style>
/* Theme: Sunset Boulevard (theme-factory) — burnt orange, coral, warm sand, deep purple */
:root{{
  --cream:#fbf4e9; --cream2:#f5ead8; --card:#fffdfa; --line:rgba(38,70,83,.13);
  --ink:#264653; --ink-soft:#4f6873; --mut:#917f6c;
  --orange:#e76f51; --orange-d:#c8472b; --coral:#f4a261; --coral-d:#bd6a32;
  --sand:#e9c46a; --gold-d:#9a6b1a; --purple:#264653;
  --add:#2f7d5b; --del:#c8472b;
  --serif:"DejaVu Serif",Georgia,"Iowan Old Style","Times New Roman",serif;
  --sans:"DejaVu Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
}}
*{{box-sizing:border-box}}
html{{scroll-behavior:smooth}}
body{{margin:0;color:var(--ink);font:14.5px/1.6 var(--sans);min-height:100vh;
  background:radial-gradient(1100px 560px at 82% -12%,#f7dcb4 0%,transparent 58%),
  linear-gradient(165deg,var(--cream),var(--cream2));background-attachment:fixed}}
a{{color:var(--orange-d);text-decoration:none}} a:hover{{color:var(--orange)}}

header{{position:sticky;top:0;z-index:9;padding:18px 32px;display:flex;align-items:center;gap:18px;
  background:linear-gradient(180deg,rgba(251,244,233,.94),rgba(251,244,233,.6));backdrop-filter:blur(10px);
  border-bottom:1px solid var(--line)}}
header h1{{font-family:var(--serif);font-size:23px;margin:0;font-weight:700;letter-spacing:-.01em;color:var(--orange)}}
header .meta{{color:var(--mut);font-size:12.5px}}
#q{{margin-left:6px;background:#fff;border:1px solid var(--line);color:var(--ink);
  border-radius:10px;padding:7px 13px;font-size:13px;width:190px;outline:none}}
#q:focus{{border-color:var(--coral)}}
header .stat{{margin-left:auto;display:flex;gap:20px;font-size:12.5px;color:var(--mut)}}
header .stat b{{color:var(--ink);font-size:15px}} header .stat .a b{{color:var(--orange-d)}}

main{{padding:6px 32px 80px;max-width:1160px;margin:0 auto}}
h2{{display:flex;align-items:center;gap:9px;font-size:12.5px;text-transform:uppercase;letter-spacing:.14em;
  color:var(--ink-soft);font-weight:700;margin:38px 0 2px}}
h2 .dot{{width:8px;height:8px;border-radius:50%;background:var(--orange)}}
h2 .count{{background:#fff;border:1px solid var(--line);color:var(--mut);border-radius:20px;padding:1px 9px;font-size:11px;letter-spacing:.04em}}
.shint{{color:var(--mut);font-size:12.5px;margin:6px 0 16px;letter-spacing:.01em}}

.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:18px}}
.card{{background:var(--card);border:1px solid var(--line);
  border-radius:16px;padding:20px 22px;box-shadow:0 8px 24px -16px rgba(38,70,83,.35)}}
.card.attn{{border-left:3px solid var(--orange);border-radius:0 16px 16px 0}}
.card-h{{display:flex;justify-content:space-between;align-items:baseline;gap:12px}}
.card-h h3{{font-family:var(--serif);margin:0;font-size:17px;font-weight:700;letter-spacing:-.01em;color:var(--ink)}}
.card-h a{{color:var(--ink)}} .card-h a:hover{{color:var(--orange-d)}}
.age{{color:var(--mut);font-size:12px;white-space:nowrap}}
.badges{{display:flex;gap:6px;flex-wrap:wrap;margin:11px 0 4px}}
.badge{{font-size:11.5px;padding:2px 10px;border-radius:20px;background:rgba(38,70,83,.06);
  color:var(--ink-soft);font-weight:600}}
.badge.branch{{background:rgba(38,70,83,.10);color:var(--purple)}}
.badge.warn{{background:rgba(233,196,106,.34);color:var(--gold-d)}}
.badge.dirty{{background:rgba(231,111,81,.17);color:var(--orange-d)}}
.badge.pr{{background:rgba(244,162,97,.22);color:var(--coral-d)}}
.badge.ok{{background:rgba(47,125,91,.16);color:var(--add)}}
.path{{color:var(--mut);font-size:11px;font-family:ui-monospace,Menlo,monospace;margin:5px 0 0;opacity:.75}}

.ai{{background:rgba(233,196,106,.18);border:1px solid rgba(231,111,81,.22);border-radius:11px;
  padding:11px 13px;margin:14px 0 2px;font-size:13.5px;line-height:1.55;color:var(--ink)}}
.ai-tag{{display:inline-block;color:var(--orange-d);font-size:10px;font-weight:800;text-transform:uppercase;
  letter-spacing:.1em;margin-right:9px;vertical-align:1px}}

.cols{{display:flex;gap:26px;flex-wrap:wrap;margin-top:14px}} .col{{flex:1;min-width:165px}}
.col h4{{font-size:10.5px;text-transform:uppercase;margin:6px 0 6px;letter-spacing:.12em;font-weight:800}}
.findings h4{{color:var(--orange-d)}} .nexts h4{{color:var(--coral-d)}}
ul{{margin:0;padding-left:17px}} li{{margin:4px 0}}
.findings li{{color:var(--orange-d)}} .findings li::marker{{color:var(--orange)}}
.nexts li{{color:var(--ink)}} .nexts li::marker{{color:var(--coral)}}
.prs-block{{margin-top:14px;flex-basis:100%}}
.prs li,.issues li{{color:var(--ink);font-size:13px}}
.commits li{{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:var(--mut)}}

details{{margin-top:14px}}
summary{{cursor:pointer;color:var(--mut);font-size:12px;letter-spacing:.04em;list-style:none}}
summary::before{{content:"\\203A  ";color:var(--orange)}}
details[open] summary::before{{content:"\\2304  "}}
.det{{margin-top:10px}} .sub h5{{margin:12px 0 4px;font-size:10.5px;color:var(--mut);text-transform:uppercase;letter-spacing:.1em}}
pre{{background:#fdf5e8;border:1px solid var(--line);border-radius:9px;padding:11px;overflow:auto;
  font:12px/1.5 ui-monospace,Menlo,monospace;max-height:340px;color:var(--ink-soft)}}
.diff span{{display:block;white-space:pre}} .diff .add{{color:var(--add)}} .diff .del{{color:var(--del)}}
.diff .hunk{{color:var(--purple)}} .diff .meta{{color:var(--mut)}}

.chips{{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}}
.chip{{background:#fff;border:1px solid var(--line);color:var(--ink-soft);border-radius:20px;padding:4px 13px;font-size:12.5px}}
</style></head><body>
<header>
  <h1>Fleet Status</h1>
  <span class="meta">{gen}</span>
  <input id="q" placeholder="filter repos…" oninput="filt(this.value)">
  <div class="stat">
    <span class="a"><b>{n_attn}</b> need attention</span>
    <span><b>{n_active}</b> active</span>
    <span><b>{n_repos}</b> repos</span>
  </div>
</header>
<main>{body}</main>
<script>
function filt(v){{v=v.toLowerCase();document.querySelectorAll('.card').forEach(c=>{{
 c.style.display=c.textContent.toLowerCase().includes(v)?'':'none';}});}}
</script>
</body></html>"""


if __name__ == "__main__":
    main()
