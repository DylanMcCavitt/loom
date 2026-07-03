#!/usr/bin/env python3
"""Analyze omp /debug report bundles for agent workflow issues."""

from __future__ import annotations

import argparse
import json
import re
import sys
import tarfile
import tempfile
from collections import Counter
from pathlib import Path
from typing import Any


SECRET_KEY_RE = re.compile(
    r"(SECRET|TOKEN|KEY|PASSWORD|PASS|COOKIE|AUTH|CREDENTIAL|REFRESH|SESSION)",
    re.I,
)
CORRECTION_RE = re.compile(
    r"\b(wrong|not that|do not|don't|stop|instead|start over|went wrong|"
    r"you sent|you are in the wrong|try again|not a|should have)\b",
    re.I,
)
WRONG_TARGET_RE = re.compile(
    r"\b(wrong (place|thread|pane|terminal|browser|app|window)|"
    r"sent .*codex chat|sent .*terminal|stale input|side panel|"
    r"current thread|another project|fork into current directory)\b",
    re.I,
)
PROOF_RE = re.compile(
    r"\b(validate|validated|test(ed|s)?|screenshot|visible|proof|confirmed|"
    r"passes?|quick_validate|smoke[- ]test|verified)\b",
    re.I,
)
COMPLETION_RE = re.compile(
    r"\b(done|fixed|created|updated|implemented|landed|complete|validated|"
    r"works|passes)\b",
    re.I,
)


def shorten(text: str, limit: int = 160) -> str:
    compact = re.sub(r"\s+", " ", text).strip()
    if len(compact) <= limit:
        return compact
    return compact[: limit - 1].rstrip() + "..."


def redacted(value: Any) -> str:
    if value in (None, ""):
        return ""
    return "[redacted]"


def safe_extract_tar(path: Path) -> tuple[Path, tempfile.TemporaryDirectory[str] | None]:
    if not path.is_file() or not (path.name.endswith(".tar.gz") or path.name.endswith(".tgz")):
        return path, None

    tmp = tempfile.TemporaryDirectory()
    root = Path(tmp.name).resolve()
    with tarfile.open(path, "r:gz") as archive:
        for member in archive.getmembers():
            target = (root / member.name).resolve()
            if target != root and root not in target.parents:
                raise SystemExit(f"Unsafe archive path: {member.name}")
            archive.extract(member, root)
    return root, tmp


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8", errors="replace"))
    except json.JSONDecodeError as exc:
        return {"_error": f"invalid json: {exc}"}
    return value if isinstance(value, dict) else {"_value_type": type(value).__name__}


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line_no, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError as exc:
            rows.append({"type": "parse_error", "line": line_no, "error": str(exc)})
            continue
        if isinstance(value, dict):
            rows.append(value)
    return rows


def find_session_files(root: Path) -> list[Path]:
    if root.is_file():
        return [root]
    files: list[Path] = []
    session = root / "session.jsonl"
    if session.exists():
        files.append(session)
    subagents = root / "subagents"
    if subagents.exists():
        files.extend(sorted(subagents.glob("*.jsonl")))
    return files


def content_items(message: dict[str, Any]) -> list[Any]:
    content = message.get("content")
    if isinstance(content, list):
        return content
    if isinstance(content, str):
        return [{"type": "text", "text": content}]
    return []


def visible_text(message: dict[str, Any]) -> str:
    parts: list[str] = []
    for item in content_items(message):
        if isinstance(item, dict):
            if item.get("type") == "text" and item.get("text"):
                parts.append(str(item["text"]))
        elif item is not None:
            parts.append(str(item))
    return "\n".join(parts)


def iter_tool_calls(event: dict[str, Any]) -> list[dict[str, Any]]:
    message = event.get("message")
    if not isinstance(message, dict):
        return []
    calls: list[dict[str, Any]] = []
    for item in content_items(message):
        if isinstance(item, dict) and item.get("type") == "toolCall":
            calls.append(item)
    return calls


def tool_arg_summary(name: str, args: Any) -> str:
    if not isinstance(args, dict):
        return ""
    if name == "read":
        return str(args.get("path") or "")
    if name == "bash":
        return str(args.get("command") or args.get("cmd") or "")
    if name in {"write", "edit"}:
        return str(args.get("path") or args.get("file") or "")
    return shorten(json.dumps(args, sort_keys=True, default=str), 120)


def assistant_summary(event: dict[str, Any]) -> str:
    message = event.get("message")
    if not isinstance(message, dict):
        return ""
    text = visible_text(message)
    if text:
        return shorten(text, 120)
    calls = [str(call.get("name") or "tool") for call in iter_tool_calls(event)]
    if calls:
        return "tool calls: " + ", ".join(calls[:8])
    if any(isinstance(item, dict) and item.get("type") == "thinking" for item in content_items(message)):
        return "[thinking only]"
    return ""


