"""
T2499-B Slice 4 — pad-sensitivity calibrator tests.

Pins the heuristic + the schema-invariant guards so a future change to
the threshold/max formula has to come with explicit test updates.
"""

from __future__ import annotations

import pytest

from app.services.maschine.calibration_store import (
    MaschineCalibrationStore,
    PAD_COUNT,
    default_calibration_payload,
)
from app.services.maschine.pad_sensitivity_calibrator import (
    PadSensitivityCalibrationError,
    PadSensitivityCalibrator,
    PressMode,
)


# ---------------------------------------------------------------------------
# record_press validation
# ---------------------------------------------------------------------------


def test_record_press_rejects_negative_index() -> None:
    cal = PadSensitivityCalibrator()
    with pytest.raises(PadSensitivityCalibrationError, match="pad_index"):
        cal.record_press(-1, PressMode.LIGHT, 50)


def test_record_press_rejects_index_at_or_above_pad_count() -> None:
    cal = PadSensitivityCalibrator()
    with pytest.raises(PadSensitivityCalibrationError, match="pad_index"):
        cal.record_press(PAD_COUNT, PressMode.LIGHT, 50)


def test_record_press_rejects_velocity_zero() -> None:
    cal = PadSensitivityCalibrator()
    with pytest.raises(PadSensitivityCalibrationError, match="velocity"):
        cal.record_press(0, PressMode.LIGHT, 0)


def test_record_press_rejects_velocity_above_127() -> None:
    cal = PadSensitivityCalibrator()
    with pytest.raises(PadSensitivityCalibrationError, match="velocity"):
        cal.record_press(0, PressMode.LIGHT, 128)


def test_record_press_rejects_non_press_mode() -> None:
    cal = PadSensitivityCalibrator()
    with pytest.raises(PadSensitivityCalibrationError, match="PressMode"):
        cal.record_press(0, "light", 50)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# coverage()
# ---------------------------------------------------------------------------


def test_coverage_starts_empty() -> None:
    cal = PadSensitivityCalibrator()
    cov = cal.coverage()
    assert cov.pads_with_light == 0
    assert cov.pads_with_hard == 0
    assert cov.missing_light == list(range(PAD_COUNT))
    assert cov.missing_hard == list(range(PAD_COUNT))
    assert cov.complete is False


def test_coverage_complete_when_every_pad_has_both_modes() -> None:
    cal = PadSensitivityCalibrator()
    for index in range(PAD_COUNT):
        cal.record_press(index, PressMode.LIGHT, 5)
        cal.record_press(index, PressMode.HARD, 100)
    cov = cal.coverage()
    assert cov.complete is True
    assert cov.missing_light == []
    assert cov.missing_hard == []


def test_coverage_lists_missing_pads() -> None:
    cal = PadSensitivityCalibrator()
    for index in [0, 4, 8, 12]:
        cal.record_press(index, PressMode.LIGHT, 5)
    cov = cal.coverage()
    assert cov.pads_with_light == 4
    assert cov.missing_light == [1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15]


# ---------------------------------------------------------------------------
# Heuristic — threshold = min(light) + 1; max = max(hard); spaced by ≥ 8
# ---------------------------------------------------------------------------


def test_finalize_threshold_is_one_above_min_light_press() -> None:
    cal = PadSensitivityCalibrator()
    cal.record_press(0, PressMode.LIGHT, 5)
    cal.record_press(0, PressMode.LIGHT, 7)
    cal.record_press(0, PressMode.LIGHT, 4)
    cal.record_press(0, PressMode.HARD, 110)
    pads = cal.finalize()
    assert pads[0]["threshold"] == 5  # min(4,5,7) + 1 = 5


def test_finalize_max_velocity_is_max_hard_press() -> None:
    cal = PadSensitivityCalibrator()
    cal.record_press(3, PressMode.LIGHT, 5)
    cal.record_press(3, PressMode.HARD, 90)
    cal.record_press(3, PressMode.HARD, 120)
    cal.record_press(3, PressMode.HARD, 88)
    pads = cal.finalize()
    assert pads[3]["max_velocity"] == 120


def test_finalize_enforces_min_spacing_when_observations_collide() -> None:
    cal = PadSensitivityCalibrator()
    # Operator pressed both modes nearly the same — heuristic must
    # still produce a schema-valid pair (max - threshold ≥ 8).
    cal.record_press(0, PressMode.LIGHT, 50)
    cal.record_press(0, PressMode.HARD, 52)
    pads = cal.finalize()
    assert pads[0]["threshold"] == 51
    # max should be bumped to 51 + 8 = 59.
    assert pads[0]["max_velocity"] == 59


def test_finalize_clamps_threshold_to_minimum_1() -> None:
    cal = PadSensitivityCalibrator()
    # min(light) + 1 = 1 → threshold = 1, not 0.
    cal.record_press(0, PressMode.LIGHT, 0 + 1)  # smallest legal velocity
    cal.record_press(0, PressMode.HARD, 100)
    pads = cal.finalize()
    assert pads[0]["threshold"] >= 1


def test_finalize_clamps_threshold_to_maximum_64() -> None:
    cal = PadSensitivityCalibrator()
    cal.record_press(0, PressMode.LIGHT, 100)
    cal.record_press(0, PressMode.HARD, 120)
    pads = cal.finalize()
    assert pads[0]["threshold"] == 64


def test_finalize_clamps_max_velocity_to_127() -> None:
    cal = PadSensitivityCalibrator()
    cal.record_press(0, PressMode.LIGHT, 5)
    cal.record_press(0, PressMode.HARD, 127)
    pads = cal.finalize()
    assert pads[0]["max_velocity"] == 127


# ---------------------------------------------------------------------------
# Defaults for unobserved pads + modes
# ---------------------------------------------------------------------------


def test_finalize_uses_defaults_for_pads_with_no_observations() -> None:
    cal = PadSensitivityCalibrator()
    pads = cal.finalize()
    # Defaults match calibration_store.default_pad_sensitivity().
    for pad in pads:
        assert pad["threshold"] == 8
        assert pad["max_velocity"] == 120


def test_finalize_uses_default_threshold_when_only_hard_observed() -> None:
    cal = PadSensitivityCalibrator()
    cal.record_press(2, PressMode.HARD, 90)
    pads = cal.finalize()
    assert pads[2]["threshold"] == 8  # default
    assert pads[2]["max_velocity"] == 90


def test_finalize_uses_default_max_when_only_light_observed() -> None:
    cal = PadSensitivityCalibrator()
    cal.record_press(7, PressMode.LIGHT, 4)
    pads = cal.finalize()
    assert pads[7]["threshold"] == 5
    assert pads[7]["max_velocity"] == 120  # default


# ---------------------------------------------------------------------------
# Round-trip — finalize() output passes calibration_store schema
# ---------------------------------------------------------------------------


def test_finalize_output_passes_calibration_schema(tmp_path) -> None:
    cal = PadSensitivityCalibrator()
    for index in range(PAD_COUNT):
        cal.record_press(index, PressMode.LIGHT, 3 + index)
        cal.record_press(index, PressMode.HARD, 80 + index)
    payload = cal.finalize()
    store = MaschineCalibrationStore(usb_serial="ROUNDTRIP", directory=tmp_path)
    full = default_calibration_payload("ROUNDTRIP")
    full["pad_sensitivity"] = payload
    store.save(full)
    loaded = store.load()
    assert loaded is not None
    assert len(loaded["pad_sensitivity"]) == PAD_COUNT
