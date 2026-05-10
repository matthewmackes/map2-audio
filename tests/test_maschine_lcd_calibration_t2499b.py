"""
T2499-B Slice 6 — LCD calibration grid fitter tests.
"""

from __future__ import annotations

import pytest

from app.services.maschine.calibration_store import (
    MaschineCalibrationStore,
    default_calibration_payload,
)
from app.services.maschine.lcd_calibration_fitter import (
    BIAS_MAX,
    BIAS_MIN,
    GAMMA_MAX,
    GAMMA_MIN,
    LCD_IDS,
    LcdCalibrationError,
    LcdCalibrationFitter,
)


# ---------------------------------------------------------------------------
# record_tap validation
# ---------------------------------------------------------------------------


def test_record_tap_rejects_unknown_lcd_id() -> None:
    fit = LcdCalibrationFitter()
    with pytest.raises(LcdCalibrationError):
        fit.record_tap("center", 0.5, "correct")  # type: ignore[arg-type]


def test_record_tap_rejects_intensity_below_zero() -> None:
    fit = LcdCalibrationFitter()
    with pytest.raises(LcdCalibrationError):
        fit.record_tap("left", -0.01, "correct")


def test_record_tap_rejects_intensity_above_one() -> None:
    fit = LcdCalibrationFitter()
    with pytest.raises(LcdCalibrationError):
        fit.record_tap("right", 1.01, "correct")


def test_record_tap_rejects_unknown_tap_kind() -> None:
    fit = LcdCalibrationFitter()
    with pytest.raises(LcdCalibrationError):
        fit.record_tap("left", 0.5, "neutral")  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# coverage()
# ---------------------------------------------------------------------------


def test_coverage_starts_empty_and_incomplete() -> None:
    fit = LcdCalibrationFitter()
    cov = fit.coverage()
    assert cov["per_lcd"] == {"left": 0, "right": 0}
    assert cov["complete"] is False


def test_coverage_complete_only_when_both_lcds_have_at_least_one_tap() -> None:
    fit = LcdCalibrationFitter()
    fit.record_tap("left", 0.3, "correct")
    assert fit.coverage()["complete"] is False
    fit.record_tap("right", 0.6, "correct")
    assert fit.coverage()["complete"] is True


def test_coverage_counts_per_lcd() -> None:
    fit = LcdCalibrationFitter()
    for step in (0.2, 0.5, 0.8):
        fit.record_tap("left", step, "correct")
    fit.record_tap("right", 0.5, "correct")
    cov = fit.coverage()
    assert cov["per_lcd"] == {"left": 3, "right": 1}


# ---------------------------------------------------------------------------
# finalize() — bias
# ---------------------------------------------------------------------------


def test_finalize_with_no_taps_returns_default_lcd() -> None:
    fit = LcdCalibrationFitter()
    payload = fit.finalize()
    assert payload["gamma"] == 1.0
    assert payload["per_lcd_bias"] == {"left": 0, "right": 0}


def test_finalize_correct_taps_only_yields_zero_bias() -> None:
    fit = LcdCalibrationFitter()
    for step in (0.2, 0.4, 0.5, 0.6, 0.8):
        fit.record_tap("left", step, "correct")
        fit.record_tap("right", step, "correct")
    payload = fit.finalize()
    assert payload["per_lcd_bias"] == {"left": 0, "right": 0}


def test_finalize_consistent_darker_taps_yield_positive_bias() -> None:
    """Operator says every step is too bright → push LCD darker → +bias."""
    fit = LcdCalibrationFitter()
    for step in (0.3, 0.4, 0.5, 0.6, 0.7):
        fit.record_tap("left", step, "darker")
    payload = fit.finalize()
    assert payload["per_lcd_bias"]["left"] > 0
    # Right LCD untouched → 0.
    assert payload["per_lcd_bias"]["right"] == 0


