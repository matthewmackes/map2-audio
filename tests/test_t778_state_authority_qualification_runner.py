from __future__ import annotations

import json
import os
import stat
import subprocess
import sys
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "run_t778_state_authority_qualification.py"


def _write_executable(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IEXEC)


def _build_phase_command_script(tmp_path: Path) -> Path:
    script_path = tmp_path / "phase_command.py"
    _write_executable(
        script_path,
        """#!/usr/bin/env python3
import sys

phase = sys.argv[1]
mode = sys.argv[2]

print(f"{phase}:{mode}")
if mode == "pass":
    raise SystemExit(0)
if mode == "blocked":
    raise SystemExit(127)
raise SystemExit(5)
""",
    )
    return script_path


def test_t778_runner_records_all_passing_phases(tmp_path: Path) -> None:
    command_script = _build_phase_command_script(tmp_path)
    output_dir = tmp_path / "pass"
    command = f"{sys.executable} {command_script} phase pass"
    env = os.environ.copy()

    proc = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--output-dir",
            str(output_dir),
            "--phase1-command",
            command,
            "--phase2-command",
            command,
            "--phase3-command",
            command,
            "--phase4-command",
            command,
            "--phase5-command",
            command,
            "--phase6-command",
            command,
        ],
        check=False,
        capture_output=True,
        text=True,
        env=env,
    )

    assert proc.returncode == 0, proc.stderr
    summary = json.loads((output_dir / "t778-state-authority-qualification-summary.json").read_text(encoding="utf-8"))
    assert summary["overall_status"] == "PASS"
    assert summary["pass_count"] == 6
    assert summary["blocked_count"] == 0
    assert summary["fail_count"] == 0
    assert all(phase["status"] == "PASS" for phase in summary["phases"])
    markdown = (output_dir / "T778_STATE_AUTHORITY_QUALIFICATION_SUMMARY.md").read_text(encoding="utf-8")
    assert "Overall status: PASS" in markdown
    assert "Phase 3 is allowed to report skip hints" in markdown


def test_t778_runner_marks_missing_phase_command_as_blocked(tmp_path: Path) -> None:
    command_script = _build_phase_command_script(tmp_path)
    output_dir = tmp_path / "blocked"
    pass_command = f"{sys.executable} {command_script} phase pass"
    blocked_command = f"{sys.executable} {command_script} phase blocked"
    env = os.environ.copy()

    proc = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--output-dir",
            str(output_dir),
            "--phase1-command",
            pass_command,
            "--phase2-command",
            pass_command,
            "--phase3-command",
            blocked_command,
            "--phase4-command",
            pass_command,
            "--phase5-command",
            pass_command,
            "--phase6-command",
            pass_command,
        ],
        check=False,
        capture_output=True,
        text=True,
        env=env,
    )

    assert proc.returncode == 2, proc.stderr
    summary = json.loads((output_dir / "t778-state-authority-qualification-summary.json").read_text(encoding="utf-8"))
    assert summary["overall_status"] == "BLOCKED"
    assert summary["blocked_count"] == 1
    blocked_phase = next(phase for phase in summary["phases"] if phase["phase_id"] == "phase3")
    assert blocked_phase["status"] == "BLOCKED"
    assert blocked_phase["returncode"] == 127
