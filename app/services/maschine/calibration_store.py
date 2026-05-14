"""
T2499-B Slice 2 — per-unit Maschine MK1 calibration YAML store.

Mirrors the MeloAudio per-installation override pattern from
``app/services/devices/_shared/override_store.py`` and adds the
unit-identity dimension required by T2499-B Q4: calibrations are keyed
by **USB serial number**, not just pack-id, so:

- An operator with two MK1s on one host gets two distinct calibrations.
- Moving an MK1 between hosts carries its calibration with the unit's
  ``$XDG_CONFIG_HOME``-equivalent — but if a fresh host has the same
  serial in ``~/.map2/devices/``, the file is read on first connect.

Calibration is stored at::

    ~/.map2/devices/maschine-mk1-<USB_SERIAL>-calibrated.yaml

Schema covers the four T2499-B calibration phases:
- pad sensitivity (per-pad threshold + max-velocity calibration)
- pressure curves (per-pad polynomial + global compensation)
- LCD calibration (gamma + per-LCD bias)
- selected profile (T700 Q68 25-profile catalog index)

The store does NOT touch snapshot JSONB — per T700 Q49 calibration is
**global default** layer, not snapshot-recallable. The two-layer model
in T700 Q74 puts pad-layout / profile / LED-animations in the
snapshot-recallable layer; those go to a different store.

Concurrency model: per-instance ``threading.Lock``. The orchestrator
slice (Slice 3+) uses one store per active MK1 unit — the lock guards
read/save races inside one onboarding session. Cross-process safety
relies on the atomic ``os.replace`` in the writer.
"""

from __future__ import annotations

import os
import re
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional

import yaml


SCHEMA_VERSION = 1

DEFAULT_DEVICES_DIR = Path("~/.map2/devices").expanduser()

PAD_COUNT = 16  # MK1 has 16 pads in a 4x4 grid (T700 Q19/Q42).

# A T700 Q60 boot-sequence + Q50 onboarding tour run produces this
# minimum set of calibration data; anything missing → calibration is
# considered incomplete and the orchestrator re-runs onboarding.
REQUIRED_CALIBRATION_KEYS = {"pad_sensitivity", "pressure_curves", "lcd"}
# T2522-C cycle 7 — optional sections that the orchestrator never
# writes but that the calibration_facade may attach. The schema
# validator skips unknown top-level keys (additive-only), so adding
# a new optional block here doesn't require a migration.
OPTIONAL_CALIBRATION_KEYS = {"performance_patterns"}

# USB serial regex: USB-IF-permitted string. We accept ASCII letters /
# digits / hyphen / underscore / dot. The regex is also our filename
# escape — anything outside this set is rejected at save time so we
# never write a path containing whitespace or shell metacharacters.
SERIAL_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


class CalibrationSchemaError(ValueError):
    """Raised when a calibration file does not match the schema."""


class CalibrationStoreError(RuntimeError):
    """Raised for IO / lock failures the schema layer can't model."""


# ---------------------------------------------------------------------------
# Schema validation
# ---------------------------------------------------------------------------


def _validate_serial(serial: str) -> None:
    if not isinstance(serial, str) or not SERIAL_PATTERN.match(serial):
        raise CalibrationSchemaError(
            f"USB serial must match {SERIAL_PATTERN.pattern!r}; got {serial!r}",
        )


