import asyncio
import os
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.routes import avb as avb_routes
from app.services.avb import aem_cache as aem_cache_module
from app.services.avb.aem_cache import AemCache
from app.services import juce_engine_service
from tests.mock_avdecc_device import (
    InMemoryAvdeccTransport,
    MockAvdeccController,
    MockAvdeccDevice,
    RawSocketAvdeccResponder,
    raw_socket_available,
)


pytestmark = pytest.mark.avdecc_mock


def _inline_to_thread(monkeypatch):
    async def _to_thread_inline(fn, *args, **kwargs):
        return fn(*args, **kwargs)

    monkeypatch.setattr(avb_routes.asyncio, "to_thread", _to_thread_inline)


class _MockEngineAdapter:
    def __init__(self, controller: MockAvdeccController, device: MockAvdeccDevice):
        self.controller = controller
        self.device = device

    def get_avdecc_entities(self):
        discovered = self.controller.discover()
        return [
            {
                "entity_id": discovered["entity_id"],
                "entity_model_id": discovered["entity_model_id"],
                "firmware_version": discovered["firmware_version"],
                "name": discovered["entity_name"],
            }
        ]

    def get_avdecc_entity_model(self, entity_id: int):
        if int(entity_id) != int(self.device.entity_id):
            return None

        stream_inputs = []
        stream_outputs = []
        for idx in range(self.device.profile.stream_count):
            stream_inputs.append(
                {
                    "index": idx,
                    "current_format": self.controller.get_stream_format("listener", idx),
                }
            )
            stream_outputs.append(
                {
                    "index": idx,
                    "current_format": self.controller.get_stream_format("talker", idx),
                }
            )

        return {
            "complete": True,
            "entity_descriptor": self.controller.read_descriptor("entity", 0),
            "configuration_descriptor": self.controller.read_descriptor("configuration", 0),
            "stream_inputs": stream_inputs,
            "stream_outputs": stream_outputs,
        }

    def get_stream_format(self, entity_id: int, stream_index: int, direction: str, _configuration_index: int):
        if int(entity_id) != int(self.device.entity_id):
            return {"success": False, "status": "entity_not_found", "status_code": 1, "stream_format": 0}
        try:
            stream_format = self.controller.get_stream_format(direction, stream_index)
        except Exception as exc:
            return {"success": False, "status": str(exc), "status_code": 2, "stream_format": 0}
        return {
            "success": True,
            "status": "success",
            "status_code": 0,
            "stream_format": int(stream_format),
        }

    def set_stream_format(
        self,
        entity_id: int,
        stream_index: int,
        direction: str,
        stream_format: int,
        _configuration_index: int,
    ):
        if int(entity_id) != int(self.device.entity_id):
            return {"success": False, "status": "entity_not_found", "status_code": 1, "stream_format": 0}
        try:
            applied = self.controller.set_stream_format(direction, stream_index, stream_format)
        except Exception as exc:
            return {"success": False, "status": str(exc), "status_code": 2, "stream_format": 0}
        return {
            "success": True,
            "status": "success",
            "status_code": 0,
            "stream_format": int(applied),
        }

    def connect_stream(self, talker_entity_id: int, talker_stream_index: int, listener_entity_id: int, listener_stream_index: int):
        result = self.controller.connect(
            f"{int(talker_entity_id):016x}",
            talker_stream_index,
            f"{int(listener_entity_id):016x}",
            listener_stream_index,
        )
        return bool(result.get("success", False))

    def disconnect_stream(self, talker_entity_id: int, talker_stream_index: int, listener_entity_id: int, listener_stream_index: int):
        if int(talker_entity_id) != int(self.device.entity_id) or int(listener_entity_id) != int(self.device.entity_id):
            return False
        result = self.controller.disconnect(talker_stream_index, listener_stream_index)
        return bool(result.get("removed", False))

    def get_active_connections(self):
        return list(self.controller.list_connections())


def _prepare_route_env(monkeypatch, engine):
    _inline_to_thread(monkeypatch)
    monkeypatch.setattr(avb_routes, "_is_avdecc_enabled", lambda: True)
    monkeypatch.setattr(avb_routes, "is_avb_available", lambda: True)
    monkeypatch.setattr(
        avb_routes,
        "config_get",
        lambda key, default=None: False if key == "avb.srp.enabled" else default,
    )
    monkeypatch.setattr(avb_routes, "_get_engine", lambda: engine)
    monkeypatch.setattr(avb_routes, "_check_acmp_available", lambda _engine: None)

    monkeypatch.setattr(juce_engine_service, "get_audio_engine", lambda: SimpleNamespace(_engine=engine))
    monkeypatch.setattr(juce_engine_service, "JUCE_AVAILABLE", False)
    monkeypatch.setattr(juce_engine_service, "juce_engine", None)


