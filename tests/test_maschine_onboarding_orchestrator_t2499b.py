"""
T2499-B Slice 3 — onboarding orchestrator tests.

Pins:
- Q4 hot-load decision when calibration file exists + valid.
- Q50 first-connection-tour decision when calibration is missing.
- ERASE-skip writes defaults so the NEXT connect takes the Q4 path.
- Full happy-path tour → 4 phases → READY.
- Invalid transitions raise OnboardingTransitionError.
- USB disconnect from any state lands in DISCONNECTED, then resets.
- Observer fan-out + crash isolation.
"""

from __future__ import annotations

from pathlib import Path
from typing import List

import pytest

from app.services.maschine.calibration_store import (
    MaschineCalibrationStore,
    default_calibration_payload,
    default_lcd,
    default_pad_sensitivity,
    default_pressure_curves,
)
from app.services.maschine.onboarding_orchestrator import (
    MaschineOnboardingOrchestrator,
    OnboardingEvent,
    OnboardingState,
    OnboardingTransitionError,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _new(tmp_path: Path) -> MaschineOnboardingOrchestrator:
    return MaschineOnboardingOrchestrator(calibration_directory=tmp_path)


# ---------------------------------------------------------------------------
# Initial state
# ---------------------------------------------------------------------------


def test_initial_state_is_idle(tmp_path: Path) -> None:
    orch = _new(tmp_path)
    assert orch.state is OnboardingState.IDLE
    assert orch.usb_serial is None
    assert orch.history == []


# ---------------------------------------------------------------------------
# Q4 hot-load decision — calibration file exists, machine goes IDLE → DECIDING
# → HOT_LOAD → READY in one signal.
# ---------------------------------------------------------------------------


def test_q4_hot_load_decision_when_calibration_complete(tmp_path: Path) -> None:
    serial = "UNIT-A"
    MaschineCalibrationStore(usb_serial=serial, directory=tmp_path).save(
        default_calibration_payload(serial),
    )
    orch = _new(tmp_path)
    final_state = orch.on_usb_connect(serial)
    assert final_state is OnboardingState.READY
    transitions = [(e.previous_state, e.new_state) for e in orch.history]
    assert transitions == [
        (OnboardingState.IDLE, OnboardingState.DECIDING),
        (OnboardingState.DECIDING, OnboardingState.HOT_LOAD),
        (OnboardingState.HOT_LOAD, OnboardingState.READY),
    ]


def test_q4_hot_load_emits_calibrated_at_in_payload(tmp_path: Path) -> None:
    serial = "UNIT-CAL-AT"
    store = MaschineCalibrationStore(usb_serial=serial, directory=tmp_path)
    store.save(default_calibration_payload(serial))
    orch = _new(tmp_path)
    orch.on_usb_connect(serial)
    ready = [e for e in orch.history if e.new_state is OnboardingState.READY][0]
    assert "calibrated_at" in ready.payload
    assert ready.payload["calibrated_at"]


# ---------------------------------------------------------------------------
# Q50 first-connection tour — no calibration on disk, machine enters TOUR
# ---------------------------------------------------------------------------


def test_q50_tour_decision_when_no_calibration_file(tmp_path: Path) -> None:
    orch = _new(tmp_path)
    final_state = orch.on_usb_connect("UNIT-NEW")
    assert final_state is OnboardingState.TOUR
    transitions = [(e.previous_state, e.new_state) for e in orch.history]
    assert transitions == [
        (OnboardingState.IDLE, OnboardingState.DECIDING),
        (OnboardingState.DECIDING, OnboardingState.TOUR),
    ]


def test_q50_tour_path_when_calibration_corrupt(tmp_path: Path) -> None:
    """A corrupt YAML is treated like a missing file — operator gets the tour."""
    serial = "UNIT-CORRUPT"
    store = MaschineCalibrationStore(usb_serial=serial, directory=tmp_path)
    store.path().parent.mkdir(parents=True, exist_ok=True)
    store.path().write_text("{this is :: not valid yaml: %", encoding="utf-8")
    orch = _new(tmp_path)
    final_state = orch.on_usb_connect(serial)
    assert final_state is OnboardingState.TOUR


def test_q50_tour_path_when_calibration_missing_section(tmp_path: Path) -> None:
    """Calibration file exists but lacks a required section → tour."""
    serial = "UNIT-PARTIAL"
    file_path = tmp_path / f"maschine-mk1-{serial}-calibrated.yaml"
    import yaml
    file_path.write_text(
        yaml.safe_dump(
            {
                "schema_version": 1,
                "device": "maschine-mk1",
                "usb_serial": serial,
                "pad_sensitivity": default_pad_sensitivity(),
                # NOTE: pressure_curves + lcd missing
            }
        ),
        encoding="utf-8",
    )
    orch = _new(tmp_path)
    # Load will raise schema error → caught, treated as corrupt → tour.
    final_state = orch.on_usb_connect(serial)
    assert final_state is OnboardingState.TOUR


# ---------------------------------------------------------------------------
# ERASE-skip — writes defaults + lands in READY
# ---------------------------------------------------------------------------


def test_erase_skip_writes_default_calibration(tmp_path: Path) -> None:
    serial = "UNIT-SKIP"
    orch = _new(tmp_path)
    orch.on_usb_connect(serial)
    assert orch.state is OnboardingState.TOUR
    final_state = orch.on_skip_calibration()
    assert final_state is OnboardingState.READY
    # And the file is on disk so the next connect goes hot-load.
    file_path = tmp_path / f"maschine-mk1-{serial}-calibrated.yaml"
    assert file_path.exists()


def test_erase_skip_makes_next_connect_take_hot_load(tmp_path: Path) -> None:
    serial = "UNIT-SKIP-RECONNECT"
    orch1 = _new(tmp_path)
    orch1.on_usb_connect(serial)
    orch1.on_skip_calibration()
    # Simulate disconnect + new daemon session.
    orch2 = _new(tmp_path)
    final_state = orch2.on_usb_connect(serial)
    assert final_state is OnboardingState.READY
    # And we got there via HOT_LOAD, not TOUR.
    assert any(e.new_state is OnboardingState.HOT_LOAD for e in orch2.history)


# ---------------------------------------------------------------------------
# Full happy path — tour → 4 phases → READY
# ---------------------------------------------------------------------------


def test_full_happy_path_walks_every_phase_and_persists(tmp_path: Path) -> None:
    serial = "UNIT-FULL"
    orch = _new(tmp_path)
    orch.on_usb_connect(serial)
    orch.on_tour_complete()
    assert orch.state is OnboardingState.PAD_SENSITIVITY
    orch.on_phase_complete(OnboardingState.PAD_SENSITIVITY, default_pad_sensitivity())
    assert orch.state is OnboardingState.PRESSURE_CURVES
    orch.on_phase_complete(OnboardingState.PRESSURE_CURVES, default_pressure_curves())
    assert orch.state is OnboardingState.LCD_CALIBRATION
    orch.on_phase_complete(OnboardingState.LCD_CALIBRATION, default_lcd())
    assert orch.state is OnboardingState.PROFILE_SELECTION
    orch.on_phase_complete(OnboardingState.PROFILE_SELECTION, {"id": "T1"})
    assert orch.state is OnboardingState.READY
    # Calibration file is on disk and complete.
    file_path = tmp_path / f"maschine-mk1-{serial}-calibrated.yaml"
    assert file_path.exists()
    loaded = MaschineCalibrationStore(usb_serial=serial, directory=tmp_path).load()
    assert loaded is not None
    assert loaded["selected_profile"] == {"id": "T1"}


# ---------------------------------------------------------------------------
# Invalid transitions raise
# ---------------------------------------------------------------------------


def test_on_tour_complete_from_idle_raises(tmp_path: Path) -> None:
    orch = _new(tmp_path)
    with pytest.raises(OnboardingTransitionError, match="TOUR"):
        orch.on_tour_complete()


def test_on_skip_from_idle_raises(tmp_path: Path) -> None:
    orch = _new(tmp_path)
    with pytest.raises(OnboardingTransitionError, match="TOUR"):
        orch.on_skip_calibration()


def test_phase_complete_from_wrong_state_raises(tmp_path: Path) -> None:
    orch = _new(tmp_path)
    orch.on_usb_connect("UNIT-WRONG")
    orch.on_tour_complete()
    # In PAD_SENSITIVITY now.
    with pytest.raises(OnboardingTransitionError, match="LCD_CALIBRATION"):
        orch.on_phase_complete(OnboardingState.LCD_CALIBRATION, default_lcd())


def test_double_connect_raises(tmp_path: Path) -> None:
    orch = _new(tmp_path)
    orch.on_usb_connect("UNIT-DUP")
    with pytest.raises(OnboardingTransitionError, match="IDLE"):
        orch.on_usb_connect("UNIT-DUP")


def test_reset_from_non_disconnected_raises(tmp_path: Path) -> None:
    orch = _new(tmp_path)
    with pytest.raises(OnboardingTransitionError, match="DISCONNECTED"):
        orch.reset_for_reconnect()


# ---------------------------------------------------------------------------
# Disconnect / reset cycle
# ---------------------------------------------------------------------------


def test_disconnect_from_tour(tmp_path: Path) -> None:
    orch = _new(tmp_path)
    orch.on_usb_connect("UNIT-DROP")
    final = orch.on_disconnect()
    assert final is OnboardingState.DISCONNECTED
    assert orch.usb_serial is None


def test_reset_returns_machine_to_idle(tmp_path: Path) -> None:
    orch = _new(tmp_path)
    orch.on_usb_connect("UNIT-RESET")
    orch.on_disconnect()
    final = orch.reset_for_reconnect()
    assert final is OnboardingState.IDLE
    # And we can connect again.
    orch.on_usb_connect("UNIT-RESET-2")


def test_idempotent_disconnect(tmp_path: Path) -> None:
    orch = _new(tmp_path)
    orch.on_usb_connect("UNIT-ID")
    orch.on_disconnect()
    # Second call is a no-op.
    final = orch.on_disconnect()
    assert final is OnboardingState.DISCONNECTED


# ---------------------------------------------------------------------------
# Observer fan-out + crash isolation
# ---------------------------------------------------------------------------


def test_observer_receives_every_transition(tmp_path: Path) -> None:
    captured: List[OnboardingEvent] = []
    orch = _new(tmp_path)
    orch.add_observer(captured.append)
    orch.on_usb_connect("UNIT-OBS")
    # Q50 path — IDLE→DECIDING + DECIDING→TOUR.
    assert len(captured) == 2
    assert captured[0].new_state is OnboardingState.DECIDING
    assert captured[1].new_state is OnboardingState.TOUR


def test_observer_exception_does_not_break_machine(tmp_path: Path) -> None:
    other_called: List[OnboardingEvent] = []
    orch = _new(tmp_path)

    def _bad(_event: OnboardingEvent) -> None:
        raise RuntimeError("downstream observer is broken")

    orch.add_observer(_bad)
    orch.add_observer(other_called.append)
    orch.on_usb_connect("UNIT-CRASH")
    # Both observers were invoked; the machine reached TOUR.
    assert orch.state is OnboardingState.TOUR
    assert len(other_called) == 2


def test_remove_observer_silently_ignores_unregistered(tmp_path: Path) -> None:
    orch = _new(tmp_path)
    # Should not raise.
    orch.remove_observer(lambda _e: None)


# ---------------------------------------------------------------------------
# History introspection
# ---------------------------------------------------------------------------


def test_history_is_a_copy_so_external_mutation_does_not_leak(tmp_path: Path) -> None:
    orch = _new(tmp_path)
    orch.on_usb_connect("UNIT-HIST")
    snapshot = orch.history
    snapshot.clear()
    # Internal history is preserved.
    assert len(orch.history) == 2
