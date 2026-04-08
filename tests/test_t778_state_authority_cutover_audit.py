from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = REPO_ROOT / "scripts" / "run_t778_state_authority_cutover_audit.py"


def test_t778_state_authority_cutover_audit_reports_fresh_start_table_posture(tmp_path):
    output_dir = tmp_path / "cutover-audit"
    result = subprocess.run(
        [sys.executable, str(SCRIPT_PATH), "--output-dir", str(output_dir)],
        check=True,
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )

    stdout_payload = json.loads(result.stdout.strip())
    report = json.loads(
        (output_dir / "t778-state-authority-cutover-report.json").read_text(encoding="utf-8")
    )

    assert stdout_payload["retirement_status"] == "blocked"
    assert Path(stdout_payload["json_report"]).exists()
    assert Path(stdout_payload["markdown_report"]).exists()

    assert report["core_state_authority_tables"]["missing"] == []
    assert report["support_tables"]["missing"] == []
    assert report["retired_tables"]["present"] == []
    assert report["retired_tables"]["absent"] == ["snapshot_session_notes"]
    assert report["compatibility_projection_tables"]["present"] == [
        "snapshot_chain_plugins",
        "snapshot_chains",
        "snapshot_channels",
        "snapshot_loop_insertions",
        "snapshot_midi_maps",
        "snapshot_routing",
    ]
    assert report["fresh_start_cutover"]["retirement_status"] == "blocked"
    assert any(
        "compatibility projection tables remain present" in blocker
        for blocker in report["fresh_start_cutover"]["retirement_blockers"]
    )
