"""Smoke-runner self-test.

T2459-F4. Verifies the HIL smoke runner exits cleanly on a CI host
without bench hardware, produces a parseable evidence JSON, and
reports a non-zero count of latency measurements completed against
the live device-packs/ tree.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = REPO_ROOT / "scripts" / "run_t2459_device_subsystem_hil_smoke.py"


def test_smoke_script_exists() -> None:
    assert SCRIPT.exists()


def test_smoke_runner_completes_without_hardware(tmp_path: Path) -> None:
    """The runner must produce a parseable evidence JSON even without
    a JACK server, hidapi-equipped hardware, or bench devices.
    """
    proc = subprocess.run(
        [sys.executable, str(SCRIPT), "--output-dir", str(tmp_path)],
        capture_output=True, text=True,
    )
    # Exit 0 on PASS or PARTIAL; only FAIL produces non-zero, and FAIL
    # only happens if ProfileRegistry itself can't be imported, which
    # is a real bug — let it surface.
    assert proc.returncode == 0, f"runner failed: {proc.stderr}"

    # Find the evidence file.
    files = list(tmp_path.glob("smoke-*.json"))
    assert files, f"no smoke evidence written to {tmp_path}"
    payload = json.loads(files[0].read_text())

    assert payload["status"] in ("PASS", "PARTIAL")
    assert "summary" in payload
    s = payload["summary"]
    assert s["audio_profiles"] >= 1
    assert s["with_loopback_ports"] >= 1
    assert s["latency_measurements_completed"] >= 1


def test_smoke_evidence_records_method_per_profile(tmp_path: Path) -> None:
    """Each profile's per-profile result records the latency-measurement
    method (synthetic | jack | None) so the bench operator can tell
    which profiles actually exercised real hardware.
    """
    proc = subprocess.run(
        [sys.executable, str(SCRIPT), "--output-dir", str(tmp_path)],
        capture_output=True, text=True,
    )
    assert proc.returncode == 0
    payload = json.loads(list(tmp_path.glob("smoke-*.json"))[0].read_text())
    for profile in payload["profiles"]:
        if profile["has_loopback_ports"]:
            assert profile["loopback_method"] in ("jack", "synthetic"), (
                f"Profile {profile['pack_id']}/{profile['model']} has "
                f"loopback_ports but loopback_method={profile['loopback_method']!r}"
            )


def test_smoke_packs_summary_includes_known_vendors(tmp_path: Path) -> None:
    """The Edirol UA + Hotone packs should be enumerated in the
    smoke's pack summary. (Plus the fixture-pack from _tests/.)
    """
    proc = subprocess.run(
        [sys.executable, str(SCRIPT), "--output-dir", str(tmp_path)],
        capture_output=True, text=True,
    )
    assert proc.returncode == 0
    payload = json.loads(list(tmp_path.glob("smoke-*.json"))[0].read_text())
    pack_ids = {p["pack_id"] for p in payload["packs"]}
    assert "edirol-ua" in pack_ids
    assert "hotone" in pack_ids
