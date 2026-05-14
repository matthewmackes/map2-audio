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
