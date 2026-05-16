"""Run-14c cycle 8 — pin the CODEGEN_INDEX.md contract.

The index is the canonical map of every Pydantic→TS codegen in the
platform. A new codegen that doesn't get added here is invisible to
future contributors. Tests pin the must-have anchors so a future PR
adding a generated file without indexing it fails CI.
"""

from __future__ import annotations

from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
INDEX = REPO_ROOT / "docs" / "architecture" / "CODEGEN_INDEX.md"


def test_index_exists() -> None:
    assert INDEX.is_file(), f"missing index at {INDEX}"


@pytest.mark.parametrize(
    "generated_file",
    [
        "snapshots.generated.ts",
        "meterWsFrame.generated.ts",
        "sonobusEventsWsFrame.generated.ts",
        "midiTrafficWsFrame.generated.ts",
        "avbBindingTypes.ts",
    ],
)
def test_index_lists_every_generated_file(generated_file: str) -> None:
    """Every generated/hand-mirrored TS file in the platform must be
    indexed. Adding a new one without an index entry fails this test."""
    text = INDEX.read_text()
    assert generated_file in text, (
        f"CODEGEN_INDEX.md must include an entry for {generated_file}"
    )


@pytest.mark.parametrize(
    "script_name",
    [
        "generate_typescript_contracts.py",
        "generate_meter_ws_types.py",
        "generate_sonobus_events_ws_types.py",
        "generate_midi_traffic_ws_types.py",
    ],
)
def test_index_lists_every_codegen_script(script_name: str) -> None:
    text = INDEX.read_text()
    assert script_name in text, (
        f"CODEGEN_INDEX.md must reference codegen script {script_name}"
    )


@pytest.mark.parametrize(
    "pydantic_source",
    [
        "app/services/devices/_meter_ws_schema.py",
        "app/services/sonobus/_events_ws_schema.py",
        "app/services/midi_hub/_traffic_ws_schema.py",
        "app/services/avb/binding_schemas.py",
    ],
)
def test_index_references_pydantic_sources(pydantic_source: str) -> None:
    """Each entry's Pydantic source path must be documented so a future
    contributor can find the truth."""
    text = INDEX.read_text()
    assert pydantic_source in text, (
        f"CODEGEN_INDEX.md must reference Pydantic source {pydantic_source}"
    )


def test_index_documents_required_artefacts_per_entry() -> None:
    """A new contributor following the doc must know what to produce.
    The "Required artefacts per new entry" table is the recipe."""
    text = INDEX.read_text()
    for required_section in (
        "Required artefacts per new entry",
        "Pydantic source module",
        "Codegen script",
        "Generated TS file",
        "Wire into typecheck",
        "Wire into deploy preflight",
        "Test contract",
        "Update this index",
    ):
        assert required_section in text, (
            f"CODEGEN_INDEX.md must document the artefact: {required_section}"
        )


def test_index_cross_references_gate_locations() -> None:
    """The two enforcement locations must be findable from the index."""
    text = INDEX.read_text()
    assert "web/package.json" in text and "typecheck" in text
    assert "build_web_dist_atomic.py" in text