def test_finalize_consistent_lighter_taps_yield_negative_bias() -> None:
    fit = LcdCalibrationFitter()
    for step in (0.3, 0.4, 0.5, 0.6, 0.7):
        fit.record_tap("right", step, "lighter")
    payload = fit.finalize()
    assert payload["per_lcd_bias"]["right"] < 0


def test_finalize_bias_clamped_to_schema_range() -> None:
    """A pathological all-darker run at midtones must clamp to BIAS_MAX."""
    fit = LcdCalibrationFitter()
    for _ in range(50):
        fit.record_tap("left", 0.5, "darker")
    payload = fit.finalize()
    assert BIAS_MIN <= payload["per_lcd_bias"]["left"] <= BIAS_MAX
    assert payload["per_lcd_bias"]["left"] == BIAS_MAX


def test_finalize_endpoints_contribute_no_bias() -> None:
    """Taps at step=0 or step=1 carry zero weight (least info at rails)."""
    fit = LcdCalibrationFitter()
    fit.record_tap("left", 0.0, "darker")
    fit.record_tap("left", 1.0, "darker")
    payload = fit.finalize()
    # Both contributions are 0 → bias rounds to 0.
    assert payload["per_lcd_bias"]["left"] == 0


# ---------------------------------------------------------------------------
# finalize() — gamma
# ---------------------------------------------------------------------------


def test_finalize_all_correct_yields_gamma_one() -> None:
    fit = LcdCalibrationFitter()
    for step in (0.1, 0.3, 0.5, 0.7, 0.9):
        fit.record_tap("left", step, "correct")
        fit.record_tap("right", step, "correct")
    payload = fit.finalize()
    assert payload["gamma"] == pytest.approx(1.0, abs=1e-6)


def test_finalize_consistent_darker_pushes_gamma_above_one() -> None:
    """Operator perceives output too bright → gamma > 1.0 darkens midtones."""
    fit = LcdCalibrationFitter()
    for step in (0.2, 0.4, 0.5, 0.6, 0.8):
        fit.record_tap("left", step, "darker")
        fit.record_tap("right", step, "darker")
    payload = fit.finalize()
    assert payload["gamma"] > 1.0


def test_finalize_consistent_lighter_pushes_gamma_below_one() -> None:
    fit = LcdCalibrationFitter()
    for step in (0.2, 0.4, 0.5, 0.6, 0.8):
        fit.record_tap("left", step, "lighter")
        fit.record_tap("right", step, "lighter")
    payload = fit.finalize()
    assert payload["gamma"] < 1.0


def test_finalize_gamma_clamped_to_schema_range() -> None:
    """Even a pathological dataset must clamp to [0.5, 3.0]."""
    fit = LcdCalibrationFitter()
    # Pile up extreme darker taps near the lower rail. Without the
    # clamp this would drive gamma upward unboundedly.
    for _ in range(200):
        fit.record_tap("left", 0.05, "darker")
    payload = fit.finalize()
    assert GAMMA_MIN <= payload["gamma"] <= GAMMA_MAX


# ---------------------------------------------------------------------------
# Round-trip through the calibration_store schema
# ---------------------------------------------------------------------------


def test_finalize_payload_passes_calibration_store_validation(tmp_path) -> None:
    fit = LcdCalibrationFitter()
    for step in (0.1, 0.3, 0.5, 0.7, 0.9):
        fit.record_tap("left", step, "darker")
        fit.record_tap("right", step, "lighter")
    payload = fit.finalize()
    store = MaschineCalibrationStore(usb_serial="lcd-fitter-test", directory=tmp_path)
    # Seed with a default skeleton so update() has the other sections.
    store.save(default_calibration_payload("lcd-fitter-test"))
    # No exception → schema accepted the fitter output.
    store.update(lcd=payload)
    persisted = store.load()
    assert persisted is not None
    assert persisted["lcd"] == payload


def test_lcd_ids_exposed_for_orchestrator_iteration() -> None:
    """The orchestrator iterates LCD_IDS to drive the calibration grid."""
    assert LCD_IDS == ("left", "right")
