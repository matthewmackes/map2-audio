"""T2459-H closeout-doc invariants.

The closeout doc summarizes H1-H7 status and HIL gates. Pinning a
few invariants prevents the doc from silently drifting out of date
when a new H slice ships.
"""

from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DOC = REPO_ROOT / "docs" / "midi" / "T2459H_CLOSEOUT.md"


def _read_doc() -> str:
    return DOC.read_text(encoding="utf-8")


def test_doc_exists() -> None:
    assert DOC.is_file()


def test_doc_covers_all_seven_subtasks() -> None:
    text = _read_doc()
    for sub in ("T2459-H1", "T2459-H2", "T2459-H3", "T2459-H4", "T2459-H5", "T2459-H6", "T2459-H7"):
        assert sub in text, f"closeout doc missing subtask {sub}"


def test_doc_carries_hil_gate_table() -> None:
    text = _read_doc()
    assert "Remaining HIL Acceptance Gates" in text
    assert "MeloAudio Commander" in text
    assert "Maschine MK1" in text
    assert "Map2MidiController deletion soak" in text


def test_doc_links_to_canonical_artifacts() -> None:
    text = _read_doc()
    for ref in (
        "PROJECT_WORKLIST.md",
        "MIDI_BACKEND.md",
        "MIDI_HUB_ARCHITECTURE.md",
        "MIDI_HUB_ABSORPTION_AUDIT.md",
        "CLUSTER_MIDI_PROTOCOL.md",
        "MAP2MIDICONTROLLER_RETIREMENT.md",
    ):
        assert ref in text, f"closeout doc must link {ref}"


def test_doc_pins_h1_and_h7_as_done() -> None:
    """H1 + H7 are the only subtasks that have crossed the bench
    HIL gate. Pin them as Done so a future regression that re-flags
    them in-progress fails this test."""
    text = _read_doc()
    # H1 line and H7 line both carry the ✅ Done marker.
    assert "T2459-H1 — libremidi I/O foundation" in text
    assert "T2459-H7 — Cluster MIDI" in text
    # Marker appears at least twice (once each).
    assert text.count("✅ Done 2026-04-28") >= 2
