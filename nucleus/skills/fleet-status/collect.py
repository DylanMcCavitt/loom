#!/usr/bin/env python3
"""Fleet-status collector. Scans local git repos and emits structured JSON.

No third-party deps. Shells out to git and (optionally) gh.
Output: ~/fleet/data.json  (also prints the path).
"""
from __future__ import annotations
import json, os, subprocess, time, shutil
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HOME = Path.home()
ROOTS = [HOME / "src", HOME / "projects"]
EXCLUDE_NAMES = {"dots", "browser-harness"}  # broken or vendored tooling, skip entirely
ACTIVE_DAYS = 30                       # touched within N days => active
DIFF_MAX_LINES = 300                   # truncate raw diff per repo
OUT = HOME / "fleet" / "data.json"

GH = shutil.which("gh")
_gh_ok = None
_gh_user = None


def sh(args, cwd=None, timeout=20):
    try:
        r = subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=timeout)
        return r.stdout.strip(), r.returncode
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return "", 1


def git(repo, *args, timeout=20):
    out, _ = sh(["git", "-C", str(repo), *args], timeout=timeout)
    return out


def gh_ok():
    global _gh_ok
    if _gh_ok is None:
        if not GH:
            _gh_ok = False
        else:
            _, code = sh([GH, "auth", "status"], timeout=10)
            _gh_ok = code == 0
    return _gh_ok


def gh_user():
    global _gh_user
    if _gh_user is None:
        _gh_user = sh([GH, "api", "user", "--jq", ".login"], timeout=10)[0] if gh_ok() else ""
    return _gh_user


def find_repos():
    """Direct children of each root only (depth-1) — ignores nested repos."""
    repos = []
    for root in ROOTS:
        if not root.exists():
            continue
        for entry in sorted(root.iterdir()):
            if not entry.is_dir() or entry.name in EXCLUDE_NAMES:
                continue
            if (entry / ".git").exists():
                repos.append(entry)
    return repos


def github_slug(repo):
    url = git(repo, "config", "--get", "remote.origin.url")
    if "github.com" not in url:
        return None
    s = url.split("github.com")[-1].lstrip(":/").removesuffix(".git")
    return s if "/" in s else None


def collect_gh(repo, slug):
    """Open PRs and issues for a github repo (best-effort, fast-fail)."""
    prs, issues = [], []
    pr_out, code = sh([GH, "pr", "list", "-R", slug, "--state", "open",
                       "--json", "number,title,headRefName,isDraft,updatedAt,statusCheckRollup",
                       "--limit", "20"], timeout=25)
    if code == 0 and pr_out:
        try:
            for p in json.loads(pr_out):
                roll = p.get("statusCheckRollup") or []
                states = [c.get("conclusion") or c.get("state") for c in roll if isinstance(c, dict)]
                checks = "none"
                if states:
                    if any(s in ("FAILURE", "ERROR", "TIMED_OUT", "CANCELLED") for s in states):
                        checks = "failing"
                    elif any(s in ("PENDING", "IN_PROGRESS", "QUEUED", None) for s in states):
                        checks = "pending"
                    else:
                        checks = "passing"
                prs.append({"number": p["number"], "title": p["title"],
                            "branch": p.get("headRefName", ""), "draft": p.get("isDraft", False),
                            "updated": p.get("updatedAt", "")[:10], "checks": checks})
        except json.JSONDecodeError:
            pass
    iss_out, code = sh([GH, "issue", "list", "-R", slug, "--state", "open",
                        "--json", "number,title,updatedAt", "--limit", "10"], timeout=25)
    if code == 0 and iss_out:
        try:
            for i in json.loads(iss_out):
                issues.append({"number": i["number"], "title": i["title"],
                               "updated": i.get("updatedAt", "")[:10]})
        except json.JSONDecodeError:
            pass
    return prs, issues


def parse_porcelain(text):
    files = []
    for line in text.splitlines():
        if not line.strip():
            continue
        code = line[:2]
        path = line[3:]
        files.append({"code": code.strip() or "?", "path": path})
    return files


