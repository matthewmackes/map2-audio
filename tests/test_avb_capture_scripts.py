from __future__ import annotations

import os
from pathlib import Path
import stat
import subprocess


REPO_ROOT = Path(__file__).resolve().parents[1]


def _write_script(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def test_avb_capture_clock_drift_falls_back_to_tcpdump_when_tshark_missing(tmp_path: Path) -> None:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir(parents=True, exist_ok=True)
    output_dir = tmp_path / "artifacts"

    _write_script(
        bin_dir / "pmc",
        """#!/bin/sh
case "$*" in
  *CURRENT_DATA_SET*)
    printf '%s\n' 'offsetFromMaster 42'
    printf '%s\n' 'meanPathDelay 100'
    ;;
  *PARENT_DATA_SET*)
    printf '%s\n' 'grandmasterIdentity 00-11-22-33-44-55-66-77'
    ;;
esac
""",
    )
    _write_script(
        bin_dir / "tcpdump",
        """#!/bin/sh
set -eu
mode="capture"
outfile=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -w)
      outfile="$2"
      shift 2
      ;;
    -r)
      mode="read"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

if [ "$mode" = "read" ]; then
  printf '%s\n' '1000.100000 AVTP packet'
  printf '%s\n' '1000.200000 AVTP packet'
  exit 0
fi

: > "$outfile"
trap 'exit 0' TERM INT
while :; do sleep 1; done
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"

    result = subprocess.run(
        ["bash", "scripts/avb_capture_clock_drift.sh", "lo", "1", str(output_dir)],
        cwd=REPO_ROOT,
        env=env,
        text=True,
        capture_output=True,
        check=True,
    )

    summary = (output_dir / "summary.txt").read_text(encoding="utf-8")
    avtp_tsv = (output_dir / "avtp_frames.tsv").read_text(encoding="utf-8")

    assert "capture_tool=tcpdump" in summary
    assert "decode_tool=tcpdump" in summary
    assert "offset_target=PASS" in summary
    assert "avtp_frame_count=2" in summary
    assert "Starting AVTP capture using 'tcpdump'" in result.stdout
    assert avtp_tsv.count("\n") == 2


def test_avb_capture_clock_drift_fails_when_no_avtp_frames_or_ptp_samples(tmp_path: Path) -> None:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir(parents=True, exist_ok=True)
    output_dir = tmp_path / "artifacts"

    _write_script(
        bin_dir / "pmc",
        """#!/bin/sh
exit 0
""",
    )
    _write_script(
        bin_dir / "tcpdump",
        """#!/bin/sh
set -eu
mode="capture"
outfile=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -w)
      outfile="$2"
      shift 2
      ;;
    -r)
      mode="read"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

if [ "$mode" = "read" ]; then
  exit 0
fi

: > "$outfile"
trap 'exit 0' TERM INT
while :; do sleep 1; done
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"

    result = subprocess.run(
        ["bash", "scripts/avb_capture_clock_drift.sh", "lo", "1", str(output_dir)],
        cwd=REPO_ROOT,
        env=env,
        text=True,
        capture_output=True,
    )

    summary = (output_dir / "summary.txt").read_text(encoding="utf-8")

    assert result.returncode != 0
    assert "capture_requirements_met=false" in summary
    assert "failure_reason=no_valid_ptp_offset_samples" in summary
    assert "ERROR: no valid PTP offset samples captured" in result.stderr


