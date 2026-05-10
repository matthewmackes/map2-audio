"""
T2499-B Slice 5 — pressure-curve fitter tests.
"""

from __future__ import annotations

import pytest

from app.services.maschine.calibration_store import (
    MaschineCalibrationStore,
    PAD_COUNT,
    default_calibration_payload,
)
from app.services.maschine.pressure_curve_fitter import (
    PressureCurveError,
    PressureCurveFitter,
)


# ---------------------------------------------------------------------------
# Constructor + record_sample validation
# ---------------------------------------------------------------------------


def test_default_order_is_2() -> None:
    fit = PressureCurveFitter()
    fit.record_sample(0, 0.0, 0.0)
    fit.record_sample(0, 0.5, 0.5)
    fit.record_sample(0, 1.0, 1.0)
    payload = fit.finalize()
    # Order 2 → 3 coefficients.
    assert len(payload["per_pad"][0]["polynomial"]) == 3


def test_explicit_order_1() -> None:
    fit = PressureCurveFitter(order=1)
    fit.record_sample(0, 0.0, 0.0)
    fit.record_sample(0, 1.0, 1.0)
    payload = fit.finalize()
    assert len(payload["per_pad"][0]["polynomial"]) == 2


def test_invalid_order_zero_rejected() -> None:
    with pytest.raises(PressureCurveError):
        PressureCurveFitter(order=0)


def test_invalid_order_above_max_rejected() -> None:
    with pytest.raises(PressureCurveError):
        PressureCurveFitter(order=5)


@pytest.mark.parametrize("bad_index", [-1, PAD_COUNT, PAD_COUNT + 5])
def test_record_sample_rejects_invalid_pad_index(bad_index: int) -> None:
    fit = PressureCurveFitter()
    with pytest.raises(PressureCurveError, match="pad_index"):
        fit.record_sample(bad_index, 0.0, 0.0)


@pytest.mark.parametrize("bad_input", [-0.1, 1.5, 99])
def test_record_sample_rejects_input_out_of_range(bad_input: float) -> None:
    fit = PressureCurveFitter()
    with pytest.raises(PressureCurveError, match="input_value"):
        fit.record_sample(0, bad_input, 0.5)


@pytest.mark.parametrize("bad_output", [-0.5, 1.0001])
def test_record_sample_rejects_output_out_of_range(bad_output: float) -> None:
    fit = PressureCurveFitter()
    with pytest.raises(PressureCurveError, match="output_value"):
        fit.record_sample(0, 0.5, bad_output)


# ---------------------------------------------------------------------------
# Fit fidelity — known curves should round-trip
# ---------------------------------------------------------------------------


def test_linear_data_fits_back_to_y_equals_x() -> None:
    fit = PressureCurveFitter(order=1)
    for x in [0.0, 0.25, 0.5, 0.75, 1.0]:
        fit.record_sample(0, x, x)
    poly = fit.finalize()["per_pad"][0]["polynomial"]
    # poly = [c0, c1] with c0 ≈ 0, c1 ≈ 1.
    assert abs(poly[0]) < 1e-9
    assert abs(poly[1] - 1.0) < 1e-9


def test_quadratic_data_fits_back_to_y_equals_x_squared() -> None:
    fit = PressureCurveFitter(order=2)
    for x in [0.0, 0.2, 0.4, 0.6, 0.8, 1.0]:
        fit.record_sample(0, x, x * x)
    poly = fit.finalize()["per_pad"][0]["polynomial"]
    # poly = [c0, c1, c2] with c0 ≈ 0, c1 ≈ 0, c2 ≈ 1.
    assert abs(poly[0]) < 1e-9
    assert abs(poly[1]) < 1e-9
    assert abs(poly[2] - 1.0) < 1e-9


def test_offset_linear_fits_intercept_and_slope() -> None:
    fit = PressureCurveFitter(order=1)
    # y = 0.1 + 0.8*x
    for x in [0.0, 0.25, 0.5, 0.75, 1.0]:
        fit.record_sample(0, x, 0.1 + 0.8 * x)
    poly = fit.finalize()["per_pad"][0]["polynomial"]
    assert abs(poly[0] - 0.1) < 1e-9
    assert abs(poly[1] - 0.8) < 1e-9


# ---------------------------------------------------------------------------
# Effective order reduction when fewer samples than coefficients
# ---------------------------------------------------------------------------


def test_single_sample_yields_constant_polynomial() -> None:
    fit = PressureCurveFitter()
    fit.record_sample(0, 0.5, 0.7)
    poly = fit.finalize()["per_pad"][0]["polynomial"]
    assert poly == [0.7]


def test_two_samples_with_default_order_reduces_to_linear() -> None:
    fit = PressureCurveFitter(order=2)
    fit.record_sample(0, 0.0, 0.0)
    fit.record_sample(0, 1.0, 1.0)
    poly = fit.finalize()["per_pad"][0]["polynomial"]
    # Effective order = min(2, 2-1) = 1 → 2 coefficients.
    assert len(poly) == 2
    assert abs(poly[0]) < 1e-9
    assert abs(poly[1] - 1.0) < 1e-9


def test_unobserved_pads_use_default_polynomial() -> None:
    fit = PressureCurveFitter()
    payload = fit.finalize()
    for pad in payload["per_pad"]:
        assert pad["polynomial"] == [0.0, 1.0]


# ---------------------------------------------------------------------------
# Global compensation
# ---------------------------------------------------------------------------


def test_global_compensation_is_zero_with_no_samples() -> None:
    fit = PressureCurveFitter()
    payload = fit.finalize()
    assert payload["global_compensation"] == 0.0


def test_global_compensation_captures_uniform_positive_bias() -> None:
    fit = PressureCurveFitter(order=1)
    # Every sample reads +0.05 above the linear identity → global comp ≈ 0.05.
    for x in [0.0, 0.25, 0.5, 0.75, 1.0]:
        fit.record_sample(0, x, x + 0.05 if x + 0.05 <= 1.0 else 1.0)
    payload = fit.finalize()
    assert 0.03 <= payload["global_compensation"] <= 0.05


def test_global_compensation_clamps_to_unit_interval() -> None:
    fit = PressureCurveFitter(order=1)
    # Force a heavy bias: every sample at output=1.0 even at small input.
    fit.record_sample(0, 0.0, 1.0)
    fit.record_sample(0, 0.0, 1.0)
    payload = fit.finalize()
    assert -1.0 <= payload["global_compensation"] <= 1.0


# ---------------------------------------------------------------------------
# Round-trip — finalize() output passes calibration_store schema
# ---------------------------------------------------------------------------


def test_finalize_output_passes_calibration_schema(tmp_path) -> None:
    fit = PressureCurveFitter(order=2)
    for index in range(PAD_COUNT):
        for x in [0.0, 0.5, 1.0]:
            fit.record_sample(index, x, x * x)
    curves = fit.finalize()
    store = MaschineCalibrationStore(usb_serial="ROUNDTRIP-PRES", directory=tmp_path)
    full = default_calibration_payload("ROUNDTRIP-PRES")
    full["pressure_curves"] = curves
    store.save(full)
    loaded = store.load()
    assert loaded is not None
    assert len(loaded["pressure_curves"]["per_pad"]) == PAD_COUNT
    for pad in loaded["pressure_curves"]["per_pad"]:
        assert 1 <= len(pad["polynomial"]) <= 4
