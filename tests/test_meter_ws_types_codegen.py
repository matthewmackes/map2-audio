"""Run-14b cycle 2 — TypeScript codegen contract for the meter-WS frame.

Locks the codegen script + generated TS file shape so a future schema
change can't silently desync them. Two gates:

1. **Generation succeeds**: the script produces a non-empty TS file
   that imports the canonical wire-protocol constants from the
   Pydantic source.

2. **--check matches checked-in file**: if a developer changed the
   Pydantic schema without re-running the generator, --check fails
   non-zero and CI catches the drift.

Tests do NOT run typecheck on the emitted TS (that's `npm run typecheck`'s
job); they verify the emitter output shape against the canonical
Pydantic source.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = REPO_ROOT / "scripts" / "generate_meter_ws_types.py"
GENERATED = REPO_ROOT / "web" / "src" / "app" / "types" / "meterWsFrame.generated.ts"


def test_codegen_script_exists_and_executable() -> None:
    assert SCRIPT.is_file(), f"missing codegen script at {SCRIPT}"
    # Executable bit (set with chmod +x).
    assert SCRIPT.stat().st_mode & 0o100, f"{SCRIPT} should be chmod +x"


def test_generated_file_exists() -> None:
    assert GENERATED.is_file(), (
        f"missing generated TS file at {GENERATED}. Run "
        "`python3 scripts/generate_meter_ws_types.py` to create it."
    )


def test_generated_file_has_do_not_edit_warning() -> None:
    """Hand-edits get clobbered on the next codegen run; the generated
    file must shout this loudly."""
    text = GENERATED.read_text()
    assert "AUTO-GENERATED" in text and "DO NOT EDIT" in text


def test_generated_file_references_canonical_pydantic_source() -> None:
    """A future maintainer reading the TS must know where the canonical
    Pydantic source lives."""
    text = GENERATED.read_text()
    assert "_meter_ws_schema.py" in text, (
        "generated file must reference the canonical Pydantic source path"
    )


def test_generated_file_carries_canonical_wire_protocol_constants() -> None:
    """The TS literals must match the Python literals exactly. This catches
    drift between the two sources of truth at codegen time."""
    from app.services.devices._meter_ws_schema import (
        CLUSTER_REGISTRY_FRAME_TYPE,
        REGISTRY_FRAME_TYPE,
        SCHEMA_VERSION,
    )
    text = GENERATED.read_text()
    assert f"REGISTRY_FRAME_TYPE = '{REGISTRY_FRAME_TYPE}'" in text
    assert f"CLUSTER_REGISTRY_FRAME_TYPE = '{CLUSTER_REGISTRY_FRAME_TYPE}'" in text
    assert f"SCHEMA_VERSION = {SCHEMA_VERSION}" in text


def test_generated_file_exports_required_types() -> None:
    """Every Pydantic model has a corresponding TS interface or type."""
    text = GENERATED.read_text()
    for name in (
        "MeterSourceKind",
        "MeterSnapshotPayload",
        "DeviceMeterRow",
        "DeviceMeterRegistryData",
        "DeviceMeterRegistryFrame",
        "ClusterPeerSlice",
        "ClusterMeterRegistryData",
        "ClusterMeterRegistryFrame",
    ):
        assert f"export interface {name}" in text or f"export type {name}" in text, (
            f"generated file must export {name!r}"
        )


def test_generated_file_exports_type_guards() -> None:
    """The two type guards (`isRegistryFrame`, `isClusterRegistryFrame`)
    are the recommended way for WS hooks to narrow `unknown` frames."""
    text = GENERATED.read_text()
    assert "export function isRegistryFrame(" in text
    assert "export function isClusterRegistryFrame(" in text


def test_meter_source_kind_includes_engine_unavailable() -> None:
    """The 3-value Literal from the Python source must be reflected
    verbatim in the TS union — drift would let a frame with
    source='engine_unavailable' fail the type guard silently."""
    text = GENERATED.read_text()
    assert "'engine'" in text and "'placeholder'" in text and "'engine_unavailable'" in text


# ---------------------------------------------------------------------------
# --check CI gate
# ---------------------------------------------------------------------------


def test_check_mode_exits_zero_when_in_sync() -> None:
    """Run the codegen --check; should exit 0 when the file is current."""
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--check"],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, (
        f"codegen --check failed with rc={result.returncode}.\n"
        f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}"
    )


def test_check_mode_fails_on_drift(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Simulated drift: write a stale TS file + verify --check fails non-zero."""
    # Save the real file, write a stale version, run --check, restore.
    original = GENERATED.read_text()
    try:
        GENERATED.write_text("// stale stub\n")
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--check"],
            capture_output=True,
            text=True,
        )
        assert result.returncode != 0, (
            "codegen --check should exit nonzero on drift; got rc=0"
        )
        assert "out of date" in (result.stderr + result.stdout).lower(), (
            f"error message should mention `out of date`; got:\n{result.stderr}"
        )
    finally:
        GENERATED.write_text(original)


def test_running_script_overwrites_with_canonical_content() -> None:
    """Re-run the script; the file should equal what it produced last time."""
    before = GENERATED.read_text()
    result = subprocess.run(
        [sys.executable, str(SCRIPT)],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0
    after = GENERATED.read_text()
    assert before == after, (
        "codegen output is non-deterministic — re-running should produce "
        "identical bytes"
    )
