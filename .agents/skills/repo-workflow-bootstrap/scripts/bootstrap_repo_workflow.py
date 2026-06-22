#!/usr/bin/env python3
"""Scaffold repo-local workflow docs from the repo-workflow-bootstrap skill."""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List


SKILL_ROOT = Path(__file__).resolve().parent.parent
TEMPLATES_ROOT = SKILL_ROOT / "templates"


@dataclass(frozen=True)
class TemplateTarget:
    template_name: str
    relative_output_path: str


TEMPLATE_TARGETS: List[TemplateTarget] = [
    TemplateTarget("HANDOFF.md", "docs/HANDOFF.md"),
    TemplateTarget("NEXT_THREAD_HANDOFF.md", "docs/NEXT_THREAD_HANDOFF.md"),
    TemplateTarget("PLAN.md", "docs/PLAN.md"),
    TemplateTarget("AGENTS.md", "docs/AGENTS.md"),
    TemplateTarget("WORKFLOW.md", "docs/WORKFLOW.md"),
    TemplateTarget("ISSUE_TEMPLATE.md", "docs/issues/ISSUE_TEMPLATE.md"),
    TemplateTarget("pull_request_template.md", ".github/pull_request_template.md"),
]


class BootstrapError(RuntimeError):
    """Raised when the target repo or templates are invalid."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Scaffold repo-local workflow docs into a target repository."
    )
    parser.add_argument(
        "--repo",
        required=True,
        help="Absolute or relative path to the target repository root.",
    )
    parser.add_argument(
        "--project-name",
        help="Project name to replace the <Project> placeholder. Defaults to the repo directory name.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing target files instead of skipping them.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the planned writes without modifying the target repo.",
    )
    return parser.parse_args()


def ensure_repo_root(path: Path) -> Path:
    repo = path.expanduser().resolve()
    if not repo.exists():
        raise BootstrapError("Target repo does not exist: {0}".format(repo))
    if not repo.is_dir():
        raise BootstrapError("Target repo is not a directory: {0}".format(repo))
    if not (repo / ".git").exists():
        raise BootstrapError(
            "Target path is missing .git; point --repo at a real repository root: {0}".format(repo)
        )
    return repo


def render_template(template_text: str, project_name: str) -> str:
    return template_text.replace("<Project>", project_name)


def write_files(
    repo_root: Path,
    project_name: str,
    force: bool,
    dry_run: bool,
) -> List[str]:
    actions: List[str] = []
    for target in TEMPLATE_TARGETS:
        source_path = TEMPLATES_ROOT / target.template_name
        if not source_path.exists():
            raise BootstrapError("Missing template: {0}".format(source_path))

        output_path = repo_root / target.relative_output_path
        action = "write"
        if output_path.exists():
            if not force:
                actions.append("skip  {0}".format(output_path))
                continue
            action = "overwrite"

        rendered = render_template(source_path.read_text(encoding="utf-8"), project_name)
        actions.append("{0:9} {1}".format(action, output_path))
        if dry_run:
            continue

        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(rendered, encoding="utf-8")
    return actions


def main() -> int:
    args = parse_args()
    try:
        repo_root = ensure_repo_root(Path(args.repo))
        project_name = (args.project_name or repo_root.name).strip()
        if not project_name:
            raise BootstrapError("Project name cannot be empty.")
        actions = write_files(
            repo_root=repo_root,
            project_name=project_name,
            force=args.force,
            dry_run=args.dry_run,
        )
    except BootstrapError as exc:
        print("error: {0}".format(exc), file=sys.stderr)
        return 1

    mode_label = "dry-run" if args.dry_run else "applied"
    print("repo-workflow-bootstrap {0} for {1}".format(mode_label, repo_root))
    for line in actions:
        print(line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
