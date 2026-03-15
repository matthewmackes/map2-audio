from __future__ import annotations

import json
import os
import stat
import subprocess
import sys
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "run_t066_midi_hub_qualification.py"


def _write_executable(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IEXEC)


def _write_adapter_fixture(path: Path, overall_status: str, conclusion: str, exit_code: int) -> None:
    _write_executable(
        path,
        f"""#!/usr/bin/env python3
import json
import sys
from pathlib import Path

args = sys.argv[1:]
output_dir = Path(args[args.index("--output-dir") + 1])
output_dir.mkdir(parents=True, exist_ok=True)
summary = {{
    "task_id": "T066-subQ",
    "overall_status": {overall_status!r},
    "conclusion": {conclusion!r},
    "checks": {{
        "alsa_sequencer_access": {{"status": "PASS" if {overall_status!r} == "PASS" else "BLOCKED"}},
    }},
}}
(output_dir / "t066-usb-din-adapter-qualification.json").write_text(json.dumps(summary), encoding="utf-8")
print({conclusion!r})
raise SystemExit({exit_code})
""",
    )


def test_t066_qualification_runner_blocks_when_adapter_precheck_is_blocked(tmp_path: Path) -> None:
    adapter_script = tmp_path / "fake_adapter_blocked.py"
    _write_adapter_fixture(
        adapter_script,
        overall_status="BLOCKED",
        conclusion="Blocked: ALSA sequencer unavailable.",
        exit_code=2,
    )

    output_dir = tmp_path / "blocked"
    env = os.environ.copy()
    proc = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--output-dir",
            str(output_dir),
            "--regression-command",
            "python3 -c \"print('regression ok')\"",
            "--typecheck-command",
            "python3 -c \"print('typecheck ok')\"",
            "--adapter-precheck-script",
            str(adapter_script),
            "--perf-burst-count",
            "64",
            "--target-latency-per-hop-us",
            "1000000",
            "--target-throughput-msgs-per-sec",
            "1",
            "--required-soak-seconds",
            "0",
        ],
        check=False,
        capture_output=True,
        text=True,
        env=env,
    )

    assert proc.returncode == 2, proc.stderr
    summary = json.loads((output_dir / "t066-midi-hub-qualification-summary.json").read_text(encoding="utf-8"))
    assert summary["overall_status"] == "BLOCKED"
    assert summary["gates"]["software_regression"]["status"] == "PASS"
    assert summary["gates"]["frontend_typecheck"]["status"] == "PASS"
    assert summary["gates"]["performance_microbench"]["status"] == "PASS"
    assert summary["gates"]["adapter_precheck"]["status"] == "BLOCKED"
    assert "adapter_precheck" in summary["conclusion"].lower()


def test_t066_qualification_runner_passes_with_green_fixture(tmp_path: Path) -> None:
    adapter_script = tmp_path / "fake_adapter_pass.py"
    _write_adapter_fixture(
        adapter_script,
        overall_status="PASS",
        conclusion="Pass: adapter detected and MIDI Hub precheck passed.",
        exit_code=0,
    )

    output_dir = tmp_path / "pass"
    env = os.environ.copy()
    proc = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--output-dir",
            str(output_dir),
            "--regression-command",
            "python3 -c \"print('regression ok')\"",
            "--typecheck-command",
            "python3 -c \"print('typecheck ok')\"",
            "--adapter-precheck-script",
            str(adapter_script),
            "--perf-burst-count",
            "64",
            "--target-latency-per-hop-us",
            "1000000",
            "--target-throughput-msgs-per-sec",
            "1",
            "--required-soak-seconds",
            "0",
        ],
        check=False,
        capture_output=True,
        text=True,
        env=env,
    )

    assert proc.returncode == 0, proc.stderr
    summary = json.loads((output_dir / "t066-midi-hub-qualification-summary.json").read_text(encoding="utf-8"))
    assert summary["overall_status"] == "PASS"
    assert summary["gates"]["software_regression"]["status"] == "PASS"
    assert summary["gates"]["frontend_typecheck"]["status"] == "PASS"
    assert summary["gates"]["performance_microbench"]["status"] == "PASS"
    assert summary["gates"]["adapter_precheck"]["status"] == "PASS"
    assert summary["gates"]["soak_duration"]["status"] == "PASS"
    markdown = (output_dir / "T066_MIDI_HUB_QUALIFICATION_SUMMARY.md").read_text(encoding="utf-8")
    assert "Conclusion: Pass:" in markdown
