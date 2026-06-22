#!/usr/bin/env python3
"""Build simple Excalidraw diagrams from a JSON spec."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple


EXCALIDRAW_SOURCE = "https://excalidraw.com"
DEFAULT_STROKE = "#1f2933"
DEFAULT_FILL = "transparent"
MODE_CHOICES = ("architecture", "flowchart", "mindmap", "whiteboard")
GENERATOR_FAMILY = "codex-excalidraw-diagram"
GENERATOR_STATE_KEY = "codexExcaliDrawGenerator"
LEGACY_GENERATED_ID_RE = re.compile(r"^(rectangle|ellipse|diamond|text|arrow)_[0-9a-f]{12}$")


class DiagramError(RuntimeError):
    """Raised for invalid diagram inputs or unsupported operations."""


def slugify(value: Any) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-") or "item"


def stable_hash(*parts: Any) -> str:
    joined = "|".join(str(part) for part in parts)
    return hashlib.sha1(joined.encode("utf-8")).hexdigest()


def stable_id(prefix: str, *parts: Any) -> str:
    return "{0}_{1}".format(prefix, stable_hash(prefix, *parts)[:12])


def stable_int(*parts: Any) -> int:
    value = int(stable_hash(*parts)[:8], 16)
    return value or 1


def as_list(value: Any) -> List[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def rounded(value: float) -> float:
    return round(float(value), 2)


def estimate_text_box(text: str, font_size: int = 20) -> Tuple[int, int, int]:
    lines = text.splitlines() or [""]
    max_chars = max(len(line) for line in lines)
    width = max(40, int(max_chars * font_size * 0.62) + 20)
    height = max(font_size + 12, int(len(lines) * font_size * 1.3) + 12)
    baseline = int(font_size * 0.8)
    return width, height, baseline


def center_of(bounds: Dict[str, Any]) -> Tuple[float, float]:
    return bounds["x"] + (bounds["width"] / 2.0), bounds["y"] + (bounds["height"] / 2.0)


def coerce_color(value: Any, default: str) -> str:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return default


def coerce_int(value: Any, field: str, default: Optional[int] = None) -> int:
    if value is None:
        if default is None:
            raise DiagramError("Field '{0}' must be an integer.".format(field))
        value = default
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise DiagramError("Field '{0}' must be an integer; got {1!r}.".format(field, value)) from exc


def coerce_float(value: Any, field: str, default: Optional[float] = None) -> float:
    if value is None:
        if default is None:
            raise DiagramError("Field '{0}' must be a number.".format(field))
        value = default
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise DiagramError("Field '{0}' must be a number; got {1!r}.".format(field, value)) from exc


def optional_int(value: Any, field: str) -> Optional[int]:
    if value is None:
        return None
    return coerce_int(value, field)


def optional_float(value: Any, field: str) -> Optional[float]:
    if value is None:
        return None
    return coerce_float(value, field)


def element_base(
    element_type: str,
    key: str,
    x: float,
    y: float,
    width: float,
    height: float,
    **extra: Any
) -> Dict[str, Any]:
    stroke_color = coerce_color(extra.pop("strokeColor", None), DEFAULT_STROKE)
    background_color = coerce_color(extra.pop("backgroundColor", None), DEFAULT_FILL)
    fill_style = extra.pop("fillStyle", "solid")
    stroke_width = coerce_int(extra.pop("strokeWidth", 2), "{0}.strokeWidth".format(key), default=2)
    stroke_style = extra.pop("strokeStyle", "solid")
    roughness = coerce_int(extra.pop("roughness", 0), "{0}.roughness".format(key), default=0)
    opacity = coerce_int(extra.pop("opacity", 100), "{0}.opacity".format(key), default=100)
    group_ids = extra.pop("groupIds", [])
    frame_id = extra.pop("frameId", None)
    roundness = extra.pop("roundness", None)
    bound_elements = extra.pop("boundElements", [])
    link = extra.pop("link", None)
    x_value = coerce_float(x, "{0}.x".format(key))
    y_value = coerce_float(y, "{0}.y".format(key))
    width_value = coerce_float(width, "{0}.width".format(key))
    height_value = coerce_float(height, "{0}.height".format(key))

    return {
        "id": stable_id(element_type, key),
        "type": element_type,
        "x": rounded(x_value),
        "y": rounded(y_value),
        "width": rounded(max(width_value, 1)),
        "height": rounded(max(height_value, 1)),
        "angle": 0,
        "strokeColor": stroke_color,
        "backgroundColor": background_color,
        "fillStyle": fill_style,
        "strokeWidth": stroke_width,
        "strokeStyle": stroke_style,
        "roughness": roughness,
        "opacity": opacity,
        "groupIds": group_ids,
        "frameId": frame_id,
        "roundness": roundness,
        "seed": stable_int("seed", element_type, key),
        "version": 1,
        "versionNonce": stable_int("nonce", element_type, key),
        "isDeleted": False,
        "boundElements": bound_elements,
        "updated": 0,
        "link": link,
        "locked": False,
        **extra,
    }


def make_shape(
    shape_type: str,
    key: str,
    x: float,
    y: float,
    width: float,
    height: float,
    stroke: Optional[str] = None,
    fill: Optional[str] = None,
) -> Dict[str, Any]:
    normalized = shape_type if shape_type in ("rectangle", "ellipse", "diamond") else "rectangle"
    return element_base(
        normalized,
        key,
        x,
        y,
        width,
        height,
        strokeColor=stroke or DEFAULT_STROKE,
        backgroundColor=fill or DEFAULT_FILL,
        roundness={"type": 3} if normalized == "rectangle" else None,
    )


def make_text(
    key: str,
    text: str,
    x: float,
    y: float,
    font_size: int = 20,
    color: Optional[str] = None,
    text_align: str = "center",
) -> Dict[str, Any]:
    width, height, baseline = estimate_text_box(text, font_size=font_size)
    return element_base(
        "text",
        key,
        x,
        y,
        width,
        height,
        strokeColor=color or DEFAULT_STROKE,
        backgroundColor="transparent",
        strokeWidth=1,
        text=text,
        fontSize=font_size,
        fontFamily=1,
        textAlign=text_align,
        verticalAlign="middle",
        baseline=baseline,
        containerId=None,
        originalText=text,
        lineHeight=1.25,
        autoResize=True,
    )


def make_centered_text(
    key: str,
    text: str,
    center_x: float,
    center_y: float,
    font_size: int = 20,
    color: Optional[str] = None,
) -> Dict[str, Any]:
    width, height, _ = estimate_text_box(text, font_size=font_size)
    return make_text(
        key=key,
        text=text,
        x=center_x - (width / 2.0),
        y=center_y - (height / 2.0),
        font_size=font_size,
        color=color,
        text_align="center",
    )


def make_arrow(
    key: str,
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    color: Optional[str] = None,
    end_arrowhead: Optional[str] = "triangle",
) -> Dict[str, Any]:
    origin_x = min(x1, x2)
    origin_y = min(y1, y2)
    points = [
        [rounded(x1 - origin_x), rounded(y1 - origin_y)],
        [rounded(x2 - origin_x), rounded(y2 - origin_y)],
    ]
    return element_base(
        "arrow",
        key,
        origin_x,
        origin_y,
        max(abs(x2 - x1), 1),
        max(abs(y2 - y1), 1),
        strokeColor=color or DEFAULT_STROKE,
        backgroundColor="transparent",
        points=points,
        lastCommittedPoint=None,
        startBinding=None,
        endBinding=None,
        startArrowhead=None,
        endArrowhead=end_arrowhead,
        elbowed=False,
    )


def read_json(path: Path, label: str) -> Any:
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise DiagramError("Unable to read {0} '{1}': {2}".format(label, path, exc)) from exc

    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise DiagramError(
            "Unable to parse {0} '{1}' as JSON: {2}".format(label, path, exc)
        ) from exc


def load_spec(path: Path) -> Dict[str, Any]:
    data = read_json(path, "spec")
    if not isinstance(data, dict):
        raise DiagramError("Spec '{0}' must be a JSON object.".format(path))
    return data


def load_existing_diagram(path: Path) -> Dict[str, Any]:
    data = read_json(path, "input diagram")
    if not isinstance(data, dict):
        raise DiagramError("Existing diagram '{0}' must be a JSON object.".format(path))
    elements = data.get("elements")
    if not isinstance(elements, list):
        raise DiagramError("Existing diagram '{0}' is missing a valid 'elements' list.".format(path))
    app_state = data.get("appState", {})
    if not isinstance(app_state, dict):
        raise DiagramError("Existing diagram '{0}' has an invalid 'appState' object.".format(path))
    files = data.get("files", {})
    if not isinstance(files, dict):
        raise DiagramError("Existing diagram '{0}' has an invalid 'files' object.".format(path))
    return data


def normalize_title(title: Optional[str], spec: Dict[str, Any]) -> Optional[str]:
    if title:
        return str(title)
    if isinstance(spec.get("title"), str) and spec["title"].strip():
        return spec["title"].strip()
    return None


def make_title_element(title: str, elements: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    if elements:
        min_x = min(float(element.get("x", 0)) for element in elements)
        min_y = min(float(element.get("y", 0)) for element in elements)
        title_x = min_x
        title_y = min_y - 110
    else:
        title_x = 0
        title_y = 0
    return make_text("diagram-title", title, title_x, title_y, font_size=30, color="#111827", text_align="left")


def append_title(elements: List[Dict[str, Any]], title: Optional[str]) -> List[Dict[str, Any]]:
    if not title:
        return elements
    return [make_title_element(title, elements)] + elements


def default_document(title: Optional[str] = None) -> Dict[str, Any]:
    app_state = {
        "gridSize": None,
        "viewBackgroundColor": "#ffffff",
        "theme": "light",
        "zoom": {"value": 1},
        "currentItemFontFamily": 1,
        "currentItemFontSize": 20,
    }
    if title:
        app_state["name"] = title
    return {
        "type": "excalidraw",
        "version": 2,
        "source": EXCALIDRAW_SOURCE,
        "elements": [],
        "appState": app_state,
        "files": {},
    }


def normalize_node(item: Any, index: int, fallback_prefix: str = "node") -> Dict[str, Any]:
    if isinstance(item, str):
        label = item
        item = {"label": item}
    elif not isinstance(item, dict):
        raise DiagramError("Node entry #{0} must be a string or object.".format(index + 1))
    else:
        label = str(item.get("label") or item.get("text") or item.get("title") or "Node {0}".format(index + 1))

    node_id = str(item.get("id") or slugify(label) or "{0}-{1}".format(fallback_prefix, index + 1))
    shape = str(item.get("shape") or item.get("kind") or item.get("type") or "rectangle").lower()
    return {
        "id": node_id,
        "label": label,
        "shape": shape,
        "width": coerce_int(item.get("width", 220), "nodes[{0}].width".format(index), default=220),
        "height": coerce_int(item.get("height", 120), "nodes[{0}].height".format(index), default=120),
        "x": optional_float(item.get("x"), "nodes[{0}].x".format(index)),
        "y": optional_float(item.get("y"), "nodes[{0}].y".format(index)),
        "row": optional_int(item.get("row"), "nodes[{0}].row".format(index)),
        "column": item.get("column"),
        "group": item.get("group") or item.get("lane") or item.get("layer"),
        "stroke": item.get("stroke"),
        "fill": item.get("fill"),
    }


def normalize_edge(item: Any, index: int) -> Dict[str, Any]:
    if isinstance(item, dict):
        source = item.get("from") or item.get("source")
        target = item.get("to") or item.get("target")
        label = item.get("label")
    elif isinstance(item, (list, tuple)) and len(item) >= 2:
        source, target = item[0], item[1]
        label = item[2] if len(item) > 2 else None
    else:
        raise DiagramError("Edge entry #{0} must be an object or [from, to, label?].".format(index + 1))

    if not source or not target:
        raise DiagramError("Edge entry #{0} must include both source and target ids.".format(index + 1))

    return {
        "from": str(source),
        "to": str(target),
        "label": str(label) if label not in (None, "") else None,
    }


def build_connections(
    edges: Sequence[Dict[str, Any]],
    node_map: Dict[str, Dict[str, Any]],
    prefix: str,
    color: str = DEFAULT_STROKE,
) -> List[Dict[str, Any]]:
    elements: List[Dict[str, Any]] = []
    for index, edge in enumerate(edges):
        source = node_map.get(edge["from"])
        target = node_map.get(edge["to"])
        if source is None or target is None:
            raise DiagramError(
                "Edge '{0} -> {1}' references an unknown node.".format(edge["from"], edge["to"])
            )
        start_x, start_y = center_of(source)
        end_x, end_y = center_of(target)
        arrow = make_arrow(
            key="{0}-edge-{1}-{2}".format(prefix, edge["from"], edge["to"]),
            x1=start_x,
            y1=start_y,
            x2=end_x,
            y2=end_y,
            color=color,
        )
        elements.append(arrow)
        if edge.get("label"):
            label_x = (start_x + end_x) / 2.0
            label_y = (start_y + end_y) / 2.0 - 24
            elements.append(
                make_centered_text(
                    key="{0}-edge-label-{1}".format(prefix, index),
                    text=edge["label"],
                    center_x=label_x,
                    center_y=label_y,
                    font_size=16,
                    color=color,
                )
            )
    return elements


def build_architecture(spec: Dict[str, Any]) -> List[Dict[str, Any]]:
    raw_nodes = as_list(spec.get("nodes") or spec.get("services") or spec.get("components"))
    raw_edges = as_list(spec.get("edges") or spec.get("connections"))
    nodes = [normalize_node(item, index, fallback_prefix="architecture") for index, item in enumerate(raw_nodes)]
    edges = [normalize_edge(item, index) for index, item in enumerate(raw_edges)]

    columns: List[str] = []
    explicit_columns = as_list(spec.get("columns"))
    for item in explicit_columns:
        if isinstance(item, dict) and item.get("id"):
            columns.append(str(item["id"]))
        elif isinstance(item, str):
            columns.append(item)
    for node in nodes:
        group = node.get("column") or node.get("group")
        if group is not None:
            group_text = str(group)
            if group_text not in columns:
                columns.append(group_text)

    column_counts: Dict[str, int] = {}
    for index, node in enumerate(nodes):
        if node["x"] is None:
            if columns:
                group = str(node.get("column") or node.get("group") or columns[index % len(columns)])
                column_index = columns.index(group)
                row_index = node["row"] if node["row"] is not None else column_counts.get(group, 0)
                column_counts[group] = max(column_counts.get(group, 0), row_index + 1)
                node["x"] = column_index * 320
                node["y"] = row_index * 190
            else:
                grid_columns = 3
                column_index = index % grid_columns
                row_index = index // grid_columns
                node["x"] = column_index * 320
                node["y"] = row_index * 190
        if node["y"] is None:
            node["y"] = 0

    elements: List[Dict[str, Any]] = []
    node_map: Dict[str, Dict[str, Any]] = {}

    for node in nodes:
        node_bounds = {
            "x": coerce_float(node["x"], "architecture node '{0}'.x".format(node["id"])),
            "y": coerce_float(node["y"], "architecture node '{0}'.y".format(node["id"])),
            "width": coerce_float(node["width"], "architecture node '{0}'.width".format(node["id"])),
            "height": coerce_float(node["height"], "architecture node '{0}'.height".format(node["id"])),
        }
        node_map[node["id"]] = node_bounds
        shape = make_shape(
            shape_type=node["shape"],
            key="architecture-shape-{0}".format(node["id"]),
            x=node_bounds["x"],
            y=node_bounds["y"],
            width=node_bounds["width"],
            height=node_bounds["height"],
            stroke=node.get("stroke") or "#264653",
            fill=node.get("fill") or "#e9f5f2",
        )
        label = make_centered_text(
            key="architecture-label-{0}".format(node["id"]),
            text=node["label"],
            center_x=node_bounds["x"] + (node_bounds["width"] / 2.0),
            center_y=node_bounds["y"] + (node_bounds["height"] / 2.0),
            font_size=18,
            color="#102a43",
        )
        elements.extend([shape, label])

    for column_index, column in enumerate(columns):
        elements.append(
            make_text(
                key="architecture-column-{0}".format(column),
                text=str(column),
                x=(column_index * 320),
                y=-70,
                font_size=18,
                color="#3d5a80",
                text_align="left",
            )
        )

    elements.extend(build_connections(edges, node_map, prefix="architecture", color="#264653"))
    return elements


def flowchart_shape(step_type: str) -> str:
    normalized = step_type.lower()
    if normalized in ("start", "end", "terminator"):
        return "ellipse"
    if normalized in ("decision", "branch"):
        return "diamond"
    return "rectangle"


def build_flowchart(spec: Dict[str, Any]) -> List[Dict[str, Any]]:
    raw_steps = as_list(spec.get("steps") or spec.get("nodes"))
    raw_edges = as_list(spec.get("edges") or spec.get("connections"))
    steps = [normalize_node(item, index, fallback_prefix="flow") for index, item in enumerate(raw_steps)]
    edges = [normalize_edge(item, index) for index, item in enumerate(raw_edges)]

    branch_columns: List[str] = []
    for step in steps:
        branch = step.get("column") or step.get("group")
        if branch is not None:
            branch_text = str(branch)
            if branch_text not in branch_columns:
                branch_columns.append(branch_text)

    branch_counts: Dict[str, int] = {}
    for index, step in enumerate(steps):
        if step["x"] is None:
            if branch_columns:
                branch = str(step.get("column") or step.get("group") or branch_columns[0])
                column_index = branch_columns.index(branch)
                row_index = step["row"] if step["row"] is not None else branch_counts.get(branch, 0)
                branch_counts[branch] = max(branch_counts.get(branch, 0), row_index + 1)
                step["x"] = column_index * 300
                step["y"] = row_index * 180
            else:
                step["x"] = 0
                step["y"] = index * 180
        if step["y"] is None:
            step["y"] = index * 180

    elements: List[Dict[str, Any]] = []
    node_map: Dict[str, Dict[str, Any]] = {}

    for step in steps:
        node_bounds = {
            "x": coerce_float(step["x"], "flowchart step '{0}'.x".format(step["id"])),
            "y": coerce_float(step["y"], "flowchart step '{0}'.y".format(step["id"])),
            "width": coerce_float(step["width"], "flowchart step '{0}'.width".format(step["id"])),
            "height": coerce_float(step["height"], "flowchart step '{0}'.height".format(step["id"])),
        }
        node_map[step["id"]] = node_bounds
        shape = make_shape(
            shape_type=flowchart_shape(step["shape"]),
            key="flowchart-shape-{0}".format(step["id"]),
            x=node_bounds["x"],
            y=node_bounds["y"],
            width=node_bounds["width"],
            height=node_bounds["height"],
            stroke=step.get("stroke") or "#7c2d12",
            fill=step.get("fill") or "#fff3e0",
        )
        label = make_centered_text(
            key="flowchart-label-{0}".format(step["id"]),
            text=step["label"],
            center_x=node_bounds["x"] + (node_bounds["width"] / 2.0),
            center_y=node_bounds["y"] + (node_bounds["height"] / 2.0),
            font_size=18,
            color="#7c2d12",
        )
        elements.extend([shape, label])

    elements.extend(build_connections(edges, node_map, prefix="flowchart", color="#9a3412"))
    return elements


def normalize_tree_node(item: Any, fallback_label: str) -> Dict[str, Any]:
    if isinstance(item, str):
        return {"id": slugify(item), "label": item, "children": [], "side": None}
    if not isinstance(item, dict):
        raise DiagramError("Mindmap nodes must be strings or objects.")

    label = str(item.get("label") or item.get("text") or item.get("title") or fallback_label)
    children_source = item.get("children")
    if children_source is None:
        children_source = item.get("branches")

    children = [normalize_tree_node(child, "Topic") for child in as_list(children_source)]
    return {
        "id": str(item.get("id") or slugify(label)),
        "label": label,
        "children": children,
        "side": item.get("side"),
    }


def leaf_count(node: Dict[str, Any]) -> int:
    children = node.get("children") or []
    if not children:
        return 1
    return sum(leaf_count(child) for child in children)


def build_mindmap(spec: Dict[str, Any]) -> List[Dict[str, Any]]:
    root_source = spec.get("root")
    if root_source is None:
        root_source = {
            "label": spec.get("title") or "Central Topic",
            "children": spec.get("branches") or spec.get("children") or [],
        }
    root = normalize_tree_node(root_source, "Central Topic")

    placements: Dict[str, Dict[str, Any]] = {}
    connections: List[Tuple[str, str]] = []

    root_width = 240
    root_height = 100
    placements[root["id"]] = {"x": -120.0, "y": -50.0, "width": root_width, "height": root_height}

    right_children: List[Dict[str, Any]] = []
    left_children: List[Dict[str, Any]] = []
    for index, child in enumerate(root["children"]):
        side = str(child.get("side") or "").lower()
        if side == "left":
            left_children.append(child)
        elif side == "right":
            right_children.append(child)
        elif index % 2 == 0:
            right_children.append(child)
        else:
            left_children.append(child)

    def place_branch(
        children: Sequence[Dict[str, Any]],
        parent_id: str,
        direction: int,
        depth: int,
        top_y: float,
    ) -> None:
        cursor = top_y
        for child in children:
            span = leaf_count(child) * 120.0
            center_y = cursor + (span / 2.0)
            width = 210
            height = 80
            center_x = direction * (150 + (depth * 220))
            placements[child["id"]] = {
                "x": center_x - (width / 2.0),
                "y": center_y - (height / 2.0),
                "width": width,
                "height": height,
            }
            connections.append((parent_id, child["id"]))
            child_direction = direction
            side_value = str(child.get("side") or "").lower()
            if side_value == "left":
                child_direction = -1
            elif side_value == "right":
                child_direction = 1

            child_span = leaf_count(child) * 120.0
            if child["children"]:
                place_branch(
                    child["children"],
                    parent_id=child["id"],
                    direction=child_direction,
                    depth=depth + 1,
                    top_y=center_y - (child_span / 2.0),
                )
            cursor += span

    right_span = sum(leaf_count(child) for child in right_children) * 120.0
    left_span = sum(leaf_count(child) for child in left_children) * 120.0
    place_branch(right_children, parent_id=root["id"], direction=1, depth=1, top_y=-(right_span / 2.0))
    place_branch(left_children, parent_id=root["id"], direction=-1, depth=1, top_y=-(left_span / 2.0))

    elements: List[Dict[str, Any]] = []

    def walk(node: Dict[str, Any], is_root: bool = False) -> None:
        bounds = placements[node["id"]]
        shape = make_shape(
            shape_type="ellipse" if is_root else "rectangle",
            key="mindmap-shape-{0}".format(node["id"]),
            x=bounds["x"],
            y=bounds["y"],
            width=bounds["width"],
            height=bounds["height"],
            stroke="#4c1d95" if is_root else "#1d4ed8",
            fill="#ede9fe" if is_root else "#dbeafe",
        )
        label = make_centered_text(
            key="mindmap-label-{0}".format(node["id"]),
            text=node["label"],
            center_x=bounds["x"] + (bounds["width"] / 2.0),
            center_y=bounds["y"] + (bounds["height"] / 2.0),
            font_size=20 if is_root else 18,
            color="#1e1b4b" if is_root else "#1e3a8a",
        )
        elements.extend([shape, label])
        for child in node["children"]:
            walk(child, is_root=False)

    walk(root, is_root=True)

    node_map = {
        node_id: {
            "x": bounds["x"],
            "y": bounds["y"],
            "width": bounds["width"],
            "height": bounds["height"],
        }
        for node_id, bounds in placements.items()
    }
    connection_edges = [{"from": parent_id, "to": child_id, "label": None} for parent_id, child_id in connections]
    elements.extend(build_connections(connection_edges, node_map, prefix="mindmap", color="#4338ca"))
    return elements


def normalize_whiteboard_item(item: Any, index: int) -> Dict[str, Any]:
    if isinstance(item, str):
        item = {"type": "sticky", "label": item}
    elif not isinstance(item, dict):
        raise DiagramError("Whiteboard item #{0} must be a string or object.".format(index + 1))

    item_type = str(item.get("type") or item.get("kind") or "sticky").lower()
    default_label = "" if item_type in ("arrow", "connector", "link") else "Item {0}".format(index + 1)
    label = str(item.get("label") or item.get("text") or item.get("title") or default_label)
    item_id = str(item.get("id") or slugify(label) or "whiteboard-{0}".format(index + 1))
    return {
        "id": item_id,
        "type": item_type,
        "label": label,
        "x": optional_float(item.get("x"), "items[{0}].x".format(index)),
        "y": optional_float(item.get("y"), "items[{0}].y".format(index)),
        "width": coerce_int(item.get("width", 220), "items[{0}].width".format(index), default=220),
        "height": coerce_int(item.get("height", 130), "items[{0}].height".format(index), default=130),
        "from": item.get("from"),
        "to": item.get("to"),
        "stroke": item.get("stroke"),
        "fill": item.get("fill"),
        "points": item.get("points"),
        "x1": optional_float(item.get("x1"), "items[{0}].x1".format(index)),
        "y1": optional_float(item.get("y1"), "items[{0}].y1".format(index)),
        "x2": optional_float(item.get("x2"), "items[{0}].x2".format(index)),
        "y2": optional_float(item.get("y2"), "items[{0}].y2".format(index)),
    }


def build_whiteboard(spec: Dict[str, Any]) -> List[Dict[str, Any]]:
    raw_items = as_list(spec.get("items") or spec.get("elements"))
    items = [normalize_whiteboard_item(item, index) for index, item in enumerate(raw_items)]

    placements: Dict[str, Dict[str, Any]] = {}
    elements: List[Dict[str, Any]] = []
    grid_index = 0

    for item in items:
        if item["type"] in ("arrow", "connector", "link"):
            continue

        width = coerce_float(item["width"], "whiteboard item '{0}'.width".format(item["id"]))
        height = coerce_float(item["height"], "whiteboard item '{0}'.height".format(item["id"]))
        x = item["x"]
        y = item["y"]
        if x is None or y is None:
            column = grid_index % 3
            row = grid_index // 3
            x = column * 260
            y = row * 190
            grid_index += 1
        bounds = {"x": float(x), "y": float(y), "width": width, "height": height}
        placements[item["id"]] = bounds

        if item["type"] in ("text", "label"):
            elements.append(
                make_text(
                    "whiteboard-text-{0}".format(item["id"]),
                    item["label"],
                    bounds["x"],
                    bounds["y"],
                    font_size=18,
                    color="#111827",
                    text_align="left",
                )
            )
            continue

        if item["type"] in ("circle", "ellipse"):
            shape_type = "ellipse"
            fill = item.get("fill") or "#fde68a"
        else:
            shape_type = "rectangle"
            fill = item.get("fill") or ("#fef3c7" if item["type"] in ("sticky", "note") else "#e5e7eb")

        elements.append(
            make_shape(
                shape_type=shape_type,
                key="whiteboard-shape-{0}".format(item["id"]),
                x=bounds["x"],
                y=bounds["y"],
                width=bounds["width"],
                height=bounds["height"],
                stroke=item.get("stroke") or "#374151",
                fill=fill,
            )
        )
        elements.append(
            make_centered_text(
                key="whiteboard-label-{0}".format(item["id"]),
                text=item["label"],
                center_x=bounds["x"] + (bounds["width"] / 2.0),
                center_y=bounds["y"] + (bounds["height"] / 2.0),
                font_size=18,
                color="#111827",
            )
        )

    for item in items:
        if item["type"] not in ("arrow", "connector", "link"):
            continue

        if item.get("from") and item.get("to"):
            source = placements.get(str(item["from"]))
            target = placements.get(str(item["to"]))
            if source is None or target is None:
                raise DiagramError(
                    "Whiteboard connector '{0}' references an unknown item.".format(item["id"])
                )
            x1, y1 = center_of(source)
            x2, y2 = center_of(target)
        elif item.get("points") and isinstance(item["points"], list) and len(item["points"]) >= 2:
            first = item["points"][0]
            last = item["points"][-1]
            if not (isinstance(first, list) and isinstance(last, list) and len(first) >= 2 and len(last) >= 2):
                raise DiagramError("Whiteboard connector '{0}' has invalid point data.".format(item["id"]))
            x1 = coerce_float(first[0], "connector '{0}'.points[0][0]".format(item["id"]))
            y1 = coerce_float(first[1], "connector '{0}'.points[0][1]".format(item["id"]))
            x2 = coerce_float(last[0], "connector '{0}'.points[-1][0]".format(item["id"]))
            y2 = coerce_float(last[1], "connector '{0}'.points[-1][1]".format(item["id"]))
        elif None not in (item.get("x1"), item.get("y1"), item.get("x2"), item.get("y2")):
            x1 = coerce_float(item["x1"], "connector '{0}'.x1".format(item["id"]))
            y1 = coerce_float(item["y1"], "connector '{0}'.y1".format(item["id"]))
            x2 = coerce_float(item["x2"], "connector '{0}'.x2".format(item["id"]))
            y2 = coerce_float(item["y2"], "connector '{0}'.y2".format(item["id"]))
        else:
            raise DiagramError(
                "Whiteboard connector '{0}' must define from/to ids, points, or x1/y1/x2/y2.".format(item["id"])
            )

        elements.append(
            make_arrow(
                key="whiteboard-arrow-{0}".format(item["id"]),
                x1=x1,
                y1=y1,
                x2=x2,
                y2=y2,
                color=item.get("stroke") or "#374151",
            )
        )
        if item["label"]:
            elements.append(
                make_centered_text(
                    key="whiteboard-arrow-label-{0}".format(item["id"]),
                    text=item["label"],
                    center_x=(x1 + x2) / 2.0,
                    center_y=((y1 + y2) / 2.0) - 20,
                    font_size=16,
                    color="#374151",
                )
            )

    return elements


BUILDERS = {
    "architecture": build_architecture,
    "flowchart": build_flowchart,
    "mindmap": build_mindmap,
    "whiteboard": build_whiteboard,
}


def tag_generated_elements(mode: str, elements: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    tagged: List[Dict[str, Any]] = []
    for element in elements:
        tagged_element = dict(element)
        custom_data = tagged_element.get("customData")
        if not isinstance(custom_data, dict):
            custom_data = {}
        else:
            custom_data = dict(custom_data)
        custom_data["generatorFamily"] = GENERATOR_FAMILY
        custom_data["generatorMode"] = mode
        tagged_element["customData"] = custom_data
        tagged.append(tagged_element)
    return tagged


def is_legacy_generated_element(element: Dict[str, Any]) -> bool:
    element_id = element.get("id")
    element_type = element.get("type")
    if not isinstance(element_id, str) or not LEGACY_GENERATED_ID_RE.match(element_id):
        return False
    if element_type not in ("rectangle", "ellipse", "diamond", "text", "arrow"):
        return False

    common_expectations = {
        "angle": 0,
        "fillStyle": "solid",
        "strokeStyle": "solid",
        "roughness": 0,
        "opacity": 100,
        "groupIds": [],
        "version": 1,
        "isDeleted": False,
        "updated": 0,
        "link": None,
        "locked": False,
    }
    for field, expected in common_expectations.items():
        if element.get(field) != expected:
            return False

    if element_type == "text":
        return (
            element.get("strokeWidth") == 1
            and element.get("backgroundColor") == "transparent"
            and element.get("fontFamily") == 1
            and element.get("verticalAlign") == "middle"
            and element.get("containerId") is None
            and element.get("originalText") == element.get("text")
            and element.get("lineHeight") == 1.25
            and element.get("autoResize") is True
        )

    if element_type == "arrow":
        points = element.get("points")
        return (
            element.get("strokeWidth") == 2
            and element.get("backgroundColor") == "transparent"
            and isinstance(points, list)
            and len(points) == 2
            and element.get("lastCommittedPoint") is None
            and element.get("startBinding") is None
            and element.get("endBinding") is None
            and element.get("startArrowhead") is None
            and element.get("endArrowhead") == "triangle"
            and element.get("elbowed") is False
        )

    return element.get("strokeWidth") == 2


def find_stale_generated_ids(
    existing_elements: Sequence[Dict[str, Any]],
    app_state: Dict[str, Any],
) -> Set[str]:
    stale_ids = set()
    generator_state = app_state.get(GENERATOR_STATE_KEY)
    if isinstance(generator_state, dict) and generator_state.get("family") == GENERATOR_FAMILY:
        for element_id in as_list(generator_state.get("generatedElementIds")):
            if isinstance(element_id, str) and element_id:
                stale_ids.add(element_id)

    for element in existing_elements:
        if not isinstance(element, dict):
            raise DiagramError("Existing diagram contains an invalid element entry.")
        custom_data = element.get("customData")
        if not isinstance(custom_data, dict):
            custom_data = None
        if isinstance(custom_data, dict) and custom_data.get("generatorFamily") == GENERATOR_FAMILY and isinstance(element.get("id"), str):
            stale_ids.add(element["id"])

    legacy_generated_ids = {
        element["id"]
        for element in existing_elements
        if isinstance(element, dict) and isinstance(element.get("id"), str) and is_legacy_generated_element(element)
    }
    if legacy_generated_ids:
        stale_ids.update(legacy_generated_ids)
    return stale_ids


def merge_elements(
    existing: Sequence[Dict[str, Any]],
    generated: Sequence[Dict[str, Any]],
    stale_generated_ids: Sequence[str],
) -> List[Dict[str, Any]]:
    generated_ids = {element.get("id") for element in generated}
    stale_ids = set(stale_generated_ids)
    merged = []
    for element in existing:
        if not isinstance(element, dict):
            raise DiagramError("Existing diagram contains an invalid element entry.")
        element_id = element.get("id")
        if element_id in stale_ids or element_id in generated_ids:
            continue
        merged.append(element)
    merged.extend(generated)
    return merged


def create_or_update_document(
    mode: str,
    spec: Dict[str, Any],
    title: Optional[str],
    existing: Optional[Dict[str, Any]],
    rewrite: bool,
) -> Dict[str, Any]:
    builder = BUILDERS[mode]
    generated_elements = tag_generated_elements(mode, append_title(builder(spec), title))

    if existing is None:
        document = default_document(title)
        document["elements"] = generated_elements
        document["appState"][GENERATOR_STATE_KEY] = {
            "family": GENERATOR_FAMILY,
            "mode": mode,
            "generatedElementIds": [element["id"] for element in generated_elements],
        }
        return document

    document = dict(existing)
    document["type"] = "excalidraw"
    document["version"] = 2
    document["source"] = EXCALIDRAW_SOURCE

    app_state = existing.get("appState", {})
    if not isinstance(app_state, dict):
        raise DiagramError("Existing diagram has an invalid 'appState' object.")
    app_state = dict(app_state)
    app_state.setdefault("gridSize", None)
    app_state.setdefault("viewBackgroundColor", "#ffffff")
    app_state.setdefault("theme", "light")
    app_state.setdefault("zoom", {"value": 1})
    if title:
        app_state["name"] = title
    document["appState"] = app_state

    files = existing.get("files", {})
    if not isinstance(files, dict):
        raise DiagramError("Existing diagram has an invalid 'files' object.")
    document["files"] = files

    existing_elements = existing.get("elements", [])
    if not isinstance(existing_elements, list):
        raise DiagramError("Existing diagram has an invalid 'elements' list.")

    if rewrite:
        document["elements"] = generated_elements
    else:
        stale_generated_ids = find_stale_generated_ids(existing_elements, app_state)
        document["elements"] = merge_elements(existing_elements, generated_elements, stale_generated_ids)
    app_state[GENERATOR_STATE_KEY] = {
        "family": GENERATOR_FAMILY,
        "mode": mode,
        "generatedElementIds": [element["id"] for element in generated_elements],
    }
    return document


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create or edit Excalidraw diagram files from JSON specs.")
    parser.add_argument("--mode", required=True, choices=MODE_CHOICES, help="Diagram layout mode.")
    parser.add_argument("--output", required=True, help="Output .excalidraw file path.")
    parser.add_argument("--input", help="Existing .excalidraw file to update.")
    parser.add_argument("--title", help="Optional title rendered into the diagram.")
    parser.add_argument("--rewrite", action="store_true", help="Replace existing generated content instead of merging.")
    parser.add_argument("--spec", required=True, help="Path to a JSON diagram spec.")
    return parser.parse_args(argv)


def write_document(path: Path, document: Dict[str, Any]) -> None:
    temp_path: Optional[Path] = None
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        serialized = json.dumps(document, indent=2) + "\n"
        with tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            dir=str(path.parent),
            prefix=path.name + ".",
            suffix=".tmp",
            delete=False,
        ) as handle:
            temp_path = Path(handle.name)
            handle.write(serialized)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, path)
    except OSError as exc:
        if temp_path is not None:
            try:
                if temp_path.exists():
                    temp_path.unlink()
            except OSError:
                pass
        raise DiagramError("Unable to write output '{0}': {1}".format(path, exc)) from exc


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    spec_path = Path(args.spec).expanduser()
    output_path = Path(args.output).expanduser()
    input_path = Path(args.input).expanduser() if args.input else None

    try:
        spec = load_spec(spec_path)
        existing = load_existing_diagram(input_path) if input_path else None
        title = normalize_title(args.title, spec)
        document = create_or_update_document(
            mode=args.mode,
            spec=spec,
            title=title,
            existing=existing,
            rewrite=args.rewrite,
        )
        write_document(output_path, document)
    except DiagramError as exc:
        print("Error: {0}".format(exc), file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
