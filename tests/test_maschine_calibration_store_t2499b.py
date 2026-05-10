"""
T2499-B Slice 2 — calibration store tests.

Pins the schema + atomic-writer + per-serial keying invariants so the
orchestrator slice (Slice 3+) can build on a stable foundation.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest
import yaml

from app.services.maschine.calibration_store import (
    CalibrationSchemaError,
    MaschineCalibrationStore,
    SCHEMA_VERSION,
    default_calibration_payload,
    default_lcd,
    default_pad_sensitivity,
    default_pressure_curves,
    list_calibrated_units,
)


# ---------------------------------------------------------------------------
# Path / serial behavior
# ---------------------------------------------------------------------------


def test_path_uses_serial_in_filename(tmp_path: Path) -> None:
    store = MaschineCalibrationStore(usb_serial="ABC123", directory=tmp_path)
    assert store.path() == tmp_path / "maschine-mk1-ABC123-calibrated.yaml"


def test_two_serials_have_distinct_paths(tmp_path: Path) -> None:
    a = MaschineCalibrationStore(usb_serial="UNIT-A", directory=tmp_path)
    b = MaschineCalibrationStore(usb_serial="UNIT-B", directory=tmp_path)
    assert a.path() != b.path()


@pytest.mark.parametrize(
    "bad_serial",
    [
        "",
        "has space",
        "../../etc/passwd",
        "rm-rf-/",  # hyphens OK, but '/' is rejected
        "x" * 65,
        "back\\slash",
    ],
)
def test_invalid_serial_rejected(bad_serial: str, tmp_path: Path) -> None:
    with pytest.raises(CalibrationSchemaError):
        MaschineCalibrationStore(usb_serial=bad_serial, directory=tmp_path)


def test_valid_serials_accepted(tmp_path: Path) -> None:
    for serial in ["A", "ABC123", "ni-mk1-001", "ni_mk1_001", "v1.2.3"]:
        MaschineCalibrationStore(usb_serial=serial, directory=tmp_path)


# ---------------------------------------------------------------------------
# Defaults are valid
# ---------------------------------------------------------------------------


def test_default_payload_is_self_consistent(tmp_path: Path) -> None:
    store = MaschineCalibrationStore(usb_serial="UNIT-1", directory=tmp_path)
    payload = default_calibration_payload("UNIT-1")
    saved = store.save(payload)
    assert saved.exists()
    loaded = store.load()
    assert loaded is not None
    assert loaded["device"] == "maschine-mk1"
    assert loaded["usb_serial"] == "UNIT-1"
    assert loaded["schema_version"] == SCHEMA_VERSION
    assert len(loaded["pad_sensitivity"]) == 16


def test_default_pad_sensitivity_has_16_pads_with_threshold_lt_max() -> None:
    pads = default_pad_sensitivity()
    assert len(pads) == 16
    for pad in pads:
        assert pad["threshold"] < pad["max_velocity"]


def test_default_pressure_curves_have_16_pads() -> None:
    curves = default_pressure_curves()
    assert curves["global_compensation"] == 0.0
    assert len(curves["per_pad"]) == 16


def test_default_lcd_has_both_sides() -> None:
    lcd = default_lcd()
    assert "left" in lcd["per_lcd_bias"]
    assert "right" in lcd["per_lcd_bias"]


# ---------------------------------------------------------------------------
# Schema validation — pad sensitivity
# ---------------------------------------------------------------------------


def _good() -> dict:
    return default_calibration_payload("UNIT-Z")


def test_pad_sensitivity_must_have_16_entries(tmp_path: Path) -> None:
    store = MaschineCalibrationStore(usb_serial="UNIT-Z", directory=tmp_path)
    bad = _good()
    bad["pad_sensitivity"] = bad["pad_sensitivity"][:15]
    with pytest.raises(CalibrationSchemaError, match="exactly 16"):
        store.save(bad)


def test_pad_sensitivity_max_velocity_must_exceed_threshold(tmp_path: Path) -> None:
    store = MaschineCalibrationStore(usb_serial="UNIT-Z", directory=tmp_path)
    bad = _good()
    bad["pad_sensitivity"][0] = {"threshold": 100, "max_velocity": 100}
    with pytest.raises(CalibrationSchemaError, match="must exceed threshold"):
        store.save(bad)


def test_pad_sensitivity_threshold_out_of_range_rejected(tmp_path: Path) -> None:
    store = MaschineCalibrationStore(usb_serial="UNIT-Z", directory=tmp_path)
    bad = _good()
    bad["pad_sensitivity"][0]["threshold"] = 200
    with pytest.raises(CalibrationSchemaError, match="0..127"):
        store.save(bad)


# ---------------------------------------------------------------------------
# Schema validation — pressure curves
# ---------------------------------------------------------------------------


def test_pressure_global_compensation_out_of_range_rejected(tmp_path: Path) -> None:
    store = MaschineCalibrationStore(usb_serial="UNIT-Z", directory=tmp_path)
    bad = _good()
    bad["pressure_curves"]["global_compensation"] = 5.0
    with pytest.raises(CalibrationSchemaError, match="-1.0..1.0"):
        store.save(bad)


def test_pressure_polynomial_must_have_1_to_4_coefficients(tmp_path: Path) -> None:
    store = MaschineCalibrationStore(usb_serial="UNIT-Z", directory=tmp_path)
    bad = _good()
    bad["pressure_curves"]["per_pad"][3]["polynomial"] = []
    with pytest.raises(CalibrationSchemaError, match="1..4 coefficients"):
        store.save(bad)


# ---------------------------------------------------------------------------
# Schema validation — LCD
# ---------------------------------------------------------------------------


def test_lcd_gamma_out_of_range_rejected(tmp_path: Path) -> None:
    store = MaschineCalibrationStore(usb_serial="UNIT-Z", directory=tmp_path)
    bad = _good()
    bad["lcd"]["gamma"] = 0.1
    with pytest.raises(CalibrationSchemaError, match="0.5..3.0"):
        store.save(bad)


def test_lcd_per_lcd_bias_must_have_left_and_right(tmp_path: Path) -> None:
    store = MaschineCalibrationStore(usb_serial="UNIT-Z", directory=tmp_path)
    bad = _good()
    bad["lcd"]["per_lcd_bias"] = {"left": 0}
    with pytest.raises(CalibrationSchemaError, match="'right'"):
        store.save(bad)


# ---------------------------------------------------------------------------
# Schema validation — selected_profile (T700 Q68 catalog)
# ---------------------------------------------------------------------------


def test_selected_profile_optional(tmp_path: Path) -> None:
    store = MaschineCalibrationStore(usb_serial="UNIT-Z", directory=tmp_path)
    payload = _good()
    payload["selected_profile"] = None
    store.save(payload)


@pytest.mark.parametrize("profile_id", ["T1", "T14", "T25"])
def test_selected_profile_t1_through_t25_accepted(profile_id: str, tmp_path: Path) -> None:
    store = MaschineCalibrationStore(usb_serial="UNIT-Z", directory=tmp_path)
    payload = _good()
    payload["selected_profile"] = {"id": profile_id}
    store.save(payload)


@pytest.mark.parametrize("profile_id", ["T0", "T26", "X1", "1", ""])
def test_selected_profile_outside_t1_t25_rejected(profile_id: str, tmp_path: Path) -> None:
    store = MaschineCalibrationStore(usb_serial="UNIT-Z", directory=tmp_path)
    payload = _good()
    payload["selected_profile"] = {"id": profile_id}
    with pytest.raises(CalibrationSchemaError):
        store.save(payload)


# ---------------------------------------------------------------------------
# Atomic write — temp file removed after replace
# ---------------------------------------------------------------------------


def test_save_leaves_no_temp_files(tmp_path: Path) -> None:
    store = MaschineCalibrationStore(usb_serial="ATOMIC", directory=tmp_path)
    store.save(default_calibration_payload("ATOMIC"))
    leftovers = [
        p for p in tmp_path.iterdir() if p.name.startswith(".maschine-mk1-")
    ]
    assert leftovers == []


def test_save_round_trips_through_yaml(tmp_path: Path) -> None:
    store = MaschineCalibrationStore(usb_serial="RT", directory=tmp_path)
    payload = default_calibration_payload("RT")
    payload["pressure_curves"]["global_compensation"] = 0.42
    saved = store.save(payload)
    raw = yaml.safe_load(saved.read_text(encoding="utf-8"))
    assert raw["pressure_curves"]["global_compensation"] == 0.42


def test_save_refuses_payload_with_different_serial(tmp_path: Path) -> None:
    store = MaschineCalibrationStore(usb_serial="MINE", directory=tmp_path)
    bad = default_calibration_payload("YOURS")
    with pytest.raises(CalibrationSchemaError, match="usb_serial"):
        store.save(bad)


def test_save_stamps_calibrated_at_when_missing(tmp_path: Path) -> None:
    store = MaschineCalibrationStore(usb_serial="STAMP", directory=tmp_path)
    payload = default_calibration_payload("STAMP")
    payload["calibrated_at"] = None
    saved = store.save(payload)
    raw = yaml.safe_load(saved.read_text(encoding="utf-8"))
    assert isinstance(raw["calibrated_at"], str)
    assert raw["calibrated_at"]  # non-empty


# ---------------------------------------------------------------------------
# update() — section-wise merge
# ---------------------------------------------------------------------------


def test_update_lcd_only_preserves_other_sections(tmp_path: Path) -> None:
    store = MaschineCalibrationStore(usb_serial="MERGE", directory=tmp_path)
    initial = default_calibration_payload("MERGE")
    initial["pressure_curves"]["global_compensation"] = 0.25
    store.save(initial)
    store.update(lcd={"gamma": 2.0, "per_lcd_bias": {"left": 5, "right": -5}})
    loaded = store.load()
    assert loaded is not None
    assert loaded["lcd"]["gamma"] == 2.0
    assert loaded["pressure_curves"]["global_compensation"] == 0.25


def test_update_unknown_section_rejected(tmp_path: Path) -> None:
    store = MaschineCalibrationStore(usb_serial="MERGE", directory=tmp_path)
    with pytest.raises(CalibrationSchemaError, match="unknown section"):
        store.update(some_random_section={})


def test_update_creates_file_from_default_when_missing(tmp_path: Path) -> None:
    store = MaschineCalibrationStore(usb_serial="FRESH", directory=tmp_path)
    assert not store.exists()
    store.update(selected_profile={"id": "T14"})
    loaded = store.load()
    assert loaded is not None
    assert loaded["selected_profile"]["id"] == "T14"


# ---------------------------------------------------------------------------
# delete()
# ---------------------------------------------------------------------------


def test_delete_returns_true_when_file_existed(tmp_path: Path) -> None:
    store = MaschineCalibrationStore(usb_serial="DEL", directory=tmp_path)
    store.save(default_calibration_payload("DEL"))
    assert store.delete() is True
    assert not store.exists()


def test_delete_returns_false_when_file_absent(tmp_path: Path) -> None:
    store = MaschineCalibrationStore(usb_serial="ABSENT", directory=tmp_path)
    assert store.delete() is False


# ---------------------------------------------------------------------------
# load() — version + device gates
# ---------------------------------------------------------------------------


def test_load_rejects_wrong_schema_version(tmp_path: Path) -> None:
    store = MaschineCalibrationStore(usb_serial="VER", directory=tmp_path)
    payload = default_calibration_payload("VER")
    file_path = store.path()
    file_path.parent.mkdir(parents=True, exist_ok=True)
    payload["schema_version"] = 999
    file_path.write_text(yaml.safe_dump(payload), encoding="utf-8")
    with pytest.raises(CalibrationSchemaError, match="schema_version"):
        store.load()


def test_load_rejects_wrong_device(tmp_path: Path) -> None:
    store = MaschineCalibrationStore(usb_serial="DEV", directory=tmp_path)
    payload = default_calibration_payload("DEV")
    file_path = store.path()
    file_path.parent.mkdir(parents=True, exist_ok=True)
    payload["device"] = "not-mk1"
    file_path.write_text(yaml.safe_dump(payload), encoding="utf-8")
    with pytest.raises(CalibrationSchemaError, match="device"):
        store.load()


def test_load_returns_none_when_file_missing(tmp_path: Path) -> None:
    store = MaschineCalibrationStore(usb_serial="MISSING", directory=tmp_path)
    assert store.load() is None


def test_load_returns_none_for_empty_yaml_file(tmp_path: Path) -> None:
    store = MaschineCalibrationStore(usb_serial="EMPTY", directory=tmp_path)
    file_path = store.path()
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text("", encoding="utf-8")
    assert store.load() is None


# ---------------------------------------------------------------------------
# list_calibrated_units — orchestrator helper
# ---------------------------------------------------------------------------


def test_list_calibrated_units_empty_dir(tmp_path: Path) -> None:
    assert list_calibrated_units(tmp_path) == []


def test_list_calibrated_units_returns_serials_in_sorted_order(tmp_path: Path) -> None:
    for serial in ["zebra", "alpha", "mike"]:
        MaschineCalibrationStore(usb_serial=serial, directory=tmp_path).save(
            default_calibration_payload(serial)
        )
    assert list_calibrated_units(tmp_path) == ["alpha", "mike", "zebra"]


def test_list_calibrated_units_ignores_non_matching_files(tmp_path: Path) -> None:
    (tmp_path / "maschine-mk1-real-calibrated.yaml").write_text(
        yaml.safe_dump(default_calibration_payload("real")),
    )
    (tmp_path / "unrelated.yaml").write_text("foo: bar\n")
    (tmp_path / "maschine-mk1-no-suffix.yaml").write_text("foo: bar\n")
    assert list_calibrated_units(tmp_path) == ["real"]
