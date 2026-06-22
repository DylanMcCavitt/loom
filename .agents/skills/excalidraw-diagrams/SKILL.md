---
name: excalidraw-diagrams
description: Create and edit Obsidian Excalidraw diagram files directly. Use when the user wants a diagram, flowchart, architecture diagram, mindmap, or whiteboard saved as a `.excalidraw` file rather than a Markdown note.
---

# Excalidraw Diagrams

## Overview
Use this skill when the user wants a diagram file, not a note. Target the Obsidian Excalidraw plugin format directly.

## Workflow
1. Determine whether the request is for a new diagram or an edit to an existing `.excalidraw` file.
2. If no output path is provided, ask where to save the diagram.
3. Infer the closest mode from the request: `architecture`, `flowchart`, `mindmap`, or `whiteboard`.
4. Convert the request into a structured input for the script with at least: mode, title, labels/nodes, relationships/connectors, optional grouping or sections, and layout intent.
5. Run `scripts/excalidraw_diagram.py` to create or update the file.
6. Report the resulting file path.

## Defaults
- Default to polished layouts with stable spacing, readable labels, low edge crossings, and consistent alignment.
- Optimize for legibility over density.
- If an existing `.excalidraw` file is missing, malformed, or unsupported, stop and ask before making replacement changes.
- Preserve existing content on edit unless the user clearly requests a rewrite, and avoid destructive normalization by default.
- If the output path already exists, avoid overwriting it unless the user explicitly requests a rewrite; prefer a deterministic non-destructive alternative such as a suffixed filename when a new file is being created.

## Script
Use `scripts/excalidraw_diagram.py` for file generation and editing. Do not hand-author large Excalidraw JSON when the script can do the work reliably.