def test_run_avb_hil_qualification_passes_q05_with_tcpdump_fallback(tmp_path: Path) -> None:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir(parents=True, exist_ok=True)
    output_dir = tmp_path / "hil"

    _write_script(
        bin_dir / "curl",
        """#!/bin/sh
printf '%s' '{"enabled": true, "available": true}'
""",
    )
    _write_script(
        bin_dir / "pytest",
        """#!/bin/sh
exit 0
""",
    )
    _write_script(
        bin_dir / "pmc",
        """#!/bin/sh
case "$*" in
  *CURRENT_DATA_SET*)
    printf '%s\n' 'offsetFromMaster 42'
    printf '%s\n' 'meanPathDelay 100'
    ;;
  *PARENT_DATA_SET*)
    printf '%s\n' 'grandmasterIdentity 00-11-22-33-44-55-66-77'
    ;;
esac
""",
    )
    _write_script(
        bin_dir / "tcpdump",
        """#!/bin/sh
set -eu
mode="capture"
outfile=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -w)
      outfile="$2"
      shift 2
      ;;
    -r)
      mode="read"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

if [ "$mode" = "read" ]; then
  printf '%s\n' '1000.100000 AVTP packet'
  exit 0
fi

: > "$outfile"
trap 'exit 0' TERM INT
while :; do sleep 1; done
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"

    result = subprocess.run(
        [
            "bash",
            "scripts/run_avb_hil_qualification.sh",
            "--interface",
            "lo",
            "--capture-seconds",
            "1",
            "--output-dir",
            str(output_dir),
        ],
        cwd=REPO_ROOT,
        env=env,
        text=True,
        capture_output=True,
        check=True,
    )

    summary = (output_dir / "summary.txt").read_text(encoding="utf-8")
    q05_log = (output_dir / "q05_capture.log").read_text(encoding="utf-8")
    matrix_update = (output_dir / "matrix_update.md").read_text(encoding="utf-8")

    assert "q04_multi_node_discovery_route_churn=PASS" in summary
    assert "q05_ptp_lock_transport_timing=PASS" in summary
    assert "capture_tool=tcpdump" in (output_dir / "q05_capture" / "summary.txt").read_text(encoding="utf-8")
    assert "Starting AVTP capture using 'tcpdump'" in q05_log
    assert "| Q05 | See" in matrix_update
    assert "| Q05 |" in result.stdout or "Matrix snippet:" in result.stdout


def test_run_avb_hil_qualification_blocks_q05_when_capture_has_no_live_evidence(tmp_path: Path) -> None:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir(parents=True, exist_ok=True)
    output_dir = tmp_path / "hil"

    _write_script(
        bin_dir / "curl",
        """#!/bin/sh
printf '%s' '{"enabled": true, "available": true}'
""",
    )
    _write_script(
        bin_dir / "pytest",
        """#!/bin/sh
exit 0
""",
    )
    _write_script(
        bin_dir / "pmc",
        """#!/bin/sh
exit 0
""",
    )
    _write_script(
        bin_dir / "tcpdump",
        """#!/bin/sh
set -eu
mode="capture"
outfile=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -w)
      outfile="$2"
      shift 2
      ;;
    -r)
      mode="read"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

if [ "$mode" = "read" ]; then
  exit 0
fi

: > "$outfile"
trap 'exit 0' TERM INT
while :; do sleep 1; done
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"

    result = subprocess.run(
        [
            "bash",
            "scripts/run_avb_hil_qualification.sh",
            "--interface",
            "lo",
            "--capture-seconds",
            "1",
            "--output-dir",
            str(output_dir),
        ],
        cwd=REPO_ROOT,
        env=env,
        text=True,
        capture_output=True,
        check=True,
    )

    summary = (output_dir / "summary.txt").read_text(encoding="utf-8")
    q05_log = (output_dir / "q05_capture.log").read_text(encoding="utf-8")
    matrix_update = (output_dir / "matrix_update.md").read_text(encoding="utf-8")

    assert "q04_multi_node_discovery_route_churn=PASS" in summary
    assert "q05_ptp_lock_transport_timing=BLOCKED" in summary
    assert "q05_reason=Environment prevented Q05 execution" in summary
    assert "ERROR: no valid PTP offset samples captured" in q05_log
    assert "Blocked: Environment prevented Q05 execution" in matrix_update
    assert "One or more gates are BLOCKED by environment constraints" in result.stdout


