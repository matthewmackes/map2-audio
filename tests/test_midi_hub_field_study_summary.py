from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "summarize_midi_hub_field_study.py"


def write_participant(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def test_field_study_summary_collates_tasks_and_issues(tmp_path: Path) -> None:
    input_dir = tmp_path / "study"
    input_dir.mkdir()

    write_participant(
        input_dir / "participant-P01.json",
        {
            "participant_id": "P01",
            "participant_profile": {
                "role": "gigging_guitarist",
                "developer": False,
                "familiar_with_map2": False,
            },
            "tasks": [
                {
                    "task_id": "connect_device",
                    "title": "Connect a device and verify signal",
                    "success": True,
                    "completed_without_coaching": True,
                    "time_to_complete_seconds": 44,
                    "assists": [],
                    "confusion_points": [],
                },
                {
                    "task_id": "create_route",
                    "title": "Create a route",
                    "success": True,
                    "completed_without_coaching": False,
                    "time_to_complete_seconds": 92,
                    "assists": [{"type": "nudge"}],
                    "confusion_points": [{"area": "routing_matrix"}],
                },
            ],
            "issues": [
                {
                    "issue_key": "route-source-destination-ambiguity",
                    "summary": "Participant could not tell which side was source vs destination.",
                    "severity": "major",
                    "task_id": "create_route",
                    "recommendation": "Strengthen source and destination labeling.",
                }
            ],
        },
    )

    write_participant(
        input_dir / "participant-P02.json",
        {
            "participant_id": "P02",
            "participant_profile": {
                "role": "engineer",
                "developer": False,
                "familiar_with_map2": False,
            },
            "tasks": [
                {
                    "task_id": "connect_device",
                    "title": "Connect a device and verify signal",
                    "success": True,
                    "completed_without_coaching": True,
                    "time_to_complete_seconds": 31,
                    "assists": [],
                    "confusion_points": [],
                },
                {
                    "task_id": "create_route",
                    "title": "Create a route",
                    "success": False,
                    "completed_without_coaching": False,
                    "time_to_complete_seconds": 140,
                    "assists": [{"type": "intervention"}],
                    "confusion_points": [{"area": "patchbay"}, {"area": "legend"}],
                },
            ],
            "issues": [
                {
                    "issue_key": "route-source-destination-ambiguity",
                    "summary": "Participant could not tell which side was source vs destination.",
                    "severity": "major",
                    "task_id": "create_route",
                    "recommendation": "Strengthen source and destination labeling.",
                },
                {
                    "issue_key": "traffic-confirmation-too-subtle",
                    "summary": "Traffic confirmation was too subtle after connecting a device.",
                    "severity": "moderate",
                    "task_id": "connect_device",
                    "recommendation": "Increase visibility of signal confirmation states.",
                },
            ],
        },
    )

    output_json = tmp_path / "summary.json"
    output_md = tmp_path / "summary.md"

    completed = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--input-dir",
            str(input_dir),
            "--output-json",
            str(output_json),
            "--output-markdown",
            str(output_md),
        ],
        check=False,
        capture_output=True,
        text=True,
    )

    assert completed.returncode == 0, completed.stderr
    assert "Summarized 2 participant(s)" in completed.stdout

    summary = json.loads(output_json.read_text(encoding="utf-8"))
    assert summary["participant_count"] == 2
    assert summary["roles"] == {"engineer": 1, "gigging_guitarist": 1}
    assert summary["developer_mix"] == {"non_developer": 2}

    tasks = {task["task_id"]: task for task in summary["tasks"]}
    assert tasks["connect_device"]["success_count"] == 2
    assert tasks["create_route"]["success_count"] == 1
    assert tasks["create_route"]["coaching_free_count"] == 0
    assert tasks["create_route"]["assist_count"] == 2
    assert tasks["create_route"]["confusion_point_count"] == 3

    issues = {issue["issue_key"]: issue for issue in summary["issues"]}
    assert issues["route-source-destination-ambiguity"]["participant_count"] == 2
    assert issues["route-source-destination-ambiguity"]["severity"] == "major"
    assert issues["traffic-confirmation-too-subtle"]["severity"] == "moderate"

    markdown = output_md.read_text(encoding="utf-8")
    assert "# T102 Field Study Summary" in markdown
    assert "## Task Outcomes" in markdown
    assert "route-source-destination-ambiguity" in markdown
