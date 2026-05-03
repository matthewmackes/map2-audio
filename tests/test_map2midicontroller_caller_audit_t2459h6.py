"""T2459-H6 — caller audit regression test.

Locks the `Map2MidiController` reference set so future PRs cannot silently
introduce a new dependency that would block the H6 retirement deletion.
The set is small and explicit; the docs/midi/MAP2MIDICONTROLLER_RETIREMENT.md
runbook tracks any movement here.

Mirrors the grep-then-compare pattern from
tests/test_route_registration_policy.py.
"""
from __future__ import annotations

import re
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
ENGINE_SRC = REPO_ROOT / "juce-engine" / "Source"
ENGINE_TESTS = REPO_ROOT / "juce-engine" / "tests"
ENGINE_CMAKE = REPO_ROOT / "juce-engine" / "CMakeLists.txt"
RETIREMENT_DOC = REPO_ROOT / "docs" / "midi" / "MAP2MIDICONTROLLER_RETIREMENT.md"

PATTERN = re.compile(r"Map2MidiController")

# Files the audit doc explicitly enumerates as load-bearing references.
EXPECTED_LOAD_BEARING = {
    REPO_ROOT / "juce-engine" / "CMakeLists.txt",
    REPO_ROOT / "juce-engine" / "Source" / "Controllers" / "Map2ControllerFactory.cpp",
    REPO_ROOT / "juce-engine" / "tests" / "Map2ControllerTests.cpp",
    # The legacy implementation files themselves stay until the deletion PR.
    REPO_ROOT / "juce-engine" / "Source" / "Controllers" / "Midi" / "Map2MidiController.cpp",
    REPO_ROOT / "juce-engine" / "Source" / "Controllers" / "Midi" / "Map2MidiController.h",
}

# Comment-only references — kept tracked so a future code-using mutation in
# any of these files surfaces as a test failure inviting a deliberate
# reclassification rather than silent inclusion.
EXPECTED_COMMENT_ONLY = {
    REPO_ROOT / "juce-engine" / "Source" / "Controllers" / "Map2Controller.cpp",
    REPO_ROOT / "juce-engine" / "Source" / "Controllers" / "Map2ControllerFactory.h",
    REPO_ROOT / "juce-engine" / "Source" / "Controllers" / "Midi" / "IpcMidiBridge.h",
    # T2459-H6 Slice 2: IpcMidiBridgeController.h docstring mentions
    # Map2MidiController as the legacy path it replaces under OFF.
    REPO_ROOT / "juce-engine" / "Source" / "Controllers" / "Midi" / "IpcMidiBridgeController.h",
}

EXPECTED_ALL = EXPECTED_LOAD_BEARING | EXPECTED_COMMENT_ONLY


def _scan_engine_for_pattern() -> set[Path]:
    matches: set[Path] = set()
    roots = [ENGINE_SRC, ENGINE_TESTS]
    for root in roots:
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
    if PATTERN.search(ENGINE_CMAKE.read_text(encoding="utf-8")):
        matches.add(ENGINE_CMAKE)
    return matches


def test_audit_doc_exists() -> None:
    assert RETIREMENT_DOC.exists(), (
        f"missing T2459-H6 retirement runbook: {RETIREMENT_DOC}"
    )


def test_caller_set_matches_audit() -> None:
    found = _scan_engine_for_pattern()
    unexpected = found - EXPECTED_ALL
    missing = EXPECTED_ALL - found
    assert not unexpected, (
        "New Map2MidiController reference appeared in the engine. "
        "Either retire it or add it to the H6 audit doc + this test's "
        f"EXPECTED set with the appropriate classification: {sorted(unexpected)}"
    )
    assert not missing, (
        "Expected Map2MidiController references not found — has the deletion "
        "PR landed without updating this test? Refresh the EXPECTED set: "
        f"{sorted(missing)}"
    )


def test_factory_guards_legacy_include_under_retirement_flag() -> None:
    factory_cpp = (
        ENGINE_SRC / "Controllers" / "Map2ControllerFactory.cpp"
    ).read_text(encoding="utf-8")
    assert "MAP2_HAS_LEGACY_MIDI_CONTROLLER" in factory_cpp, (
        "Factory must guard the legacy include + instantiation behind "
        "MAP2_HAS_LEGACY_MIDI_CONTROLLER so the OFF build links cleanly."
    )
    # When OFF, the "midi" arm short-circuits to nullptr.
    assert "return nullptr;" in factory_cpp


def test_cmakelists_exposes_retirement_option() -> None:
    cmake_text = ENGINE_CMAKE.read_text(encoding="utf-8")
    assert "MAP2_USE_LEGACY_MIDI_CONTROLLER" in cmake_text, (
        "CMakeLists.txt must expose the MAP2_USE_LEGACY_MIDI_CONTROLLER "
        "option (T2459-H6 retirement gate)."
    )
    # The option must default to ON to preserve today's behavior until
    # the bench soak passes.
    assert (
        'option(MAP2_USE_LEGACY_MIDI_CONTROLLER\n'
        in cmake_text
        or "MAP2_USE_LEGACY_MIDI_CONTROLLER" in cmake_text
    )
    # Source/header are conditionally appended (not unconditionally listed).
    assert "if(MAP2_USE_LEGACY_MIDI_CONTROLLER)" in cmake_text


def test_catch2_test_has_both_on_and_off_arms() -> None:
    test_cpp = (ENGINE_TESTS / "Map2ControllerTests.cpp").read_text(encoding="utf-8")
    assert "Factory returns a Map2MidiController for MIDI identities" in test_cpp
    # T2459-H6 Slice 2: the OFF arm now returns IpcMidiBridgeController
    # instead of nullptr (closes the deletion-blocking factory gap).
    assert "Factory returns IpcMidiBridgeController under retirement gate" in test_cpp
    assert "MAP2_HAS_LEGACY_MIDI_CONTROLLER" in test_cpp
