"""T2499-B Slice 7 — profile-selection driver tests.

Coverage:
  - Catalog enumeration: live JSON descriptors + code-defined T9 →
    25-profile T1..T25 catalog in stable order.
  - is_complete_catalog() truth on the live (live-shipped) data.
  - Selection input validation: shape (T1..T25 regex), unregistered ids,
    clear-and-replace semantics.
  - finalize() round-trip via MaschineCalibrationStore.update(
    selected_profile=...) — proves the payload shape passes the
    schema validator end-to-end.
  - Empty / drifted / corrupt catalog fixtures isolate every error path.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict

import pytest

from app.services.maschine.calibration_store import (
    MaschineCalibrationStore,
    default_calibration_payload,
)
from app.services.maschine.profile_selection_driver import (
    ProfileCatalogEntry,
    ProfileSelectionDriver,
    ProfileSelectionError,
    T9_CATALOG_ENTRY,
)


# ---------------------------------------------------------------------------
# Catalog enumeration — live data
# ---------------------------------------------------------------------------


def test_live_catalog_is_complete_T1_through_T25():
    driver = ProfileSelectionDriver()

    ids = [entry.id for entry in driver.catalog]
    assert ids == [f"T{n}" for n in range(1, 26)]
    assert driver.is_complete_catalog()


def test_live_catalog_includes_code_defined_T9_entry():
    driver = ProfileSelectionDriver()

    t9 = next(entry for entry in driver.catalog if entry.id == "T9")
    assert t9 == ProfileCatalogEntry(
        id="T9",
        name=T9_CATALOG_ENTRY[1],
        source="code",
    )


def test_live_catalog_entries_have_names_and_json_source():
    driver = ProfileSelectionDriver()

    for entry in driver.catalog:
        assert entry.id
        assert entry.name, f"profile {entry.id} has no name"
        if entry.id == "T9":
            assert entry.source == "code"
        else:
            assert entry.source == "json"


# ---------------------------------------------------------------------------
# Selection input validation
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("good_id", [f"T{n}" for n in (1, 9, 14, 25)])
def test_select_accepts_every_catalog_id(good_id):
    driver = ProfileSelectionDriver()

    driver.select(good_id)

    assert driver.selected == good_id


@pytest.mark.parametrize(
    "bad_id",
    [
        "",
        "T0",
        "T26",
        "T100",
        "t1",
        "T1 ",
        "1",
        "CTRL",
        "T",
        None,
    ],
)
def test_select_rejects_invalid_ids(bad_id):
    driver = ProfileSelectionDriver()

    with pytest.raises(ProfileSelectionError):
        driver.select(bad_id)  # type: ignore[arg-type]

    assert driver.selected is None


def test_select_replaces_prior_selection():
    driver = ProfileSelectionDriver()

    driver.select("T1")
    driver.select("T14")

    assert driver.selected == "T14"


def test_clear_resets_selection():
    driver = ProfileSelectionDriver()
    driver.select("T7")
    assert driver.selected == "T7"

    driver.clear()

    assert driver.selected is None


# ---------------------------------------------------------------------------
# finalize() + calibration_store round-trip
# ---------------------------------------------------------------------------


def test_finalize_before_select_raises():
    driver = ProfileSelectionDriver()

    with pytest.raises(ProfileSelectionError):
        driver.finalize()


def test_finalize_returns_calibration_store_compatible_payload(tmp_path):
    driver = ProfileSelectionDriver()
    driver.select("T18")

    payload = driver.finalize()

    assert payload == {"id": "T18"}

    # Schema round-trip: the payload from finalize() must be accepted
    # by MaschineCalibrationStore.update(selected_profile=...) without
    # raising any validation error.
    store = MaschineCalibrationStore(usb_serial="AB-CD-1234", directory=tmp_path)
    store.save(default_calibration_payload("AB-CD-1234"))
    store.update(selected_profile=payload)
    written = store.load()

    assert written["selected_profile"] == {"id": "T18"}


def test_finalize_round_trip_for_every_catalog_id(tmp_path):
    """End-to-end smoke test that every catalog id finalises into a
    schema-valid payload. Catches drift between the regex in
    `_validate_profile` and the catalog enumeration."""
    serial = "XYZ-00-0000"
    store = MaschineCalibrationStore(usb_serial=serial, directory=tmp_path)
    store.save(default_calibration_payload(serial))

    driver = ProfileSelectionDriver()
    for entry in driver.catalog:
        driver.select(entry.id)
        payload = driver.finalize()
        assert payload == {"id": entry.id}
        store.update(selected_profile=payload)


# ---------------------------------------------------------------------------
# Catalog-root injection — fixtures isolate every error path
# ---------------------------------------------------------------------------


def _write_profile_json(directory: Path, filename: str, payload: Dict[str, object]) -> None:
    (directory / filename).write_text(json.dumps(payload))


def test_missing_catalog_root_raises(tmp_path):
    with pytest.raises(ProfileSelectionError):
        ProfileSelectionDriver(catalog_root=tmp_path / "does-not-exist")


def test_corrupt_json_descriptor_raises(tmp_path):
    (tmp_path / "t1_ctrl.json").write_text("not valid json {")

    with pytest.raises(ProfileSelectionError):
        ProfileSelectionDriver(catalog_root=tmp_path)


def test_duplicate_canonical_id_raises(tmp_path):
    # Two files both resolving to T1 → packaging bug.
    _write_profile_json(tmp_path, "t1_ctrl.json", {"profile_id": "t1_ctrl", "name": "T1 CTRL"})
    _write_profile_json(tmp_path, "t1_alt.json", {"profile_id": "t1_alt", "name": "T1 ALT"})

    with pytest.raises(ProfileSelectionError):
        ProfileSelectionDriver(catalog_root=tmp_path)


def test_non_catalog_ids_are_silently_skipped(tmp_path):
    """Random fixture files with non-T<n> ids must not crash the
    catalog load — only the cardinality check would catch that."""
    _write_profile_json(tmp_path, "draft.json", {"profile_id": "draft_thing", "name": "DRAFT"})
    _write_profile_json(tmp_path, "t1_ctrl.json", {"profile_id": "t1_ctrl", "name": "T1 CTRL"})
    _write_profile_json(tmp_path, "t25_ref.json", {"profile_id": "t25_ref", "name": "T25 REF"})

    driver = ProfileSelectionDriver(catalog_root=tmp_path)

    ids = sorted(entry.id for entry in driver.catalog)
    assert "T1" in ids
    assert "T25" in ids
    assert "T9" in ids  # code-defined fallback always present
    # No 'draft_thing' leaked into the catalog.
    assert not any("draft" in e.name.lower() for e in driver.catalog)


def test_T9_present_even_if_no_json_files(tmp_path):
    """An empty JSON directory still yields a single-entry catalog with
    the code-defined T9 — proves the code-defined fallback path."""
    driver = ProfileSelectionDriver(catalog_root=tmp_path)

    assert [entry.id for entry in driver.catalog] == ["T9"]
    assert not driver.is_complete_catalog()


def test_select_rejects_ids_not_in_drifted_catalog(tmp_path):
    """If a fixture catalog only has T1 + T9, selecting T14 must raise
    even though T14 matches the T1..T25 regex — the driver guards
    against catalog drift, not just shape."""
    _write_profile_json(tmp_path, "t1_ctrl.json", {"profile_id": "t1_ctrl", "name": "T1 CTRL"})

    driver = ProfileSelectionDriver(catalog_root=tmp_path)
    # T9 is auto-registered; only T1 + T9 should be present.
    assert sorted(e.id for e in driver.catalog) == ["T1", "T9"]

    with pytest.raises(ProfileSelectionError):
        driver.select("T14")


def test_descriptor_without_name_falls_back_to_id(tmp_path):
    _write_profile_json(tmp_path, "t3_brws.json", {"profile_id": "t3_brws"})

    driver = ProfileSelectionDriver(catalog_root=tmp_path)

    t3 = next(entry for entry in driver.catalog if entry.id == "T3")
    assert t3.name == "T3"


# ---------------------------------------------------------------------------
# Orchestrator integration — drives PROFILE_SELECTION → READY end-to-end
# ---------------------------------------------------------------------------


def test_driver_payload_advances_orchestrator_to_READY(tmp_path):
    """Smoke test that `driver.finalize()` flowed straight into
    `orchestrator.on_phase_complete(PROFILE_SELECTION, ...)` advances
    the state machine to READY and the per-unit YAML carries the pick.
    Confirms the slice-7 driver is plug-and-play with the slice-3
    orchestrator's generic phase-completion handler."""
    from app.services.maschine.onboarding_orchestrator import (
        MaschineOnboardingOrchestrator,
        OnboardingState,
    )

    serial = "MK1-T7-SLICE7"
    orchestrator = MaschineOnboardingOrchestrator(calibration_directory=tmp_path)

    # Synthesize the upstream state by stepping the machine through the
    # tour + earlier phases. The earlier slices' fitters aren't under
    # test here, so we feed minimal valid section payloads.
    orchestrator.on_usb_connect(usb_serial=serial)
    # No calibration file on disk → orchestrator decides TOUR.
    assert orchestrator.state == OnboardingState.TOUR
    orchestrator.on_tour_complete()
    assert orchestrator.state == OnboardingState.PAD_SENSITIVITY

    from app.services.maschine.calibration_store import (
        default_lcd,
        default_pad_sensitivity,
        default_pressure_curves,
    )
    orchestrator.on_phase_complete(
        OnboardingState.PAD_SENSITIVITY,
        default_pad_sensitivity(),
    )
    orchestrator.on_phase_complete(
        OnboardingState.PRESSURE_CURVES,
        default_pressure_curves(),
    )
    orchestrator.on_phase_complete(
        OnboardingState.LCD_CALIBRATION,
        default_lcd(),
    )
    assert orchestrator.state == OnboardingState.PROFILE_SELECTION

    # The slice-7 driver finalises a real catalog pick.
    driver = ProfileSelectionDriver()
    driver.select("T14")
    orchestrator.on_phase_complete(
        OnboardingState.PROFILE_SELECTION,
        driver.finalize(),
    )

    assert orchestrator.state == OnboardingState.READY

    # Per-unit YAML carries the pick.
    store = MaschineCalibrationStore(usb_serial=serial, directory=tmp_path)
    payload = store.load()
    assert payload is not None
    assert payload["selected_profile"] == {"id": "T14"}
