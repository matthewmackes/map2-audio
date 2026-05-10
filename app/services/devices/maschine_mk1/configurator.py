"""Maschine MK1 Configurator pack — Phase 2.1.

Wires the existing daemon-side `MaschineService` into the framework
``DeviceConfiguratorRegistry`` so the framework Configurator can
detect, learn-bind, and per-install-override the MK1 alongside
MeloAudio + future packs.

Design notes:
  - Detection is read-only against `MaschineService.get_status()` —
    no daemon poke. Presence states map onto the canonical enum:
      * `connected=False` → NOT_PRESENT
      * `connected=True, hid_device.product_id=0x0808 (MK1)` → PRESENT_STOCK
      * Any connected device with an unrecognised product_id → PRESENT_UNKNOWN
  - HID bindings are non-MIDI: they live in the per-pack YAML store
    via the generic Configurator overrides route. The MIDI Services
    `/api/midi/bindings` table only holds MIDI bindings (per the
    locked decision in the T2499 mega-epic plan).
  - Learn events convert the daemon's `decoded_type` HID payloads
    into the canonical `kind: 'hid'` `DeviceLearnEvent` shape so the
    framework Learn module renders them with no per-pack code.
"""
from __future__ import annotations

import time
from typing import Any, Mapping, Optional

from app.services.devices._shared import (
    ConfiguratorRegistration,
    DeviceConfiguratorRegistry,
    DeviceDetectionStatus,
    DeviceLearnEventSnapshot,
    DevicePresence,
    YamlOverrideStore,
    get_default_registry,
)

PACK_ID = "maschine_mk1"
DISPLAY_NAME = "Native Instruments Maschine MK1"
VENDOR_NAME = "Native Instruments"

# USB descriptors (locked in `device-packs/native-instruments/pack.yaml`).
NI_VENDOR_ID = 0x17CC
MK1_PRODUCT_ID = 0x0808

# Bespoke route mounted by Phase 2.7. Configured here so the picker
# tile deep-links to the MK1 surface as soon as the page lands.
BESPOKE_ROUTE = "/midi/devices/configurator/maschine"


# ---------------------------------------------------------------------------
# Detector
# ---------------------------------------------------------------------------


class MaschineMk1Detector:
    """Maps `MaschineService.get_status()` → canonical detection status.

    The detector is intentionally cheap: a single dict-read against
    the in-memory daemon state. Suitable for the framework's polling
    cadence (~2.5 s).
    """

    def __init__(self, service: Any | None = None) -> None:
        self._service = service

    def detect(self) -> DeviceDetectionStatus:
        service = self._service or self._lazy_service()
        if service is None:
            return _absent_status("no_service")

        try:
            state = service.get_status() or {}
        except Exception:
            return _absent_status("status_read_failed")

        connected = bool(state.get("connected"))
        if not connected:
            return _absent_status(
                str(state.get("status") or "disconnected")
            )

        hid_device = state.get("hid_device") or {}
        vid = _coerce_int(hid_device.get("vendor_id"))
        pid = _coerce_int(hid_device.get("product_id"))
        firmware = state.get("firmware_info") or {}

        is_mk1 = vid == NI_VENDOR_ID and pid == MK1_PRODUCT_ID
        presence = (
            DevicePresence.PRESENT_STOCK
            if is_mk1
            else DevicePresence.PRESENT_UNKNOWN
        )

        return DeviceDetectionStatus(
            pack_id=PACK_ID,
            presence=presence,
            transport=str((state.get("transport") or {}).get("kind") or "hid"),
            serial=_string_or_none(hid_device.get("serial_number")),
            raw={
                "daemon_version": state.get("daemon_version"),
                "vendor_id": _hex(vid),
                "product_id": _hex(pid),
                "virtual_port_name": state.get("virtual_port_name"),
                "firmware_version": _string_or_none(firmware.get("version")),
                "websocket_connected": bool(state.get("websocket_connected")),
                "status": state.get("status"),
                "registered_at": state.get("registered_at"),
                "heartbeat_at": state.get("heartbeat_at"),
                "capabilities": dict(state.get("capabilities") or {}),
            },
        )

    @staticmethod
    def _lazy_service() -> Any | None:
        # Imported lazily so the module is testable without the full
        # daemon graph (the service singleton pulls in DB + WS deps).
        try:
            from app.services.maschine_service import get_maschine_service

            return get_maschine_service()
        except Exception:
            return None


