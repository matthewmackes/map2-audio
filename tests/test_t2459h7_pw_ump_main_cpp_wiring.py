"""T2459-H7-PW-UMP — main.cpp env-var consumer audit.

Pins the wiring between `MAP2_MIDI_BACKEND_FORCE` (set by the Python
substrate detection probe in `app/services/controller_host_pipewire_substrate.py`)
and `Map2MidiBackend::forceSelect()` in the controller-host's main loop.

This test is the regression guard that closes gate G3 of the Path 4
evidence README: until the C++ consumer landed (2026-05-08), the
detection probe was a no-op end-to-end. The audit ensures the consumer
stays wired — a future refactor of `main.cpp` cannot silently break
Path 4 without this test failing.

Lightweight audit: the test reads `main.cpp` source and checks that the
env-var name appears alongside `forceSelect`. We deliberately do NOT
spawn the controller-host binary here — that path is exercised by the
HIL gate captured in `docs/fit-for-purpose-evidence/20260508/t2459h7-pw-ump-path4/`.
"""
from __future__ import annotations

from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
MAIN_CPP = REPO_ROOT / "juce-engine" / "Source" / "ControllerHost" / "main.cpp"


@pytest.fixture(scope="module")
def main_cpp_text() -> str:
    assert MAIN_CPP.exists(), f"missing controller-host main.cpp: {MAIN_CPP}"
    return MAIN_CPP.read_text(encoding="utf-8")


def test_env_var_name_is_referenced(main_cpp_text: str) -> None:
    assert "MAP2_MIDI_BACKEND_FORCE" in main_cpp_text, (
        "main.cpp must read MAP2_MIDI_BACKEND_FORCE — this is how the Python "
        "substrate detection probe (controller_host_pipewire_substrate.py) "
        "communicates the Path 4 backend selection. Without this read, the "
        "probe is a no-op end-to-end and PipeWire 1.4.10+ hosts can't "
        "auto-fallback to ALSA-seq for legacy MIDI 1.0 devices."
    )


def test_env_var_is_passed_to_force_select(main_cpp_text: str) -> None:
    # Find the env-var read; assert forceSelect is called within a reasonable
    # window after it. The window heuristic is intentionally loose — we just
    # need to catch a refactor that splits the env read from the consumer.
    needle = 'std::getenv ("MAP2_MIDI_BACKEND_FORCE")'
    idx = main_cpp_text.find(needle)
    assert idx >= 0, (
        f"main.cpp must read the env var via std::getenv (got: needle not found). "
        f"Expected substring: {needle!r}"
    )
    window = main_cpp_text[idx : idx + 4000]
    assert "forceSelect" in window, (
        "Reading MAP2_MIDI_BACKEND_FORCE without calling forceSelect() in the "
        "same block is meaningless — the env var must drive backend selection."
    )


def test_recognized_backend_strings_are_handled(main_cpp_text: str) -> None:
    # Path 4's primary use case is forcing alsa_seq on PipeWire-1.4.10+ hosts
    # where the UMP-MIDI2 → MIDI 1.0 bridge is broken. The Python probe writes
    # "alsa_seq" verbatim. Pin that token + the other backends supported by
    # the libremidi-side probe order so a typo in the parser surfaces here.
    for token in ("alsa_seq", "jack", "pipewire", "alsa_raw"):
        assert token in main_cpp_text, (
            f"main.cpp env-var parser must recognize the '{token}' value — "
            "the Python substrate detection probe and operator overrides "
            "use these canonical lowercase names."
        )


def test_unrecognized_value_falls_through_to_probe(main_cpp_text: str) -> None:
    # The contract: if MAP2_MIDI_BACKEND_FORCE is set to garbage, log a
    # warning but don't hard-fail — fall back to the locked probe order.
    # This keeps a typo from bricking the host on every restart.
    assert "unrecognized value" in main_cpp_text.lower() or (
        "falling back to probe order" in main_cpp_text.lower()
    ), (
        "main.cpp must emit a diagnostic and fall back to probe() when "
        "MAP2_MIDI_BACKEND_FORCE holds an unrecognized value, otherwise "
        "operator typos would render the host unable to bind any backend."
    )
