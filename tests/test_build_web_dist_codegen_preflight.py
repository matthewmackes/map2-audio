"""Run-14c cycle 7 — build_web_dist_atomic codegen drift preflight.

Verifies the preflight gate runs every codegen --check before tsc + vite.
A drifted generated file would otherwise compound into the vite output
and ship to operators.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
BUILD_SCRIPT = REPO_ROOT / "scripts" / "build_web_dist_atomic.py"


def test_build_script_exists_and_executable() -> None:
    assert BUILD_SCRIPT.is_file()
    # Not all scripts in this repo are chmod +x; this one is invoked
    # via `python3 scripts/build_web_dist_atomic.py` so executable bit
    # is informational, not required.


def test_preflight_lists_every_codegen_script() -> None:
    """The CODEGEN_DRIFT_CHECKS tuple must include every Pydantic→TS
    codegen script in the repo. Missing one means a drift in that
    codegen would silently ship."""
    text = BUILD_SCRIPT.read_text()
    for required_script in (
        "generate_typescript_contracts.py",     # T2455 snapshots
        "generate_meter_ws_types.py",            # run-14b cycle 2
        "generate_sonobus_events_ws_types.py",   # run-14c cycle 1
        "generate_midi_traffic_ws_types.py",     # run-14c cycle 2
    ):
        assert required_script in text, (
            f"build_web_dist_atomic.py must include {required_script} in "
            "the CODEGEN_DRIFT_CHECKS tuple — otherwise drift in that "
            "codegen ships to operators"
        )


def test_preflight_runs_before_tsc_in_main() -> None:
    """The preflight must execute BEFORE the existing tsc + vite invocation.
    Running it after would let tsc consume a stale generated file."""
    text = BUILD_SCRIPT.read_text()
    main_start = text.index("def main()")
    main_body = text[main_start:]
    preflight_pos = main_body.find("run_codegen_drift_preflight")
    tsc_pos = main_body.find("TS_BIN")
    assert 0 <= preflight_pos < tsc_pos, (
        "run_codegen_drift_preflight() must be called BEFORE tsc + vite"
    )


def test_preflight_fails_fast_with_actionable_message(tmp_path: Path) -> None:
    """Simulate drift: write a stale meterWsFrame.generated.ts, run the
    build script. Should exit nonzero with a message naming the
    rerun-codegen command."""
    # Use a copy of the generated file so we can clobber + restore safely.
    target = REPO_ROOT / "web" / "src" / "app" / "types" / "meterWsFrame.generated.ts"
    backup = tmp_path / "backup.ts"
    shutil.copy2(target, backup)
    try:
        target.write_text("// stale\n")
        # Run the build script; expect it to fail at the preflight.
        # We don't let it proceed past the preflight (don't want to
        # actually build vite + tsc), so a non-zero exit is enough.
        result = subprocess.run(
            [sys.executable, str(BUILD_SCRIPT)],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            timeout=60,
        )
        assert result.returncode != 0, (
            "build script should exit nonzero on codegen drift; got rc=0"
        )
        # The output should mention the rerun-codegen command so the
        # operator knows what to do.
        combined = result.stdout + result.stderr
        assert "generate_meter_ws_types.py" in combined, (
            "preflight failure message should name the regen command. "
            f"Got:\n{combined[-500:]}"
        )
    finally:
        shutil.copy2(backup, target)