def _absent_status(detail: str) -> DeviceDetectionStatus:
    return DeviceDetectionStatus(
        pack_id=PACK_ID,
        presence=DevicePresence.NOT_PRESENT,
        transport="hid",
        serial=None,
        raw={"detail": detail},
    )


# ---------------------------------------------------------------------------
# Override store
# ---------------------------------------------------------------------------


class MaschineMk1OverrideStore(YamlOverrideStore):
    """Per-installation YAML at ``~/.map2/devices/maschine_mk1-overrides.yaml``.

    Schema (extends the framework `bindings.<slot_id>` shape):

        schema_version: 1
        device: maschine_mk1
        bindings:
          <slot_id>:
            slot_id, slot_label, event_kind: 'hid', event: {...}
        calibration:
          pad_sensitivity:
            <pad_id>: { threshold, ceiling }
          pressure_curves:
            <pad_id>: { points: [[x, y], ...] }
        profile_assignments:
          global: { default_profile: 'CTRL', screensaver_idle_minutes: 10 }
          per_snapshot: {}  # filled in by Phase 2.8 State Authority alignment
    """

    def __init__(self, *, directory: Optional[Any] = None) -> None:
        super().__init__(
            pack_id=PACK_ID,
            slug="overrides",
            schema_version=1,
            directory=directory,
        )


# ---------------------------------------------------------------------------
# Learn event source
# ---------------------------------------------------------------------------


class MaschineMk1LearnEventSource:
    """Bridges the daemon HID-event ring buffer onto the canonical
    `DeviceLearnEvent` polling surface.

    The framework polls `last_event()` at ~250 ms; we read the
    daemon's most recent recorded HID event (history is bounded at
    200 entries) and map its `decoded_type` to the appropriate
    `control_kind`. Sequence is the running event count since
    process start, ensuring strict monotonicity even after history
    wrap.
    """

    def __init__(self, service: Any | None = None) -> None:
        self._service = service
        self._sequence = 0
        self._last_signature: Optional[str] = None

    def last_event(self) -> DeviceLearnEventSnapshot:
        service = self._service or MaschineMk1Detector._lazy_service()
        if service is None:
            return _empty_snapshot(self._sequence)

        try:
            history = service.get_hid_history(limit=1) or []
        except Exception:
            return _empty_snapshot(self._sequence)

        if not history:
            return _empty_snapshot(self._sequence)

        latest = history[-1]
        signature = _event_signature(latest)
        if signature != self._last_signature:
            self._sequence += 1
            self._last_signature = signature

        canonical = _map_hid_event(latest)
        observed_at = _to_unix_seconds(latest.get("timestamp"))

        return DeviceLearnEventSnapshot(
            sequence=self._sequence,
            observed_at=observed_at,
            event=canonical,
        )


def _empty_snapshot(sequence: int) -> DeviceLearnEventSnapshot:
    return DeviceLearnEventSnapshot(sequence=sequence, observed_at=None, event=None)


def _event_signature(event: Mapping[str, Any]) -> str:
    """Stable key per HID event for sequence-tracking — pulls the
    fields the daemon timestamps on each record_hid_event call."""
    return "|".join(
        [
            str(event.get("timestamp") or ""),
            str(event.get("decoded_type") or ""),
            str(event.get("raw_hex") or ""),
        ]
    )


_DECODED_TO_CONTROL_KIND: Mapping[str, str] = {
    "pad_press": "pad",
    "pad_release": "pad",
    "pad_pressure": "pressure",
    "encoder_turn": "encoder",
    "encoder_press": "encoder",
    "button_press": "button",
    "button_release": "button",
}