def summarize_session(path: Path, rows: list[dict[str, Any]], slow_ms: int) -> dict[str, Any]:
    roles: Counter[str] = Counter()
    event_types: Counter[str] = Counter()
    tool_calls: Counter[str] = Counter()
    tool_results: Counter[str] = Counter()
    repeated_reads: Counter[str] = Counter()
    repeated_bash: Counter[str] = Counter()
    failures: list[dict[str, Any]] = []
    slow_steps: list[dict[str, Any]] = []
    correction_hits: list[dict[str, Any]] = []
    wrong_target_hits: list[dict[str, Any]] = []
    proof_hits = 0
    completion_claims = 0
    total_tokens = 0
    total_cost = 0.0
    duration_ms = 0
    session_meta: dict[str, Any] = {}

    for event in rows:
        event_type = str(event.get("type") or "unknown")
        event_types[event_type] += 1
        if event_type == "session":
            session_meta = event

        message = event.get("message")
        if isinstance(message, dict):
            role = str(message.get("role") or "none")
            roles[role] += 1
            text = visible_text(message)

            if role in {"user", "assistant"}:
                if CORRECTION_RE.search(text):
                    correction_hits.append({"id": event.get("id"), "role": role, "text": shorten(text)})
                if WRONG_TARGET_RE.search(text):
                    wrong_target_hits.append({"id": event.get("id"), "role": role, "text": shorten(text)})
                if PROOF_RE.search(text):
                    proof_hits += 1
                if role == "assistant" and COMPLETION_RE.search(text):
                    completion_claims += 1

            usage = message.get("usage")
            if isinstance(usage, dict):
                total_tokens += int(usage.get("totalTokens") or 0)
                cost = usage.get("cost")
                if isinstance(cost, dict):
                    total_cost += float(cost.get("total") or 0)

            duration = message.get("duration")
            if isinstance(duration, (int, float)):
                duration_ms += int(duration)
                if duration >= slow_ms:
                    slow_steps.append(
                        {
                            "id": event.get("id"),
                            "duration_s": round(float(duration) / 1000, 1),
                            "summary": assistant_summary(event),
                        }
                    )

            if role == "toolResult":
                tool_name = str(message.get("toolName") or "tool")
                tool_results[tool_name] += 1
                details = message.get("details")
                exit_code = details.get("exitCode") if isinstance(details, dict) else None
                if message.get("isError") or exit_code not in (None, 0):
                    failures.append(
                        {
                            "id": event.get("id"),
                            "tool": tool_name,
                            "exit_code": exit_code,
                            "summary": shorten(visible_text(message)),
                        }
                    )

        for call in iter_tool_calls(event):
            name = str(call.get("name") or "tool")
            args = call.get("arguments")
            tool_calls[name] += 1
            summary = tool_arg_summary(name, args)
            if name == "read" and summary:
                repeated_reads[summary] += 1
            if name == "bash" and summary:
                repeated_bash[summary] += 1

    return {
        "path": str(path),
        "session": {
            "id": session_meta.get("id"),
            "title": session_meta.get("title"),
            "cwd": session_meta.get("cwd"),
            "timestamp": session_meta.get("timestamp"),
        },
        "event_count": len(rows),
        "roles": dict(roles),
        "event_types": dict(event_types),
        "tool_calls": dict(tool_calls),
        "tool_results": dict(tool_results),
        "repeated_reads": {k: v for k, v in repeated_reads.items() if v > 1},
        "repeated_bash": {k: v for k, v in repeated_bash.items() if v > 1},
        "failures": failures,
        "slow_steps": slow_steps,
        "correction_hits": correction_hits,
        "wrong_target_hits": wrong_target_hits,
        "proof_hits": proof_hits,
        "completion_claims": completion_claims,
        "total_tokens": total_tokens,
        "total_cost": round(total_cost, 6),
        "duration_ms": duration_ms,
    }


def env_summary(env: dict[str, Any]) -> dict[str, Any]:
    if not env:
        return {}
    secret_keys = sorted(k for k in env if SECRET_KEY_RE.search(k))
    safe_keys = sorted(k for k in env if not SECRET_KEY_RE.search(k))
    selected_safe = {}
    for key in ("SHELL", "TERM", "PWD", "OLDPWD", "CODEX_THREAD_ID", "CODEX_SHELL", "USER"):
        if key in env and key not in secret_keys:
            selected_safe[key] = env[key]
    return {
        "key_count": len(env),
        "safe_key_sample": safe_keys[:30],
        "secret_like_keys": secret_keys,
        "selected_safe_values": selected_safe,
        "redacted_secret_values": {key: redacted(env.get(key)) for key in secret_keys},
    }


