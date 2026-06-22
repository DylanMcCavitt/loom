#!/usr/bin/env python3
"""Analyze omp session JSONL/debug bundles for workflow issues."""

from __future__ import annotations

import argparse
import json
import re
import tarfile
import tempfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


CORRECTION_RE = re.compile(r"\b(wrong|not that|stop|instead|you sent|you are in the wrong|try again)\b", re.I)
WRONG_TARGET_RE = re.compile(r"\b(wrong (place|thread|pane|terminal)|sent .*codex chat|sent .*terminal|stale input|wrong codex app)\b", re.I)
PROOF_RE = re.compile(r"\b(validate|validated|test(ed|s)?|screenshot|screencapture|visible|proof|confirmed|passes?|quick_validate)\b", re.I)


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def unpack_if_needed(path: Path) -> tuple[Path, tempfile.TemporaryDirectory[str] | None]:
    if path.is_file() and path.suffixes[-2:] == [".tar", ".gz"]:
        tmp = tempfile.TemporaryDirectory()
        with tarfile.open(path, "r:gz") as archive:
            root = Path(tmp.name).resolve()
            for member in archive.getmembers():
                target = (root / member.name).resolve()
                if root not in target.parents and target != root:
                    raise SystemExit(f"Unsafe archive path: {member.name}")
                archive.extract(member, root)
        return Path(tmp.name), tmp
    return path, None


def find_sessions(path: Path) -> list[Path]:
    if path.is_file():
        return [path]
    files = [path / "session.jsonl"]
    files.extend(sorted((path / "subagents").glob("*.jsonl")))
    return [item for item in files if item.exists()]


def text_from_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    parts: list[str] = []
    if isinstance(content, list):
        for item in content:
            if isinstance(item, dict):
                for key in ("text", "thinking"):
                    if item.get(key):
                        parts.append(str(item[key]))
            elif item is not None:
                parts.append(str(item))
    return "\n".join(parts)


def event_text(event: dict[str, Any]) -> str:
    message = event.get("message") or {}
    if not isinstance(message, dict):
        return ""
    return text_from_content(message.get("content"))


def iter_tool_calls(event: dict[str, Any]) -> list[dict[str, Any]]:
    message = event.get("message") or {}
    if not isinstance(message, dict):
        return []
    content = message.get("content")
    if not isinstance(content, list):
        return []
    calls: list[dict[str, Any]] = []
    for item in content:
        if isinstance(item, dict) and item.get("type") == "toolCall":
            calls.append(item)
    return calls


def summarize_session(path: Path, rows: list[dict[str, Any]]) -> dict[str, Any]:
    roles: Counter[str] = Counter()
    event_types: Counter[str] = Counter()
    tool_counts: Counter[str] = Counter()
    read_paths: Counter[str] = Counter()
    failures: list[str] = []
    long_steps: list[str] = []
    correction_hits: list[str] = []
    wrong_target_hits: list[str] = []
    proof_hits = 0
    total_tokens = 0
    durations: list[int] = []
    session_meta: dict[str, Any] = {}

    for event in rows:
        event_types[str(event.get("type"))] += 1
        if event.get("type") == "session":
            session_meta = event
        message = event.get("message") or {}
        if isinstance(message, dict):
            role = str(message.get("role") or "none")
            roles[role] += 1
            text = event_text(event)
            if role in {"user", "assistant"}:
                if CORRECTION_RE.search(text):
                    correction_hits.append(shorten(text))
                if WRONG_TARGET_RE.search(text):
                    wrong_target_hits.append(shorten(text))
                if PROOF_RE.search(text):
                    proof_hits += 1

            usage = message.get("usage")
            if isinstance(usage, dict):
                total_tokens += int(usage.get("totalTokens") or 0)
            duration = message.get("duration")
            if isinstance(duration, int):
                durations.append(duration)
                if duration >= 15000:
                    long_steps.append(f"{event.get('id')}: {duration / 1000:.1f}s {shorten(text, 90)}")

            if role == "toolResult":
                if message.get("isError"):
                    failures.append(f"{message.get('toolName') or 'tool'}: {shorten(text)}")
                details = message.get("details")
                if isinstance(details, dict) and details.get("exitCode") not in (None, 0):
                    failures.append(f"{message.get('toolName') or 'tool'} exit {details.get('exitCode')}: {shorten(text)}")

        for call in iter_tool_calls(event):
            name = str(call.get("name") or "tool")
            tool_counts[name] += 1
            args = call.get("arguments")
            if name == "read" and isinstance(args, dict):
                path_arg = str(args.get("path") or "")
                if path_arg:
                    read_paths[path_arg] += 1

    repeated_reads = {path: count for path, count in read_paths.items() if count > 1}
    return {
        "path": str(path),
        "session": {
            "id": session_meta.get("id"),
            "title": session_meta.get("title"),
            "cwd": session_meta.get("cwd"),
        },
        "event_count": len(rows),
        "roles": dict(roles),
        "event_types": dict(event_types),
        "tool_counts": dict(tool_counts),
        "repeated_reads": repeated_reads,
        "failures": failures,
        "long_steps": long_steps,
        "correction_hits": correction_hits[:8],
        "wrong_target_hits": wrong_target_hits[:8],
        "proof_hits": proof_hits,
        "total_tokens": total_tokens,
        "duration_ms_total_observed": sum(durations),
    }