def collect_repo(repo):
    name = repo.name
    branch = git(repo, "symbolic-ref", "--short", "HEAD") or "(detached)"
    default = "main"
    # last commit
    ts = git(repo, "log", "-1", "--format=%ct")
    last_ts = int(ts) if ts.isdigit() else 0
    days = int((time.time() - last_ts) / 86400) if last_ts else 9999
    rel = git(repo, "log", "-1", "--format=%cr") or "no commits"
    has_commits = bool(ts)

    porcelain = git(repo, "status", "--porcelain")
    dirty_files = parse_porcelain(porcelain)

    # upstream / ahead-behind
    upstream = git(repo, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}")
    has_upstream = bool(upstream) and "fatal" not in upstream
    ahead = behind = 0
    if has_upstream:
        lr = git(repo, "rev-list", "--left-right", "--count", "@{u}...HEAD")
        parts = lr.split()
        if len(parts) == 2 and parts[0].isdigit():
            behind, ahead = int(parts[0]), int(parts[1])

    recent = [l for l in git(repo, "log", "-5", "--format=%h %s").splitlines() if l]
    diffstat = git(repo, "diff", "HEAD", "--stat") if has_commits else ""
    raw = git(repo, "diff", "HEAD") if has_commits else ""
    raw_lines = raw.splitlines()
    diff_truncated = len(raw_lines) > DIFF_MAX_LINES
    raw = "\n".join(raw_lines[:DIFF_MAX_LINES])

    slug = github_slug(repo)
    owner = slug.split("/")[0] if slug else ""
    owned = bool(owner) and owner.lower() == gh_user().lower()
    prs, issues = ([], [])
    if slug and owned and gh_ok():
        prs, issues = collect_gh(repo, slug)

    on_main = branch in ("main", "master")
    active = (days <= ACTIVE_DAYS) or bool(dirty_files) or ahead > 0 or (not has_upstream and has_commits and days <= 90)
    has_work = bool(dirty_files) or ahead > 0 or (not has_upstream and has_commits)

    # auto findings / next-ups
    findings, nexts = [], []
    if behind and ahead:
        findings.append(f"Diverged from upstream: {behind} behind / {ahead} ahead")
        nexts.append(f"Rebase {branch} onto upstream, then push")
    elif behind:
        findings.append(f"{behind} commits behind upstream")
        nexts.append(f"Pull/rebase {branch} ({behind} behind)")
    if ahead and not behind:
        findings.append(f"{ahead} unpushed commit(s) on {branch}")
        nexts.append(f"Push {branch} ({ahead} ahead)")
    if not has_upstream and has_commits:
        findings.append(f"Branch '{branch}' has no upstream (never pushed)")
        nexts.append(f"git push -u origin {branch}")
    if dirty_files:
        where = " on default branch" if on_main else ""
        findings.append(f"{len(dirty_files)} uncommitted file(s){where}")
        nexts.append(f"Commit or stash {len(dirty_files)} change(s)")
    for p in prs:
        if p["checks"] == "failing":
            findings.append(f"PR #{p['number']} has failing checks")
            nexts.append(f"Fix CI on PR #{p['number']}")
    for p in prs:
        nexts.append(f"Review/merge PR #{p['number']}: {p['title'][:50]}")

    return {
        "name": name, "path": str(repo), "branch": branch, "on_main": on_main,
        "last_commit_rel": rel, "days_since": days, "has_commits": has_commits,
        "dirty_files": dirty_files, "dirty_count": len(dirty_files),
        "has_upstream": has_upstream, "ahead": ahead, "behind": behind,
        "recent_commits": recent, "diffstat": diffstat,
        "raw_diff": raw, "diff_truncated": diff_truncated,
        "github": slug, "owned": owned, "prs": prs, "issues": issues,
        "active": active, "has_work": has_work,
        "findings": findings, "next_ups": nexts,
        "needs_attention": bool(findings),
    }


def main():
    repos = find_repos()
    with ThreadPoolExecutor(max_workers=8) as ex:
        data = list(ex.map(collect_repo, repos))
    data.sort(key=lambda r: (not r["needs_attention"], r["days_since"]))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_ts": int(time.time()),
        "roots": [str(r) for r in ROOTS],
        "gh": gh_ok(),
        "repos": data,
    }
    OUT.write_text(json.dumps(payload, indent=2))
    active = [r for r in data if r["active"]]
    attn = [r for r in data if r["needs_attention"]]
    print(f"scanned {len(data)} repos | active {len(active)} | needs-attention {len(attn)}")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