def _validate_pad_sensitivity(payload: Any) -> None:
    if not isinstance(payload, list):
        raise CalibrationSchemaError(
            "pad_sensitivity must be a list of 16 entries",
        )
    if len(payload) != PAD_COUNT:
        raise CalibrationSchemaError(
            f"pad_sensitivity must have exactly {PAD_COUNT} entries; got {len(payload)}",
        )
    for index, entry in enumerate(payload):
        if not isinstance(entry, dict):
            raise CalibrationSchemaError(
                f"pad_sensitivity[{index}] must be a mapping, got {type(entry).__name__}",
            )
        for required in ("threshold", "max_velocity"):
            if required not in entry:
                raise CalibrationSchemaError(
                    f"pad_sensitivity[{index}] missing key {required!r}",
                )
        threshold = entry["threshold"]
        if not isinstance(threshold, (int, float)) or not 0 <= threshold <= 127:
            raise CalibrationSchemaError(
                f"pad_sensitivity[{index}].threshold must be 0..127; got {threshold!r}",
            )
        max_v = entry["max_velocity"]
        if not isinstance(max_v, (int, float)) or not 1 <= max_v <= 127:
            raise CalibrationSchemaError(
                f"pad_sensitivity[{index}].max_velocity must be 1..127; got {max_v!r}",
            )
        if max_v <= threshold:
            raise CalibrationSchemaError(
                f"pad_sensitivity[{index}].max_velocity ({max_v}) must exceed "
                f"threshold ({threshold})",
            )


def _validate_pressure_curves(payload: Any) -> None:
    if not isinstance(payload, dict):
        raise CalibrationSchemaError(
            "pressure_curves must be a mapping",
        )
    if "global_compensation" not in payload:
        raise CalibrationSchemaError(
            "pressure_curves must include 'global_compensation'",
        )
    comp = payload["global_compensation"]
    if not isinstance(comp, (int, float)) or not -1.0 <= comp <= 1.0:
        raise CalibrationSchemaError(
            f"pressure_curves.global_compensation must be -1.0..1.0; got {comp!r}",
        )
    per_pad = payload.get("per_pad", [])
    if not isinstance(per_pad, list) or len(per_pad) != PAD_COUNT:
        raise CalibrationSchemaError(
            f"pressure_curves.per_pad must be a {PAD_COUNT}-entry list",
        )
    for index, entry in enumerate(per_pad):
        if not isinstance(entry, dict):
            raise CalibrationSchemaError(
                f"pressure_curves.per_pad[{index}] must be a mapping",
            )
        coefficients = entry.get("polynomial")
        if not isinstance(coefficients, list) or not (1 <= len(coefficients) <= 4):
            raise CalibrationSchemaError(
                f"pressure_curves.per_pad[{index}].polynomial must be a list of 1..4 coefficients",
            )
        for coef_index, coef in enumerate(coefficients):
            if not isinstance(coef, (int, float)):
                raise CalibrationSchemaError(
                    f"pressure_curves.per_pad[{index}].polynomial[{coef_index}] "
                    f"must be numeric; got {type(coef).__name__}",
                )


def _validate_lcd(payload: Any) -> None:
    if not isinstance(payload, dict):
        raise CalibrationSchemaError("lcd must be a mapping")
    gamma = payload.get("gamma")
    if not isinstance(gamma, (int, float)) or not 0.5 <= gamma <= 3.0:
        raise CalibrationSchemaError(
            f"lcd.gamma must be 0.5..3.0; got {gamma!r}",
        )
    biases = payload.get("per_lcd_bias", {})
    if not isinstance(biases, dict):
        raise CalibrationSchemaError("lcd.per_lcd_bias must be a mapping")
    for lcd_id in ("left", "right"):
        if lcd_id not in biases:
            raise CalibrationSchemaError(
                f"lcd.per_lcd_bias must include {lcd_id!r}",
            )
        bias = biases[lcd_id]
        if not isinstance(bias, (int, float)) or not -32 <= bias <= 32:
            raise CalibrationSchemaError(
                f"lcd.per_lcd_bias.{lcd_id} must be integer -32..32; got {bias!r}",
            )


def _validate_profile(payload: Any) -> None:
    """Profile is OPTIONAL — calibration can predate profile selection."""
    if payload is None:
        return
    if not isinstance(payload, dict):
        raise CalibrationSchemaError("selected_profile must be a mapping")
    profile_id = payload.get("id")
    if not isinstance(profile_id, str) or not profile_id:
        raise CalibrationSchemaError(
            "selected_profile.id must be a non-empty string (e.g. 'T1', 'T14')",
        )
    # T700 Q68 catalog locks profile ids to T1..T25.
    if not re.fullmatch(r"T([1-9]|1[0-9]|2[0-5])", profile_id):
        raise CalibrationSchemaError(
            f"selected_profile.id must match T1..T25 (T700 Q68 catalog); got {profile_id!r}",
        )


