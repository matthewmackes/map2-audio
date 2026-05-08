"""T2459-H6 — retirement confirmation regression test.

Locks the post-retirement state of the legacy raw-ALSA Map2MidiController
path so it cannot silently come back. Original purpose was to track the
shrinking reference set during the multi-slice retirement; this version
asserts the deletion landed cleanly and stays gone.

Retired: 2026-05-08. Evidence:
  docs/fit-for-purpose-evidence/20260508/t2459h6-shm-ring/
"""
from __future__ import annotations

import re
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
ENGINE_SRC = REPO_ROOT / "juce-engine" / "Source"
ENGINE_TESTS = REPO_ROOT / "juce-engine" / "tests"
ENGINE_CMAKE = REPO_ROOT / "juce-engine" / "CMakeLists.txt"
RETIREMENT_DOC = REPO_ROOT / "docs" / "midi" / "MAP2MIDICONTROLLER_RETIREMENT.md"

LEGACY_CPP = ENGINE_SRC / "Controllers" / "Midi" / "Map2MidiController.cpp"
LEGACY_H = ENGINE_SRC / "Controllers" / "Midi" / "Map2MidiController.h"

# Word-boundary pattern — matches "Map2MidiController" but not e.g.
# "Map2MidiControllerTests" if a future name reuses the prefix.
PATTERN = re.compile(r"\bMap2MidiController\b")

# Allowed mentions: documentation comments referring to the retirement
# itself live in these files. They must remain comment-only — any code-
# using mutation surfaces here as a test failure.
ALLOWED_COMMENT_MENTIONS = {
    REPO_ROOT / "juce-engine" / "Source" / "Controllers" / "Map2Controller.cpp",
    REPO_ROOT / "juce-engine" / "Source" / "Controllers" / "Map2ControllerFactory.cpp",
    REPO_ROOT / "juce-engine" / "Source" / "Controllers" / "Map2ControllerFactory.h",
    REPO_ROOT / "juce-engine" / "Source" / "Controllers" / "Midi" / "IpcMidiBridge.h",
    REPO_ROOT / "juce-engine" / "Source" / "Controllers" / "Midi" / "IpcMidiBridgeController.h",
    REPO_ROOT / "juce-engine" / "tests" / "Map2ControllerTests.cpp",
}


def test_legacy_source_files_deleted() -> None:
    assert not LEGACY_CPP.exists(), (
        f"Map2MidiController.cpp came back: {LEGACY_CPP}. "
        "The legacy raw-ALSA MIDI path was retired 2026-05-08 — "
        "MIDI ingestion now lives in map2-controller-host (libremidi) "
        "and is consumed by the engine via the shm event ring "
        "(IpcMidiBridgeController)."
    )
    assert not LEGACY_H.exists(), f"Map2MidiController.h came back: {LEGACY_H}"


def test_no_unexpected_references_in_engine() -> None:
    matches: set[Path] = set()
    for root in (ENGINE_SRC, ENGINE_TESTS):
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            if path.suffix not in {".cpp", ".h", ".hpp", ".cc"}:
                continue
            try:
                text = path.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            if PATTERN.search(text):
                matches.add(path)
    unexpected = matches - ALLOWED_COMMENT_MENTIONS
    assert not unexpected, (
        "Map2MidiController reference reappeared outside the allowed "
        "comment-mention set. The legacy path was retired 2026-05-08 — "
        f"new code dependencies are not permitted: {sorted(unexpected)}"
    )


def test_cmakelists_does_not_reintroduce_retirement_option() -> None:
    cmake_text = ENGINE_CMAKE.read_text(encoding="utf-8")
    assert "MAP2_USE_LEGACY_MIDI_CONTROLLER" not in cmake_text, (
        "CMakeLists.txt must not re-expose the retired retirement-gate "
        "option. The legacy path is gone; there is no gate left."
    )
    assert "MAP2_HAS_LEGACY_MIDI_CONTROLLER" not in cmake_text, (
        "CMakeLists.txt must not re-define MAP2_HAS_LEGACY_MIDI_CONTROLLER. "
        "Compile defs for the retired flag should be removed."
    )


def test_factory_returns_ipc_midi_bridge_unconditionally() -> None:
    factory_cpp = (
        ENGINE_SRC / "Controllers" / "Map2ControllerFactory.cpp"
    ).read_text(encoding="utf-8")
    assert "MAP2_HAS_LEGACY_MIDI_CONTROLLER" not in factory_cpp, (
        "Factory must not retain the retired conditional include guard."
    )
    assert "IpcMidiBridgeController" in factory_cpp, (
        "Factory must construct IpcMidiBridgeController for MIDI identities."
    )


def test_retirement_doc_exists() -> None:
    assert RETIREMENT_DOC.exists(), (
        f"missing T2459-H6 retirement runbook: {RETIREMENT_DOC}"
    )
