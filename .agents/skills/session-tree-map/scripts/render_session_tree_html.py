#!/usr/bin/env python3
"""Render a session-tree JSON snapshot as clickable HTML."""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
from pathlib import Path
from typing import Any


def slug(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "-", value.strip()).strip("-")
    return cleaned or "node"


def as_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value if item is not None]
    return [str(value)]


def node_title(node: dict[str, Any]) -> str:
    node_type = str(node.get("type") or node.get("role") or "event")
    label = str(node.get("label") or node.get("summary") or node.get("id") or "")
    return f"{node_type}: {label}" if label else node_type


def load_snapshot(path: str) -> dict[str, Any]:
    if path == "-":
        raw = sys.stdin.read()
    else:
        raw = Path(path).read_text(encoding="utf-8")
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise SystemExit("Input must be a JSON object.")
    nodes = data.get("nodes")
    if not isinstance(nodes, list) or not nodes:
        raise SystemExit("Input must contain a non-empty nodes array.")
    return data


def normalize_nodes(nodes: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, list[dict[str, Any]]]]:
    normalized: list[dict[str, Any]] = []
    seen: set[str] = set()
    children: dict[str, list[dict[str, Any]]] = {}

    for index, raw_node in enumerate(nodes, start=1):
        if not isinstance(raw_node, dict):
            raise SystemExit(f"Node {index} must be an object.")
        node = dict(raw_node)
        base_id = slug(str(node.get("id") or f"n{index}"))
        node_id = base_id
        suffix = 2
        while node_id in seen:
            node_id = f"{base_id}-{suffix}"
            suffix += 1
        seen.add(node_id)
        node["id"] = node_id
        parent = node.get("parent") or node.get("parentId") or node.get("parent_id") or ""
        node["parent"] = slug(str(parent)) if parent else ""
        normalized.append(node)

    ids = {node["id"] for node in normalized}
    for node in normalized:
        parent = node["parent"] if node["parent"] in ids else ""
        children.setdefault(parent, []).append(node)
    return normalized, children


def render_tree(children: dict[str, list[dict[str, Any]]], parent: str = "") -> str:
    items: list[str] = []
    for node in children.get(parent, []):
        marker = "*" if node.get("active") else ""
        classes = "active" if node.get("active") else ""
        title = html.escape(node_title(node))
        node_id = html.escape(node["id"])
        nested = render_tree(children, node["id"])
        items.append(
            f'<li class="{classes}"><a href="#node-{node_id}"><span class="marker">{marker}</span>'
            f"{title}</a>{nested}</li>"
        )
    return f"<ul>{''.join(items)}</ul>" if items else ""


def render_kv(title: str, values: list[str]) -> str:
    if not values:
        return ""
    escaped = "".join(f"<li>{html.escape(value)}</li>" for value in values)
    return f"<h4>{html.escape(title)}</h4><ul>{escaped}</ul>"


def render_details(nodes: list[dict[str, Any]]) -> str:
    sections: list[str] = []
    for node in nodes:
        node_id = html.escape(node["id"])
        title = html.escape(node_title(node))
        summary = html.escape(str(node.get("summary") or ""))
        tags = " ".join(f"<span>{html.escape(tag)}</span>" for tag in as_list(node.get("tags")))
        body = [
            f'<section id="node-{node_id}" class="node-detail">',
            f"<h3>{title}</h3>",
            f'<p class="node-id">#{node_id}</p>',
        ]
        if tags:
            body.append(f'<div class="tags">{tags}</div>')
        if summary:
            body.append(f"<p>{summary}</p>")
        body.append(render_kv("Details", as_list(node.get("details"))))
        body.append(render_kv("Files", as_list(node.get("files"))))
        body.append(render_kv("Commands", as_list(node.get("commands"))))
        body.append(render_kv("Artifacts", as_list(node.get("artifacts"))))
        body.append(render_kv("Decisions", as_list(node.get("decisions") or node.get("decision"))))
        body.append(render_kv("Blockers", as_list(node.get("blockers") or node.get("blocker"))))
        body.append("</section>")
        sections.append("".join(body))
    return "".join(sections)


def render_html(snapshot: dict[str, Any]) -> str:
    raw_nodes = snapshot["nodes"]
    nodes, children = normalize_nodes(raw_nodes)
    title = html.escape(str(snapshot.get("title") or "Session Tree"))
    summary_items = as_list(snapshot.get("summary"))
    summary = "".join(f"<li>{html.escape(item)}</li>" for item in summary_items)
    subtitle = html.escape(str(snapshot.get("subtitle") or "Clickable snapshot. Links jump inside this capture, not the live transcript."))

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <style>
    :root {{ color-scheme: light dark; --border: #8a8f9840; --accent: #0f766e; }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }}
    header {{ padding: 20px 24px; border-bottom: 1px solid var(--border); }}
    h1 {{ margin: 0 0 6px; font-size: 24px; }}
    p {{ margin: 0 0 10px; }}
    main {{ display: grid; grid-template-columns: minmax(260px, 34vw) 1fr; min-height: calc(100vh - 86px); }}
    nav {{ position: sticky; top: 0; max-height: calc(100vh - 86px); overflow: auto; padding: 16px; border-right: 1px solid var(--border); }}
    nav ul {{ list-style: none; margin: 0; padding-left: 18px; }}
    nav > ul {{ padding-left: 0; }}
    nav li {{ margin: 4px 0; }}
    nav a {{ color: inherit; display: block; padding: 4px 6px; border-radius: 6px; text-decoration: none; }}
    nav a:hover, section:target {{ outline: 2px solid var(--accent); outline-offset: 2px; }}
    .marker {{ color: var(--accent); display: inline-block; font-weight: 700; width: 14px; }}
    .active > a {{ font-weight: 700; }}
    .content {{ padding: 18px 24px 48px; min-width: 0; }}
    .summary {{ margin: 0 0 20px; padding-left: 20px; }}
    .node-detail {{ border-bottom: 1px solid var(--border); padding: 18px 0; scroll-margin-top: 16px; }}
    .node-detail h3 {{ margin: 0 0 4px; font-size: 18px; }}
    .node-id {{ color: #6b7280; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }}
    .tags span {{ border: 1px solid var(--border); border-radius: 999px; display: inline-block; margin: 0 6px 6px 0; padding: 2px 8px; }}
    h4 {{ margin: 12px 0 4px; }}
    code {{ font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }}
    @media (max-width: 760px) {{ main {{ display: block; }} nav {{ position: static; max-height: none; border-right: 0; border-bottom: 1px solid var(--border); }} }}
  </style>
</head>
<body>
  <header>
    <h1>{title}</h1>
    <p>{subtitle}</p>
  </header>
  <main>
    <nav aria-label="Session tree">{render_tree(children)}</nav>
    <div class="content">
      <ul class="summary">{summary}</ul>
      {render_details(nodes)}
    </div>
  </main>
</body>
</html>
"""


def main() -> None:
    parser = argparse.ArgumentParser(description="Render a clickable session-tree HTML snapshot.")
    parser.add_argument("input", help="JSON snapshot path, or - for stdin")
    parser.add_argument("--output", "-o", required=True, help="Output HTML path")
    args = parser.parse_args()

    snapshot = load_snapshot(args.input)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(render_html(snapshot), encoding="utf-8")
    print(output)


if __name__ == "__main__":
    main()
