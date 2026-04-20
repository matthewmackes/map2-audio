from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = REPO_ROOT / "scripts" / "validate_worklist.py"
WORKLIST_PATH = REPO_ROOT / "docs" / "PROJECT_WORKLIST.md"

spec = importlib.util.spec_from_file_location("validate_worklist", SCRIPT_PATH)
assert spec is not None
validate_worklist = importlib.util.module_from_spec(spec)
assert spec.loader is not None
sys.modules[spec.name] = validate_worklist
spec.loader.exec_module(validate_worklist)


def test_duplicate_id_validation_reports_both_lines() -> None:
    tasks = validate_worklist.parse_worklist(
        "\n".join(
            [
                "ID: T001",
                "Status: [✓] Done",
                "Title: First",
                "ID: T001",
                "Status: [ ] Todo",
                "Title: Second",
            ]
        )
    )

    assert validate_worklist.find_duplicate_ids(tasks) == [
        "T001 appears at lines 1 and 4"
    ]


def test_open_task_listing_does_not_duplicate_progress_notes() -> None:
    tasks = validate_worklist.parse_worklist(
        "\n".join(
            [
                "ID: T001",
                "Status: [✗] Blocked",
                "Title: Hardware gate",
                "Last updated: 2026-04-20 10:00 EDT - Codex",
                "- Blocked notes:",
                "  - Last updated: 2026-04-20 11:00 EDT - Codex: Still blocked.",
            ]
        )
    )

    open_tasks = validate_worklist.open_tasks(tasks)
    assert [task.task_id for task in open_tasks] == ["T001"]
    assert open_tasks[0].title == "Hardware gate"


def test_project_worklist_has_unique_task_ids() -> None:
    tasks = validate_worklist.parse_worklist(WORKLIST_PATH.read_text(encoding="utf-8"))

    assert validate_worklist.find_duplicate_ids(tasks) == []