def _validate_payload(payload: Mapping[str, Any], *, source: str) -> None:
    if not isinstance(payload, dict):
        raise CalibrationSchemaError(
            f"{source}: top-level payload must be a mapping",
        )
    version = payload.get("schema_version")
    if version != SCHEMA_VERSION:
        raise CalibrationSchemaError(
            f"{source}: expected schema_version={SCHEMA_VERSION}, got {version!r}",
        )
    device = payload.get("device")
    if device != "maschine-mk1":
        raise CalibrationSchemaError(
            f"{source}: expected device='maschine-mk1', got {device!r}",
        )
    serial = payload.get("usb_serial")
    if not isinstance(serial, str):
        raise CalibrationSchemaError(
            f"{source}: usb_serial must be a string; got {type(serial).__name__}",
        )
    _validate_serial(serial)
    _validate_pad_sensitivity(payload.get("pad_sensitivity"))
    _validate_pressure_curves(payload.get("pressure_curves"))
    _validate_lcd(payload.get("lcd"))
    _validate_profile(payload.get("selected_profile"))


# ---------------------------------------------------------------------------
# Defaults — used by Slice 4+ when an operator skips a calibration step
# ---------------------------------------------------------------------------


def default_pad_sensitivity() -> List[Dict[str, int]]:
    """16-entry uniform default — threshold 8 / max_velocity 120."""
    return [{"threshold": 8, "max_velocity": 120} for _ in range(PAD_COUNT)]


def default_pressure_curves() -> Dict[str, Any]:
    """Linear default — y = x for every pad, zero global compensation."""
    return {
        "global_compensation": 0.0,
        "per_pad": [{"polynomial": [0.0, 1.0]} for _ in range(PAD_COUNT)],
    }


def default_lcd() -> Dict[str, Any]:
    return {"gamma": 1.0, "per_lcd_bias": {"left": 0, "right": 0}}


def default_calibration_payload(usb_serial: str) -> Dict[str, Any]:
    """A minimum-validity payload an operator can save before any
    calibration steps run. Required for Slice 3's "skipped onboarding"
    path (T700 Q50 ERASE-to-skip)."""
    _validate_serial(usb_serial)
    return {
        "schema_version": SCHEMA_VERSION,
        "device": "maschine-mk1",
        "usb_serial": usb_serial,
        "pad_sensitivity": default_pad_sensitivity(),
        "pressure_curves": default_pressure_curves(),
        "lcd": default_lcd(),
        "selected_profile": None,
        "calibrated_at": None,
    }


# ---------------------------------------------------------------------------
# Store
# ---------------------------------------------------------------------------