def shorten(text: str, limit: int = 140) -> str:
    compact = re.sub(r"\s+", " ", text).strip()
    if len(compact) <= limit:
        return compact
    return compact[: limit - 1].rstrip() + "..."


def aggregate(summaries: list[dict[str, Any]]) -> dict[str, Any]:
    tool_counts: Counter[str] = Counter()
    repeated_reads: Counter[str] = Counter()
    failures: list[str] = []
    long_steps: list[str] = []
    correction_hits: list[str] = []
    wrong_target_hits: list[str] = []
    total_tokens = 0
    duration_ms = 0
    event_count = 0

    for summary in summaries:
        tool_counts.update(summary["tool_counts"])
        repeated_reads.update(summary["repeated_reads"])
        failures.extend(summary["failures"])
        long_steps.extend(summary["long_steps"])
        correction_hits.extend(summary["correction_hits"])
        wrong_target_hits.extend(summary["wrong_target_hits"])
        total_tokens += summary["total_tokens"]
        duration_ms += summary["duration_ms_total_observed"]
        event_count += summary["event_count"]

    issues: list[dict[str, Any]] = []
    if repeated_reads:
        issues.append({"type": "repeated_reads", "count": sum(repeated_reads.values()), "evidence": dict(repeated_reads.most_common(8))})
    if failures:
        issues.append({"type": "failed_or_error_results", "count": len(failures), "evidence": failures[:8]})
    if wrong_target_hits:
        issues.append({"type": "wrong_target_or_ui_risk", "count": len(wrong_target_hits), "evidence": wrong_target_hits[:8]})
    if correction_hits:
        issues.append({"type": "user_correction_loop", "count": len(correction_hits), "evidence": correction_hits[:8]})
    if long_steps:
        issues.append({"type": "slow_steps", "count": len(long_steps), "evidence": long_steps[:8]})

    return {
        "session_files": len(summaries),
        "event_count": event_count,
        "tool_counts": dict(tool_counts),
        "issues": issues,
        "total_tokens": total_tokens,
        "duration_ms_total_observed": duration_ms,
        "summaries": summaries,
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Session Workflow Audit",
        "",
        f"- Session files: {report['session_files']}",
        f"- Events: {report['event_count']}",
        f"- Observed tokens: {report['total_tokens']}",
        f"- Observed model duration: {report['duration_ms_total_observed'] / 1000:.1f}s",
        "",
        "## Tool Counts",
    ]
    for name, count in sorted(report["tool_counts"].items(), key=lambda item: (-item[1], item[0])):
        lines.append(f"- {name}: {count}")

    lines.extend(["", "## Issues"])
    if not report["issues"]:
        lines.append("- No obvious workflow issues detected by static heuristics.")
    for issue in report["issues"]:
        lines.append(f"- {issue['type']}: {issue['count']}")
        evidence = issue.get("evidence")
        if isinstance(evidence, dict):
            for key, value in evidence.items():
                lines.append(f"  - {key}: {value}")
        elif isinstance(evidence, list):
            for value in evidence:
                lines.append(f"  - {value}")

    lines.extend(["", "## Recommended Fixes"])
    issue_types = {issue["type"] for issue in report["issues"]}
    if "wrong_target_or_ui_risk" in issue_types:
        lines.append("- Add a preflight check before UI automation: confirm target app, thread title, terminal focus, and prompt line is empty.")
    if "repeated_reads" in issue_types:
        lines.append("- Cache or summarize previously read skill files instead of rereading them unless they changed.")
    if "failed_or_error_results" in issue_types:
        lines.append("- Surface failed commands with the exact command, exit status, and recovery step.")
    if "user_correction_loop" in issue_types:
        lines.append("- Promote user corrections into explicit decisions so the next action honors the corrected scope.")
    if "slow_steps" in issue_types:
        lines.append("- Mark slow or high-token steps and consider a quick mode before full reconstruction.")
    if not issue_types:
        lines.append("- Keep the current workflow; no heuristic issues were found.")

    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyze omp session JSONL or /debug report bundles.")
    parser.add_argument("path", help="Path to session.jsonl, extracted report directory, or .tar.gz report bundle")
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of Markdown")
    args = parser.parse_args()

    root, tmp = unpack_if_needed(Path(args.path).expanduser())
    try:
        session_paths = find_sessions(root)
        if not session_paths:
            raise SystemExit("No session JSONL files found.")
        summaries = [summarize_session(path, load_jsonl(path)) for path in session_paths]
        report = aggregate(summaries)
        if args.json:
            print(json.dumps(report, indent=2))
        else:
            print(render_markdown(report), end="")
    finally:
        if tmp is not None:
            tmp.cleanup()


if __name__ == "__main__":
    main()
