"""HTTP-facing facade over MaschineCalibrationStore.

T2522-C cycle 6 introduced this thin wrapper so the backend routes
in ``app/routes/maschine.py`` can read and write pressure curves
without re-implementing the per-serial, per-pad polynomial schema
that the existing calibration store already enforces.

Why a facade rather than a direct route → store call:

* The store is keyed by ``usb_serial``. The maschine service today
  doesn't propagate the device serial, only ``vendor_id``/``product_id``
  via the registration ``hid_device`` payload. Until that lands, the
  facade resolves the serial from ``hid_device.get("serial_number")``
  and falls back to a deterministic ``"default-mk1"`` so single-device
  installations work out of the box. Multi-device sites can add
  ``serial_number`` to the daemon-side registration payload to
  partition calibrations correctly.

* The store's ``update()`` method validates against
  ``calibration_store._validate_payload``; any malformed curve POST
  surfaces as a ``CalibrationSchemaError``. The route translates that
  into HTTP 400.

* The facade is the single seam future cycles wire to (per-pad
  velocity curves are a separate registry section — see T2522-C-CAL
  follow-on; same shape will land here when that ships).
"""

from __future__ import annotations

from typing import Any, Dict, List, Mapping

from app.services.maschine.calibration_store import (
    CalibrationSchemaError,
    MaschineCalibrationStore,
    PAD_COUNT,
    default_pressure_curves,
)
from app.services.maschine_service import get_maschine_service


# Stable fallback when the daemon hasn't reported a real serial yet.
# Single-device installs get a stable file at
# ~/.map2/devices/maschine-mk1-default-mk1-calibrated.yaml; multi-device
# installs need to start propagating ``hid_device.serial_number``.
DEFAULT_USB_SERIAL = "default-mk1"


def _resolve_usb_serial() -> str:
    state = get_maschine_service().get_status()
    hid = state.get("hid_device") or {}
    serial = hid.get("serial_number") or hid.get("serial")
    if isinstance(serial, str) and serial.strip():
        return serial.strip()
    return DEFAULT_USB_SERIAL


def _store_for_active_device() -> MaschineCalibrationStore:
    return MaschineCalibrationStore(usb_serial=_resolve_usb_serial())


def get_pressure_curves() -> Dict[str, Any]:
    """Return the active device's pressure-curve calibration block.

    Falls back to the linear default (``y = x`` per pad, zero global
    compensation) when no calibration file exists on disk yet.
    Always shape-validated against the registry schema before return.
    """
    store = _store_for_active_device()
    try:
        existing = store.load()
    except Exception:
        existing = None
    if existing is None:
        curves = default_pressure_curves()
    else:
        curves = existing.get("pressure_curves") or default_pressure_curves()
    return {
        "usb_serial": store._usb_serial,
        "pressure_curves": curves,
    }


def _validate_curve_polynomial(per_pad: List[Dict[str, Any]]) -> None:
    if not isinstance(per_pad, list) or len(per_pad) != PAD_COUNT:
        raise CalibrationSchemaError(
            f"per_pad must be a {PAD_COUNT}-entry list",
        )
    for index, entry in enumerate(per_pad):
        if not isinstance(entry, Mapping):
            raise CalibrationSchemaError(
                f"per_pad[{index}] must be a mapping",
            )
        polynomial = entry.get("polynomial")
        if not isinstance(polynomial, list) or not 1 <= len(polynomial) <= 4:
            raise CalibrationSchemaError(
                f"per_pad[{index}].polynomial must be a list of 1..4 coefficients",
            )
        for coef_index, coef in enumerate(polynomial):
            if not isinstance(coef, (int, float)):
                raise CalibrationSchemaError(
                    f"per_pad[{index}].polynomial[{coef_index}] must be numeric",
                )


def update_pressure_curves(payload: Mapping[str, Any]) -> Dict[str, Any]:
    """Replace the active device's pressure-curve block.

    The payload must be a complete ``pressure_curves`` mapping with
    ``global_compensation`` (-1.0..1.0) and ``per_pad`` (16 entries).
    Partial updates aren't accepted at this layer — the store's
    ``update()`` replaces sections wholesale, and a partial pad list
    would silently drop pad calibrations.
    """
    if not isinstance(payload, Mapping):
        raise CalibrationSchemaError("pressure_curves payload must be a mapping")

    global_compensation = payload.get("global_compensation")
    if not isinstance(global_compensation, (int, float)) or not -1.0 <= global_compensation <= 1.0:
        raise CalibrationSchemaError(
            f"global_compensation must be -1.0..1.0; got {global_compensation!r}",
        )
    per_pad = payload.get("per_pad")
    if not isinstance(per_pad, list):
        raise CalibrationSchemaError("per_pad must be a list")
    _validate_curve_polynomial(per_pad)

    store = _store_for_active_device()
    store.update(pressure_curves=dict(payload))
    return get_pressure_curves()


