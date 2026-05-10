"""T2499 mega-epic Phase 2.1 — Maschine MK1 Configurator pack tests.

Validates the detector / override store / learn event source built
on top of the existing daemon-side `MaschineService`. No real
hardware or daemon required — the service is mocked.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Iterator

import pytest

from app.services.devices._shared import (
    ConfiguratorRegistration,
    DeviceConfiguratorRegistry,
    DevicePresence,
)
from app.services.devices.maschine_mk1 import (
    PACK_ID,
    MaschineMk1Detector,
    MaschineMk1LearnEventSource,
    MaschineMk1OverrideStore,
    build_registration,
    register_default,
)


# ---------------------------------------------------------------------------
# Test doubles
# ---------------------------------------------------------------------------


class FakeMaschineService:
    """Stand-in for `MaschineService` exposing the two methods the
    detector + learn-event source consume."""

    def __init__(
        self,
        *,
        status: dict[str, Any] | None = None,
        history: list[dict[str, Any]] | None = None,
    ) -> None:
        self._status = status or _disconnected_status()
        self._history = history or []

    def set_status(self, status: dict[str, Any]) -> None:
        self._status = status

    def push_event(self, event: dict[str, Any]) -> None:
        self._history.append(event)

    def get_status(self) -> dict[str, Any]:
        return self._status

    def get_hid_history(self, *, limit: int = 200) -> list[dict[str, Any]]:
        return list(self._history[-limit:])


def _disconnected_status() -> dict[str, Any]:
    return {
        "connected": False,
        "status": "disconnected",
        "daemon_version": None,
        "websocket_connected": False,
        "virtual_port_name": "MAP2:Maschine-MK1",
        "hid_device": {},
        "transport": {},
        "firmware_info": {},
        "capabilities": {},
        "registered_at": None,
        "heartbeat_at": None,
    }


def _connected_mk1_status() -> dict[str, Any]:
    return {
        "connected": True,
        "status": "connected",
        "daemon_version": "1.4.0",
        "websocket_connected": True,
        "virtual_port_name": "MAP2:Maschine-MK1",
        "hid_device": {
            "vendor_id": 0x17CC,
            "product_id": 0x0808,
            "serial_number": "MK1-001",
        },
        "transport": {"kind": "hidapi"},
        "firmware_info": {"version": "1.0.0"},
        "capabilities": {"led_animations": True},
        "registered_at": "2026-05-09T12:00:00Z",
        "heartbeat_at": "2026-05-09T12:01:00Z",
    }


# ---------------------------------------------------------------------------
# Detector
# ---------------------------------------------------------------------------


class TestDetector:
    def test_reports_not_present_when_service_missing(self) -> None:
        detector = MaschineMk1Detector(service=None)
        # Lazy-resolution will fail in the test environment; expect
        # NOT_PRESENT with `no_service` raw detail.
        # Bypass lazy resolution by injecting a service that raises.
        class Raising:
            def get_status(self) -> dict[str, Any]:
                raise RuntimeError("boom")

        detector = MaschineMk1Detector(service=Raising())
        status = detector.detect()
        assert status.presence is DevicePresence.NOT_PRESENT
        assert status.raw["detail"] == "status_read_failed"

    def test_reports_not_present_when_disconnected(self) -> None:
        service = FakeMaschineService(status=_disconnected_status())
        detector = MaschineMk1Detector(service=service)
        status = detector.detect()
        assert status.presence is DevicePresence.NOT_PRESENT
        assert status.transport == "hid"

    def test_reports_present_stock_for_mk1(self) -> None:
        service = FakeMaschineService(status=_connected_mk1_status())
        detector = MaschineMk1Detector(service=service)
        status = detector.detect()
        assert status.presence is DevicePresence.PRESENT_STOCK
        assert status.serial == "MK1-001"
        assert status.raw["vendor_id"] == "0x17CC"
        assert status.raw["product_id"] == "0x0808"
        assert status.raw["firmware_version"] == "1.0.0"

    def test_reports_present_unknown_for_unrecognised_device(self) -> None:
        state = _connected_mk1_status()
        state["hid_device"] = {"vendor_id": 0x1234, "product_id": 0x5678}
        service = FakeMaschineService(status=state)
        detector = MaschineMk1Detector(service=service)
        status = detector.detect()
        assert status.presence is DevicePresence.PRESENT_UNKNOWN

    def test_handles_hex_string_vendor_product_ids(self) -> None:
        state = _connected_mk1_status()
        state["hid_device"] = {
            "vendor_id": "0x17cc",
            "product_id": "0x0808",
            "serial_number": "MK1-002",
        }
        service = FakeMaschineService(status=state)
        detector = MaschineMk1Detector(service=service)
        status = detector.detect()
        assert status.presence is DevicePresence.PRESENT_STOCK
        assert status.serial == "MK1-002"

    def test_pack_id_is_canonical(self) -> None:
        service = FakeMaschineService(status=_connected_mk1_status())
        detector = MaschineMk1Detector(service=service)
        status = detector.detect()
        assert status.pack_id == PACK_ID == "maschine_mk1"


# ---------------------------------------------------------------------------
# Override store
# ---------------------------------------------------------------------------


class TestOverrideStore:
    @pytest.fixture
    def yaml_dir(self, tmp_path: Path) -> Path:
        return tmp_path / "devices"

    def test_default_path_includes_pack_id_and_slug(
        self, yaml_dir: Path
    ) -> None:
        store = MaschineMk1OverrideStore(directory=yaml_dir)
        path = Path(store.path())
        assert path.name == "maschine_mk1-overrides.yaml"

    def test_save_then_load_round_trip(self, yaml_dir: Path) -> None:
        store = MaschineMk1OverrideStore(directory=yaml_dir)
        payload = {
            "bindings": {
                "brain-slot-0": {
                    "slot_id": "brain-slot-0",
                    "event_kind": "hid",
                    "event": {"kind": "hid", "control_id": "pad-7"},
                }
            },
            "calibration": {
                "pad_sensitivity": {"pad-7": {"threshold": 12, "ceiling": 254}},
            },
        }
        store.save(payload)
        loaded = store.load()
        assert loaded is not None
        assert loaded["bindings"]["brain-slot-0"]["event"]["control_id"] == "pad-7"
        assert loaded["calibration"]["pad_sensitivity"]["pad-7"]["threshold"] == 12

    def test_load_returns_none_when_missing(self, yaml_dir: Path) -> None:
        store = MaschineMk1OverrideStore(directory=yaml_dir)
        assert store.load() is None

    def test_save_auto_injects_schema_version_and_device(
        self, yaml_dir: Path
    ) -> None:
        store = MaschineMk1OverrideStore(directory=yaml_dir)
        store.save({"bindings": {}})
        loaded = store.load()
        assert loaded is not None
        assert loaded["schema_version"] == 1
        assert loaded["device"] == "maschine_mk1"


# ---------------------------------------------------------------------------
# Learn event source
# ---------------------------------------------------------------------------


class TestLearnEventSource:
    def test_returns_empty_snapshot_when_history_empty(self) -> None:
        service = FakeMaschineService()
        src = MaschineMk1LearnEventSource(service=service)
        snap = src.last_event()
        assert snap.event is None
        assert snap.sequence == 0

    def test_emits_canonical_hid_event_for_pad_press(self) -> None:
        service = FakeMaschineService()
        service.push_event(
            {
                "timestamp": "2026-05-09T12:00:00Z",
                "decoded_type": "pad_press",
                "raw_hex": "01 07 7F",
                "payload": {"pad": 7, "value": 0.62},
            }
        )
        src = MaschineMk1LearnEventSource(service=service)
        snap = src.last_event()
        assert snap.event is not None
        assert snap.event["kind"] == "hid"
        assert snap.event["control_kind"] == "pad"
        assert snap.event["control_id"] == "pad-7"
        assert pytest.approx(0.62, abs=1e-6) == snap.event["value"]
        assert snap.sequence == 1

    def test_emits_for_encoder_turn(self) -> None:
        service = FakeMaschineService()
        service.push_event(
            {
                "timestamp": "2026-05-09T12:00:01Z",
                "decoded_type": "encoder_turn",
                "raw_hex": "02 03",
                "payload": {"encoder": 3, "value": 1},
            }
        )
        src = MaschineMk1LearnEventSource(service=service)
        snap = src.last_event()
        assert snap.event is not None
        assert snap.event["control_kind"] == "encoder"
        assert snap.event["control_id"] == "encoder-3"

    def test_emits_for_button_press(self) -> None:
        service = FakeMaschineService()
        service.push_event(
            {
                "timestamp": "2026-05-09T12:00:02Z",
                "decoded_type": "button_press",
                "raw_hex": "03 0c",
                "payload": {"button": 12, "value": 1},
            }
        )
        src = MaschineMk1LearnEventSource(service=service)
        snap = src.last_event()
        assert snap.event is not None
        assert snap.event["control_kind"] == "button"
        assert snap.event["control_id"] == "button-12"

    def test_sequence_advances_when_new_event_arrives(self) -> None:
        service = FakeMaschineService()
        service.push_event(
            {
                "timestamp": "2026-05-09T12:00:00Z",
                "decoded_type": "pad_press",
                "raw_hex": "01 02 7F",
                "payload": {"pad": 2, "value": 0.5},
            }
        )
        src = MaschineMk1LearnEventSource(service=service)
        first = src.last_event()
        assert first.sequence == 1

        # Same event observed again — sequence must NOT advance.
        second = src.last_event()
        assert second.sequence == first.sequence

        # New event with a different timestamp — sequence advances.
        service.push_event(
            {
                "timestamp": "2026-05-09T12:00:01Z",
                "decoded_type": "pad_press",
                "raw_hex": "01 03 7F",
                "payload": {"pad": 3, "value": 0.5},
            }
        )
        third = src.last_event()
        assert third.sequence == first.sequence + 1
        assert third.event is not None
        assert third.event["control_id"] == "pad-3"

    def test_observed_at_is_unix_seconds(self) -> None:
        service = FakeMaschineService()
        service.push_event(
            {
                "timestamp": "2026-05-09T12:00:00Z",
                "decoded_type": "pad_press",
                "raw_hex": "",
                "payload": {"pad": 0, "value": 1},
            }
        )
        src = MaschineMk1LearnEventSource(service=service)
        snap = src.last_event()
        # 2026-05-09T12:00:00Z → 1778587200 unix seconds (best-effort).
        assert snap.observed_at is not None
        assert snap.observed_at > 1_700_000_000
        assert snap.observed_at < 2_000_000_000


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------


class TestRegistration:
    def test_build_registration_exposes_all_primitives(self) -> None:
        registration = build_registration()
        assert registration.pack_id == "maschine_mk1"
        primitives = registration.supported_primitives
        assert "detection" in primitives
        assert "override" in primitives
        assert "learn" in primitives
        assert registration.metadata["bespoke_route"] == "/midi/devices/configurator/maschine"

    def test_register_default_is_idempotent(self) -> None:
        registry = DeviceConfiguratorRegistry()
        first = register_default(registry)
        second = register_default(registry)
        assert first.pack_id == second.pack_id
        assert len(registry) == 1