def test_run_avb_24h_soak_fails_when_no_active_streams_or_ptp_lock_are_observed(tmp_path: Path) -> None:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir(parents=True, exist_ok=True)
    output_dir = tmp_path / "soak"

    _write_script(
        bin_dir / "curl",
        """#!/bin/sh
url=""
while [ "$#" -gt 0 ]; do
  url="$1"
  shift
done

case "$url" in
  */streams)
    printf '%s' '{"available": true, "streams": []}'
    ;;
  */router/connections)
    printf '%s' '{"connections": []}'
    ;;
  */ptp)
    printf '%s' '{"available": false, "state": "INITIALIZING"}'
    ;;
  *)
    exit 1
    ;;
esac
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"
    env["MAP2_AVB_SOAK_DURATION_SECONDS_OVERRIDE"] = "1"

    result = subprocess.run(
        [
            "bash",
            "scripts/run_avb_24h_soak.sh",
            "--duration-hours",
            "1",
            "--checkpoint-minutes",
            "60",
            "--output-dir",
            str(output_dir),
        ],
        cwd=REPO_ROOT,
        env=env,
        text=True,
        capture_output=True,
    )

    summary = (output_dir / "summary.txt").read_text(encoding="utf-8")

    assert result.returncode != 0
    assert "soak_requirements_met=false" in summary
    assert "failure_reason=no_active_running_streams_observed" in summary
    assert "ERROR: no active running streams observed during soak" in result.stderr


def test_run_avb_hil_qualification_blocks_q06_when_soak_has_no_live_evidence(tmp_path: Path) -> None:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir(parents=True, exist_ok=True)
    output_dir = tmp_path / "hil"

    _write_script(
        bin_dir / "curl",
        """#!/bin/sh
url=""
while [ "$#" -gt 0 ]; do
  url="$1"
  shift
done

case "$url" in
  */status)
    printf '%s' '{"enabled": true, "available": true}'
    ;;
  */streams)
    printf '%s' '{"available": true, "streams": []}'
    ;;
  */router/connections)
    printf '%s' '{"connections": []}'
    ;;
  */ptp)
    printf '%s' '{"available": false, "state": "INITIALIZING"}'
    ;;
  *)
    exit 1
    ;;
esac
""",
    )
    _write_script(
        bin_dir / "pytest",
        """#!/bin/sh
exit 0
""",
    )
    _write_script(
        bin_dir / "pmc",
        """#!/bin/sh
printf '%s\n' 'offsetFromMaster 42'
printf '%s\n' 'meanPathDelay 100'
""",
    )
    _write_script(
        bin_dir / "tcpdump",
        """#!/bin/sh
set -eu
mode="capture"
outfile=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -w)
      outfile="$2"
      shift 2
      ;;
    -r)
      mode="read"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

if [ "$mode" = "read" ]; then
  printf '%s\n' '1000.100000 AVTP packet'
  exit 0
fi

: > "$outfile"
trap 'exit 0' TERM INT
while :; do sleep 1; done
""",
    )

    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"
    env["MAP2_AVB_SOAK_DURATION_SECONDS_OVERRIDE"] = "1"

    result = subprocess.run(
        [
            "bash",
            "scripts/run_avb_hil_qualification.sh",
            "--interface",
            "lo",
            "--capture-seconds",
            "1",
            "--run-q06-soak",
            "--soak-hours",
            "1",
            "--soak-checkpoint-minutes",
            "60",
            "--output-dir",
            str(output_dir),
        ],
        cwd=REPO_ROOT,
        env=env,
        text=True,
        capture_output=True,
        check=True,
    )

    summary = (output_dir / "summary.txt").read_text(encoding="utf-8")
    q06_log = (output_dir / "q06_soak.log").read_text(encoding="utf-8")
    matrix_update = (output_dir / "matrix_update.md").read_text(encoding="utf-8")

    assert "q04_multi_node_discovery_route_churn=PASS" in summary
    assert "q05_ptp_lock_transport_timing=PASS" in summary
    assert "q06_24h_endurance_soak=BLOCKED" in summary
    assert "q06_reason=Environment prevented Q06 execution" in summary
    assert "ERROR: no active running streams observed during soak" in q06_log
    assert "Blocked: Environment prevented Q06 execution" in matrix_update
    assert "One or more gates are BLOCKED by environment constraints" in result.stdout
