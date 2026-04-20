#!/usr/bin/env python3
"""Validate and summarize the canonical MAP2 project worklist."""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path


ID_PATTERN = re.compile(r"^ID:\s+(?P<id>T\d+(?:-sub[A-Z])*)\s*$")
STATUS_PATTERN = re.compile(r"^Status:\s+\[(?P<marker>[ >✓✗~])\]\s+(?P<label>.+?)\s*$")

OPEN_STATUS_LABELS = {"Todo", "In Progress", "Blocked"}


@dataclass(frozen=True)
class WorklistTask:
    task_id: str
    line_number: int
    status: str | None = None
    title: str | None = None


def parse_worklist(text: str) -> list[WorklistTask]:
    tasks: list[WorklistTask] = []
    current_id: str | None = None
    current_line = 0
    current_status: str | None = None
    current_title: str | None = None

    def flush_current() -> None:
        if current_id is None:
            return
        tasks.append(
            WorklistTask(
                task_id=current_id,
                line_number=current_line,
                status=current_status,
                title=current_title,
            )
        )

    for line_number, line in enumerate(text.splitlines(), start=1):
        id_match = ID_PATTERN.match(line)
        if id_match:
            flush_current()
            current_id = id_match.group("id")
            current_line = line_number
            current_status = None
            current_title = None
            continue

        if current_id is None:
            continue

        if current_status is None:
            status_match = STATUS_PATTERN.match(line)
            if status_match:
                current_status = status_match.group("label")
                continue

        if current_title is None and line.startswith("Title: "):
            current_title = line.removeprefix("Title: ").strip()

    flush_current()
    return tasks


def find_duplicate_ids(tasks: list[WorklistTask]) -> list[str]:
    first_lines: dict[str, int] = {}
    duplicate_errors: list[str] = []
    for task in tasks:
        first_line = first_lines.setdefault(task.task_id, task.line_number)
        if first_line != task.line_number:
            duplicate_errors.append(
                f"{task.task_id} appears at lines {first_line} and {task.line_number}"
            )
    return duplicate_errors


def open_tasks(tasks: list[WorklistTask]) -> list[WorklistTask]:
    return [task for task in tasks if task.status in OPEN_STATUS_LABELS]


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "worklist",
        nargs="?",
        default="docs/PROJECT_WORKLIST.md",
        type=Path,
        help="Path to the canonical project worklist.",
    )
    parser.add_argument(
        "--open",
        action="store_true",
        help="Print Todo, In Progress, and Blocked tasks once each.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    worklist_path: Path = args.worklist
    tasks = parse_worklist(worklist_path.read_text(encoding="utf-8"))
    duplicate_errors = find_duplicate_ids(tasks)
    if duplicate_errors:
        for error in duplicate_errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1

    if args.open:
        for task in open_tasks(tasks):
            title = task.title or "<missing title>"
            print(f"{task.task_id} | {task.status} | {title}")
        return 0

    print(f"OK: {len(tasks)} task IDs are unique in {worklist_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