class MaschineCalibrationStore:
    """Per-MK1-unit calibration YAML.

    One store instance per ``usb_serial``. Caller must ensure no two
    instances open the same file at once; the per-instance lock guards
    in-process race only.
    """

    def __init__(
        self,
        *,
        usb_serial: str,
        directory: Optional[Path] = None,
    ) -> None:
        _validate_serial(usb_serial)
        self._usb_serial = usb_serial
        self._directory = directory or DEFAULT_DEVICES_DIR
        self._lock = threading.Lock()

    # -- file-level surface ------------------------------------------------

    def path(self) -> Path:
        return self._directory / f"maschine-mk1-{self._usb_serial}-calibrated.yaml"

    def exists(self) -> bool:
        return self.path().exists()

    # -- read --------------------------------------------------------------

    def load(self) -> Optional[Dict[str, Any]]:
        with self._lock:
            file_path = self.path()
            if not file_path.exists():
                return None
            try:
                with file_path.open("r", encoding="utf-8") as handle:
                    payload = yaml.safe_load(handle)
            except yaml.YAMLError as exc:
                raise CalibrationStoreError(
                    f"Failed to parse calibration YAML at {file_path}: {exc}",
                ) from exc
            if payload is None:
                return None
            _validate_payload(payload, source=str(file_path))
            return payload

    # -- write -------------------------------------------------------------

    def save(self, payload: Mapping[str, Any]) -> Path:
        merged = dict(payload)
        merged.setdefault("schema_version", SCHEMA_VERSION)
        merged.setdefault("device", "maschine-mk1")
        merged.setdefault("usb_serial", self._usb_serial)
        # If the caller passed a different serial, refuse — the file
        # path is keyed by serial and we will not silently rewrite it.
        if merged["usb_serial"] != self._usb_serial:
            raise CalibrationSchemaError(
                f"Refusing to save: payload usb_serial="
                f"{merged['usb_serial']!r} != store usb_serial={self._usb_serial!r}",
            )
        if not merged.get("calibrated_at"):
            merged["calibrated_at"] = datetime.now(timezone.utc).isoformat()
        _validate_payload(merged, source="save()")
        with self._lock:
            file_path = self.path()
            file_path.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(
                "w",
                encoding="utf-8",
                dir=str(file_path.parent),
                prefix=f".{file_path.name}.",
                suffix=".tmp",
                delete=False,
            ) as tmp:
                yaml.safe_dump(merged, tmp, sort_keys=True)
                tmp_path = Path(tmp.name)
            os.replace(tmp_path, file_path)
            return file_path

    # -- delete ------------------------------------------------------------

    def delete(self) -> bool:
        with self._lock:
            file_path = self.path()
            if not file_path.exists():
                return False
            file_path.unlink()
            return True

    # -- merge helpers used by the orchestrator slice ----------------------

    def update(self, **section_payloads: Any) -> Path:
        """Merge per-section calibration data into the existing file.

        Each kwarg keys into the top-level payload (``pad_sensitivity``,
        ``pressure_curves``, ``lcd``, ``selected_profile``); the
        existing file is loaded, sections replaced wholesale (NOT
        deep-merged — partial pad arrays are a foot-gun), and the
        result re-saved atomically.
        """
        with self._lock:
            existing: Dict[str, Any]
            if self.path().exists():
                # Bypass the lock since we already hold it.
                with self.path().open("r", encoding="utf-8") as handle:
                    existing = yaml.safe_load(handle) or {}
            else:
                existing = default_calibration_payload(self._usb_serial)
            for key, value in section_payloads.items():
                if key not in {
                    "pad_sensitivity",
                    "pressure_curves",
                    "lcd",
                    "selected_profile",
                    # T2522-C cycle 7 — patterns are an additive, schema-
                    # validator-skipped section that the performance tab
                    # writes via the calibration_facade.
                    "performance_patterns",
                    # T2522-D cycle 10 — per-pad idle-color palette
                    # (LED choreography). Same additive pattern: skipped
                    # by the schema validator, allowlisted here.
                    "led_choreography",
                }:
                    raise CalibrationSchemaError(
                        f"update(): unknown section {key!r}",
                    )
                existing[key] = value
            existing["calibrated_at"] = datetime.now(timezone.utc).isoformat()
        return self.save(existing)


# ---------------------------------------------------------------------------
# Lookup helper for the orchestrator
# ---------------------------------------------------------------------------


def list_calibrated_units(directory: Optional[Path] = None) -> List[str]:
    """Return the USB serials of every MK1 calibration on disk.

    The orchestrator uses this to decide whether to enter the
    Q50 first-connection tour or hot-load an existing calibration when
    a connect event fires.
    """
    target = directory or DEFAULT_DEVICES_DIR
    if not target.exists():
        return []
    pattern = re.compile(r"^maschine-mk1-(.+)-calibrated\.yaml$")
    serials: List[str] = []
    for file_path in sorted(target.iterdir()):
        match = pattern.match(file_path.name)
        if match:
            serials.append(match.group(1))
    return serials