# ---------------------------------------------------------------------------
# Performance patterns + scenes (T2522-C cycle 7)
# ---------------------------------------------------------------------------
#
# Schema:
#
#   performance_patterns:
#     active_pattern_id: str | null
#     patterns:
#       - id: str            # client-generated short id (uuid-ish)
#         name: str
#         length: int        # 1..16 steps
#         steps:             # PAD_COUNT × length matrix of step states
#           - [0|1|2, ...]   # 0 = empty, 1 = on, 2 = accented
#         scene_slot: int | null   # 0..7 mapping to group-button slots A-H
#
# We're intentionally honest about scope: this is operator-side
# pattern + scene authoring + persistence. Audio-rate playback wires
# in a separate `T2522-C-SEQ-PLAY` follow-on through the engine
# command dispatcher; the recorded patterns are real and will play
# back the moment that wiring lands.

PATTERN_STEP_COUNT_MAX = 16
PATTERN_STEP_VALUES = {0, 1, 2}


def default_performance_patterns() -> Dict[str, Any]:
    return {"active_pattern_id": None, "patterns": []}


def _validate_pattern(pattern: Any, *, index: int) -> None:
    if not isinstance(pattern, Mapping):
        raise CalibrationSchemaError(f"patterns[{index}] must be a mapping")
    pid = pattern.get("id")
    if not isinstance(pid, str) or not pid:
        raise CalibrationSchemaError(f"patterns[{index}].id must be a non-empty string")
    name = pattern.get("name")
    if not isinstance(name, str):
        raise CalibrationSchemaError(f"patterns[{index}].name must be a string")
    length = pattern.get("length")
    if not isinstance(length, int) or not 1 <= length <= PATTERN_STEP_COUNT_MAX:
        raise CalibrationSchemaError(
            f"patterns[{index}].length must be int 1..{PATTERN_STEP_COUNT_MAX}; got {length!r}",
        )
    steps = pattern.get("steps")
    if not isinstance(steps, list) or len(steps) != 16:
        raise CalibrationSchemaError(
            f"patterns[{index}].steps must be a 16-row list (one per pad); got {type(steps).__name__}",
        )
    for row_idx, row in enumerate(steps):
        if not isinstance(row, list) or len(row) != length:
            raise CalibrationSchemaError(
                f"patterns[{index}].steps[{row_idx}] must be a list of length {length}",
            )
        for col_idx, cell in enumerate(row):
            if cell not in PATTERN_STEP_VALUES:
                raise CalibrationSchemaError(
                    f"patterns[{index}].steps[{row_idx}][{col_idx}] must be 0/1/2; got {cell!r}",
                )
    scene_slot = pattern.get("scene_slot")
    if scene_slot is not None and (not isinstance(scene_slot, int) or not 0 <= scene_slot <= 7):
        raise CalibrationSchemaError(
            f"patterns[{index}].scene_slot must be 0..7 or null; got {scene_slot!r}",
        )


def _validate_performance_patterns(payload: Any) -> None:
    if not isinstance(payload, Mapping):
        raise CalibrationSchemaError("performance_patterns payload must be a mapping")
    active = payload.get("active_pattern_id")
    if active is not None and not isinstance(active, str):
        raise CalibrationSchemaError("active_pattern_id must be a string or null")
    patterns = payload.get("patterns")
    if not isinstance(patterns, list):
        raise CalibrationSchemaError("patterns must be a list")
    seen_ids: set[str] = set()
    seen_slots: set[int] = set()
    for index, pattern in enumerate(patterns):
        _validate_pattern(pattern, index=index)
        pid = pattern["id"]
        if pid in seen_ids:
            raise CalibrationSchemaError(f"patterns[{index}].id={pid!r} is duplicated")
        seen_ids.add(pid)
        slot = pattern.get("scene_slot")
        if slot is not None:
            if slot in seen_slots:
                raise CalibrationSchemaError(
                    f"patterns[{index}].scene_slot={slot} already bound to another pattern",
                )
            seen_slots.add(slot)
    if active is not None and active not in seen_ids:
        raise CalibrationSchemaError(
            f"active_pattern_id={active!r} does not match any pattern.id",
        )


def get_performance_patterns() -> Dict[str, Any]:
    store = _store_for_active_device()
    try:
        existing = store.load()
    except Exception:
        existing = None
    block = (
        (existing or {}).get("performance_patterns")
        if existing is not None
        else None
    ) or default_performance_patterns()
    return {
        "usb_serial": store._usb_serial,
        "performance_patterns": block,
    }


def update_performance_patterns(payload: Mapping[str, Any]) -> Dict[str, Any]:
    _validate_performance_patterns(payload)
    store = _store_for_active_device()
    store.update(performance_patterns=dict(payload))
    return get_performance_patterns()