def test_mock_device_packet_workflow_8x8():
    device = MockAvdeccDevice(profile="8x8")
    controller = MockAvdeccController(InMemoryAvdeccTransport(device))

    discovery = controller.discover()
    entity_id = discovery["entity_id"]

    assert discovery["stream_count"] == 8
    assert discovery["entity_model_id"] == f"{device.entity_model_id:016x}"

    entity_descriptor = controller.read_descriptor("entity", 0)
    stream_descriptor = controller.read_descriptor("stream_output", 3)
    assert entity_descriptor["entity_name"] == "MAP2 Mock AVDECC 8x8"
    assert stream_descriptor["descriptor_index"] == 3

    original_listener_format = controller.get_stream_format("listener", 3)
    assert original_listener_format == MockAvdeccDevice.DEFAULT_STREAM_FORMAT

    updated_listener_format = controller.set_stream_format("listener", 3, 0x0200000818000005)
    assert updated_listener_format == 0x0200000818000005

    connected = controller.connect(entity_id, 3, entity_id, 3)
    assert connected["success"] is True
    assert len(controller.list_connections()) == 1

    disconnected = controller.disconnect(3, 3)
    assert disconnected["removed"] is True
    assert controller.list_connections() == []


def test_mock_device_profile_16x16_shape():
    device = MockAvdeccDevice(profile="16x16")
    controller = MockAvdeccController(InMemoryAvdeccTransport(device))
    discovery = controller.discover()

    assert discovery["stream_count"] == 16
    assert discovery["entity_name"] == "MAP2 Mock AVDECC 16x16"

    # Validate highest valid stream index in profile.
    descriptor = controller.read_descriptor("stream_input", 15)
    assert descriptor["descriptor_index"] == 15


def test_mock_harness_routes_cover_discovery_model_format_and_acmp(monkeypatch, tmp_path: Path):
    device = MockAvdeccDevice(profile="8x8")
    controller = MockAvdeccController(InMemoryAvdeccTransport(device))
    engine = _MockEngineAdapter(controller, device)

    cache = AemCache(db_path=str(tmp_path / "mock_harness_aem_cache.db"))
    monkeypatch.setattr(aem_cache_module, "get_aem_cache", lambda: cache)
    _prepare_route_env(monkeypatch, engine)

    entity_id_hex = f"{device.entity_id:016x}"

    model_first = asyncio.run(avb_routes.get_entity_model(entity_id_hex))
    model_second = asyncio.run(avb_routes.get_entity_model(entity_id_hex))
    assert model_first["complete"] is True
    assert model_first["cached"] is False
    assert model_second["cached"] is True

    patch_req = avb_routes.StreamFormatPatchRequest(
        direction="listener",
        channels=8,
        sample_rate=48000,
        bits_per_sample=24,
        configuration_index=0,
    )
    patch_result = asyncio.run(avb_routes.patch_stream_format(entity_id_hex, 0, patch_req))
    assert patch_result["status"] == "updated"
    assert patch_result["applied"]["channels"] == 8

    connect_req = avb_routes.StreamConnectionRequest(
        talker_entity_id=entity_id_hex,
        talker_stream_index=0,
        listener_entity_id=entity_id_hex,
        listener_stream_index=0,
    )
    connect_result = asyncio.run(avb_routes.connect_stream(connect_req))
    assert connect_result["status"] == "connected"

    active = asyncio.run(avb_routes.get_active_connections())
    assert len(active) == 1

    disconnect_result = asyncio.run(avb_routes.disconnect_stream(connect_result["connection_id"]))
    assert disconnect_result["status"] == "disconnected"
    assert asyncio.run(avb_routes.get_active_connections()) == []


def test_raw_socket_responder_skip_or_start():
    interface = os.getenv("MAP2_AVDECC_MOCK_INTERFACE", "lo")
    available, reason = raw_socket_available(interface=interface)
    if not available:
        pytest.skip(f"raw-socket responder unavailable on {interface}: {reason}")

    responder = RawSocketAvdeccResponder(device=MockAvdeccDevice(), interface=interface)
    responder.start()
    responder.stop()