def aggregate(
    root: Path,
    source: Path,
    summaries: list[dict[str, Any]],
    system: dict[str, Any],
    config: dict[str, Any],
    env: dict[str, Any],
) -> dict[str, Any]:
    tool_calls: Counter[str] = Counter()
    tool_results: Counter[str] = Counter()
    repeated_reads: Counter[str] = Counter()
    repeated_bash: Counter[str] = Counter()
    failures: list[dict[str, Any]] = []
    slow_steps: list[dict[str, Any]] = []
    correction_hits: list[dict[str, Any]] = []
    wrong_target_hits: list[dict[str, Any]] = []
    event_count = 0
    total_tokens = 0
    total_cost = 0.0
    duration_ms = 0
    proof_hits = 0
    completion_claims = 0

    for summary in summaries:
        tool_calls.update(summary["tool_calls"])
        tool_results.update(summary["tool_results"])
        repeated_reads.update(summary["repeated_reads"])
        repeated_bash.update(summary["repeated_bash"])
        failures.extend(summary["failures"])
        slow_steps.extend(summary["slow_steps"])
        correction_hits.extend(summary["correction_hits"])
        wrong_target_hits.extend(summary["wrong_target_hits"])
        event_count += int(summary["event_count"])
        total_tokens += int(summary["total_tokens"])
        total_cost += float(summary["total_cost"])
        duration_ms += int(summary["duration_ms"])
        proof_hits += int(summary["proof_hits"])
        completion_claims += int(summary["completion_claims"])

    issues: list[dict[str, Any]] = []
    if failures:
        issues.append({"type": "failed_or_error_results", "count": len(failures), "evidence": failures[:8]})
    if repeated_reads:
        issues.append({"type": "repeated_reads", "count": sum(repeated_reads.values()), "evidence": dict(repeated_reads.most_common(8))})
    if repeated_bash:
        issues.append({"type": "repeated_bash_commands", "count": sum(repeated_bash.values()), "evidence": dict(repeated_bash.most_common(8))})
    if wrong_target_hits:
        issues.append({"type": "wrong_target_or_ui_risk", "count": len(wrong_target_hits), "evidence": wrong_target_hits[:8]})
    if correction_hits:
        issues.append({"type": "user_correction_loop", "count": len(correction_hits), "evidence": correction_hits[:8]})
    if slow_steps:
        issues.append({"type": "slow_steps", "count": len(slow_steps), "evidence": sorted(slow_steps, key=lambda x: x["duration_s"], reverse=True)[:8]})
    if completion_claims and not proof_hits:
        issues.append(
            {
                "type": "proof_gap",
                "count": completion_claims,
                "evidence": ["Completion-like claims found, but no validation or proof language was detected."],
            }
        )

    return {
        "source": str(source),
        "extracted_root": str(root),
        "session_files": len(summaries),
        "event_count": event_count,
        "system": system,
        "config": config,
        "env": env_summary(env),
        "tool_calls": dict(tool_calls),
        "tool_results": dict(tool_results),
        "issues": issues,
        "total_tokens_observed": total_tokens,
        "total_cost_observed": round(total_cost, 6),
        "model_duration_s_observed": round(duration_ms / 1000, 1),
        "proof_mentions": proof_hits,
        "completion_claims": completion_claims,
        "sessions": summaries,
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines: list[str] = [
        "# Debug Audit",
        "",
        f"- Source: `{report['source']}`",
        f"- Session files: {report['session_files']}",
        f"- Events: {report['event_count']}",
        f"- Observed tokens: {report['total_tokens_observed']}",
        f"- Observed model duration: {report['model_duration_s_observed']}s",
    ]
    if report["total_cost_observed"]:
        lines.append(f"- Observed model cost: ${report['total_cost_observed']:.4f}")

    system = report.get("system") or {}
    if system:
        versions = system.get("versions") if isinstance(system.get("versions"), dict) else {}
        memory = system.get("memory") if isinstance(system.get("memory"), dict) else {}
        lines.extend(
            [
                "",
                "## Runtime",
                f"- OS: {system.get('os', '[unknown]')} / {system.get('arch', '[unknown]')}",
                f"- CPU: {system.get('cpu', '[unknown]')}",
                f"- Memory: total={memory.get('total', '[unknown]')} free={memory.get('free', '[unknown]')}",
                f"- App: {versions.get('app', '[unknown]')} Bun: {versions.get('bun', '[unknown]')} Node: {versions.get('node', '[unknown]')}",
                f"- CWD: `{system.get('cwd', '[unknown]')}`",
                f"- Shell: `{system.get('shell', '[unknown]')}` Terminal: `{system.get('terminal', '[unknown]')}`",
            ]
        )

    config = report.get("config") or {}
    if config:
        lines.extend(
            [
                "",
                "## Config",
                f"- Model: {config.get('model', '[unknown]')}",
                f"- Thinking: {config.get('thinkingLevel', '[unknown]')}",
                f"- Plan mode: {config.get('planModeEnabled', '[unknown]')}",
                f"- Tool output expanded: {config.get('toolOutputExpanded', '[unknown]')}",
                f"- Hide thinking block: {config.get('hideThinkingBlock', '[unknown]')}",
            ]
        )

    env = report.get("env") or {}
    if env:
        secret_keys = env.get("secret_like_keys") or []
        lines.extend(
            [
                "",
                "## Environment",
                f"- Env keys: {env.get('key_count', 0)}",
                f"- Secret-like keys present: {', '.join(secret_keys) if secret_keys else 'none detected'}",
                "- Env values: redacted by default",
            ]
        )

    lines.extend(["", "## Tool Counts"])
    if report.get("tool_calls"):
        for name, count in sorted(report["tool_calls"].items(), key=lambda item: (-item[1], item[0])):
            result_count = report.get("tool_results", {}).get(name, 0)
            lines.append(f"- {name}: calls={count} results={result_count}")
    else:
        lines.append("- No tool calls detected.")

    lines.extend(["", "## Issues"])
    if not report.get("issues"):
        lines.append("- No obvious workflow issues detected by static heuristics.")
    for issue in report.get("issues", []):
        lines.append(f"- {issue['type']}: {issue['count']}")
        evidence = issue.get("evidence")
        if isinstance(evidence, dict):
            for key, value in evidence.items():
                lines.append(f"  - `{key}`: {value}")
        elif isinstance(evidence, list):
            for item in evidence:
                if isinstance(item, dict):
                    item_text = ", ".join(f"{key}={value}" for key, value in item.items() if value not in (None, "", []))
                    lines.append(f"  - {item_text}")
                else:
                    lines.append(f"  - {item}")

    lines.extend(["", "## Session Files"])
    for summary in report.get("sessions", []):
        session = summary.get("session") or {}
        lines.append(
            f"- `{summary['path']}`: events={summary['event_count']} "
            f"title={session.get('title') or '[unknown]'} cwd=`{session.get('cwd') or '[unknown]'}`"
        )

    lines.extend(["", "## Next Debugging Actions"])
    issue_types = {issue["type"] for issue in report.get("issues", [])}
    if "failed_or_error_results" in issue_types:
        lines.append("- Re-run or inspect failed commands with exact command text, exit status, and recovery step.")
    if "wrong_target_or_ui_risk" in issue_types:
        lines.append("- Add a preflight target check: thread title, cwd, terminal focus, and empty prompt before sending input.")
    if "repeated_reads" in issue_types:
        lines.append("- Cache summaries of files already read and reread only after changes.")
    if "user_correction_loop" in issue_types:
        lines.append("- Promote user corrections into an explicit scope decision before taking the next tool action.")
    if "slow_steps" in issue_types:
        lines.append("- Use a quick diagnostic mode before full reconstruction on slow or high-token tasks.")
    if "proof_gap" in issue_types:
        lines.append("- Attach proof to completion claims: validator output, test results, route checks, screenshots, or artifact paths.")
    if not issue_types:
        lines.append("- No heuristic blocker found; inspect user-visible behavior or logs next if the failure persists.")

    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyze an omp /debug bundle, extracted report directory, or session JSONL.")
    parser.add_argument("path", help="Path to .tar.gz bundle, report directory, or session.jsonl")
    parser.add_argument("--json", action="store_true", help="Emit structured JSON instead of Markdown")
    parser.add_argument("--slow-ms", type=int, default=15000, help="Assistant duration threshold for slow-step findings")
    args = parser.parse_args()

    source = Path(args.path).expanduser()
    if not source.exists():
        raise SystemExit(f"Path not found: {source}")

    root, tmp = safe_extract_tar(source)
    try:
        session_files = find_session_files(root)
        if not session_files:
            raise SystemExit("No session JSONL files found.")
        summaries = [summarize_session(path, load_jsonl(path), args.slow_ms) for path in session_files]
        base = root if root.is_dir() else root.parent
        report = aggregate(
            root=root,
            source=source,
            summaries=summaries,
            system=load_json(base / "system.json"),
            config=load_json(base / "config.json"),
            env=load_json(base / "env.json"),
        )
        if args.json:
            print(json.dumps(report, indent=2, sort_keys=True))
        else:
            print(render_markdown(report), end="")
    finally:
        if tmp is not None:
            tmp.cleanup()


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:
        sys.exit(1)