def _map_hid_event(event: Mapping[str, Any]) -> dict[str, Any]:
    """Convert a daemon HID-event dict into a canonical
    ``DeviceLearnEvent`` ``kind: 'hid'`` payload."""
    decoded_type = str(event.get("decoded_type") or "unknown")
    payload = event.get("payload") or {}
    if not isinstance(payload, Mapping):
        payload = {}

    control_kind = _DECODED_TO_CONTROL_KIND.get(decoded_type, "button")
    control_id = (
        str(payload.get("control_id") or "")
        or _control_id_from_payload(decoded_type, payload)
        or "unknown"
    )

    value = _coerce_value(payload.get("value"))

    return {
        "kind": "hid",
        "vendor_id": NI_VENDOR_ID,
        "product_id": MK1_PRODUCT_ID,
        "control_id": control_id,
        "control_kind": control_kind,
        "value": value,
        "source_id": str(payload.get("source_id") or "maschine-mk1"),
        "timestamp": str(event.get("timestamp") or ""),
        # Pack-specific fields kept under `raw` for the UI status
        # card; the framework Learn display path ignores these
        # safely (only `kind` + the typed fields are required).
        "decoded_type": decoded_type,
        "raw_hex": str(event.get("raw_hex") or ""),
    }


def _control_id_from_payload(
    decoded_type: str, payload: Mapping[str, Any]
) -> Optional[str]:
    pad = payload.get("pad")
    encoder = payload.get("encoder")
    button = payload.get("button")
    if pad is not None and decoded_type.startswith("pad"):
        return f"pad-{int(pad)}" if isinstance(pad, (int, str)) else f"pad-{pad}"
    if encoder is not None and decoded_type.startswith("encoder"):
        return (
            f"encoder-{int(encoder)}"
            if isinstance(encoder, (int, str))
            else f"encoder-{encoder}"
        )
    if button is not None and decoded_type.startswith("button"):
        return (
            f"button-{int(button)}"
            if isinstance(button, (int, str))
            else f"button-{button}"
        )
    return None


def _coerce_value(value: Any) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _coerce_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        text = value.strip().lower()
        if not text:
            return None
        try:
            return int(text, 16) if text.startswith("0x") else int(text)
        except ValueError:
            return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _string_or_none(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _hex(value: Optional[int]) -> Optional[str]:
    if value is None:
        return None
    return f"0x{value:04X}"


def _to_unix_seconds(timestamp: Any) -> Optional[float]:
    """Best-effort ISO-8601 → unix seconds. Returns None if parsing fails.

    The daemon timestamps with `_utcnow_iso()` (e.g. `2026-05-09T12:00:00.123Z`).
    """
    if timestamp is None:
        return None
    if isinstance(timestamp, (int, float)):
        return float(timestamp)
    if not isinstance(timestamp, str):
        return None
    text = timestamp.strip()
    if not text:
        return None
    try:
        from datetime import datetime, timezone

        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        parsed = datetime.fromisoformat(text)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.timestamp()
    except Exception:
        # Fall back to monotonic-ish current time so the route still
        # surfaces *something* — better than dropping the event.
        return time.time()


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------


def build_registration(
    *,
    detector: Optional[MaschineMk1Detector] = None,
    override_store: Optional[MaschineMk1OverrideStore] = None,
    learn_event_source: Optional[MaschineMk1LearnEventSource] = None,
) -> ConfiguratorRegistration:
    return ConfiguratorRegistration(
        pack_id=PACK_ID,
        display_name=DISPLAY_NAME,
        detector=detector or MaschineMk1Detector(),
        override_store=override_store or MaschineMk1OverrideStore(),
        learn_event_source=learn_event_source or MaschineMk1LearnEventSource(),
        metadata={
            "vendor_name": VENDOR_NAME,
            "summary": (
                "Native Instruments Maschine MK1 — bind pads/encoders/buttons, "
                "calibrate pad sensitivity + pressure curves, choose the active "
                "LCD profile, configure LED choreography."
            ),
            "bespoke_route": BESPOKE_ROUTE,
            "vendor_id": _hex(NI_VENDOR_ID),
            "product_id": _hex(MK1_PRODUCT_ID),
        },
    )


def register_default(
    registry: Optional[DeviceConfiguratorRegistry] = None,
) -> ConfiguratorRegistration:
    """Idempotent registration into the process-wide singleton.

    Subsequent calls replace any prior registration so test setups
    can re-import without raising ``pack_id is already registered``.

    Note: ``registry or get_default_registry()`` would short-circuit
    against an empty registry (``__len__`` of 0 → falsy), so the
    explicit ``is None`` check is required.
    """
    target = registry if registry is not None else get_default_registry()
    if PACK_ID in target:
        target.unregister(PACK_ID)
    registration = build_registration()
    target.register(registration)
    return registration
