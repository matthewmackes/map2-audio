import asyncio
from types import SimpleNamespace

from fastapi import HTTPException

from app.routes import avb as avb_routes
from app.services.avb.avb_router import AudioEndpoint, AvbRouter, StreamConnection, StreamDirection
from app.services.avb import avb_router as avb_router_module


ENTITY_ID = int("0011223344556677", 16)
LISTENER_ID = int("8899aabbccddeeff", 16)


class _ControllerSurface:
    def __init__(self):
        self.calls: list[tuple[str, tuple[int, int, int, int]]] = []
        self.entity = SimpleNamespace(
            entity_id=ENTITY_ID,
            entity_model_id=int("00aa00bb00cc00dd", 16),
            entity_name="StageBox",
            firmware_version="1.2.3",
            group_name="stage-a.local",
            serial_number="STAGE-001",
            mac_address=[0x00, 0x11, 0x22, 0x33, 0x44, 0x55],
            talker_stream_sources=1,
            listener_stream_sinks=1,
            gptp_supported=True,
            gptp_grandmaster_id=int("00aa00bb00cc00dd", 16),
            gptp_domain_number=7,
            available=True,
            streamInputs=[
                {
                    "stream_index": 2,
                    "current_format": 0x0200000818000005,
                }
            ],
            streamOutputs=[
                {
                    "stream_index": 5,
                    "current_format": "0x0200000418000007",
                }
            ],
            isAudioTalker=lambda: True,
            isAudioListener=lambda: True,
        )
        self.active_connections = [
            {
                "talker_entity_id": f"{ENTITY_ID:016x}",
                "talker_unique_id": 2,
                "listener_entity_id": f"{LISTENER_ID:016x}",
                "listener_unique_id": 5,
                "connected": True,
            },
            {
                "talker_entity_id": f"{ENTITY_ID:016x}",
                "talker_unique_id": 3,
                "listener_entity_id": f"{LISTENER_ID:016x}",
                "listener_unique_id": 6,
                "connected": True,
            },
        ]

    def getDiscoveredEntities(self):
        return [self.entity]

    def getActiveConnections(self):
        return list(self.active_connections)

    def connectStream(self, *args):
        self.calls.append(("connect", args))
        return True

    def disconnectStream(self, *args):
        self.calls.append(("disconnect", args))
        return True


def _prepare_route_env(monkeypatch, controller: _ControllerSurface) -> None:
    monkeypatch.setattr(avb_routes, "_is_avdecc_enabled", lambda: True)
    monkeypatch.setattr(avb_routes, "_local_source_node_id", lambda: "node-local")
    monkeypatch.setattr(
        avb_router_module,
        "get_avb_router",
        lambda: SimpleNamespace(avdecc_entity=controller),
    )


def test_extract_avdecc_entity_accepts_camel_case_controller_surface():
    controller = _ControllerSurface()

    assert avb_router_module._extract_avdecc_entity(controller) is controller


def test_discover_avdecc_endpoints_from_camel_case_controller_surface():
    controller = _ControllerSurface()
    router = AvbRouter(avdecc_entity=controller)

    asyncio.run(router._discover_avdecc_endpoints())

    talkers = router.get_talkers()
    listeners = router.get_listeners()

    assert len(talkers) == 1
    assert len(listeners) == 1
    assert talkers[0].device_type == "avdecc"
    assert talkers[0].device_name == "StageBox @ stage-a.local"
    assert talkers[0].host == "stage-a.local"
    assert talkers[0].node_address == "avdecc://stage-a.local"
    assert talkers[0].unique_id == 2
    assert talkers[0].channels == 8
    assert talkers[0].sample_rate == 48000
    assert listeners[0].unique_id == 5
    assert listeners[0].channels == 4
    assert listeners[0].sample_rate == 96000


def test_connect_and_disconnect_via_avdecc_supports_camel_case_methods():
    controller = _ControllerSurface()
    router = AvbRouter(avdecc_entity=controller)
    connection = StreamConnection(
        talker=AudioEndpoint(
            entity_id=f"{ENTITY_ID:016x}",
            unique_id=2,
            direction=StreamDirection.TALKER,
            device_type="avdecc",
            device_name="Talker",
            channels=2,
            sample_rate=48000,
        ),
        listener=AudioEndpoint(
            entity_id=f"{LISTENER_ID:016x}",
            unique_id=5,
            direction=StreamDirection.LISTENER,
            device_type="avdecc",
            device_name="Listener",
            channels=2,
            sample_rate=48000,
        ),
    )

    assert asyncio.run(router._connect_via_avdecc(connection)) is True
    assert asyncio.run(router._disconnect_via_avdecc(connection)) is True
    assert controller.calls == [
        ("connect", (ENTITY_ID, 2, LISTENER_ID, 5)),
        ("disconnect", (ENTITY_ID, 2, LISTENER_ID, 5)),
    ]


def test_get_avdecc_entities_route_accepts_camel_case_controller_surface(monkeypatch):
    controller = _ControllerSurface()
    _prepare_route_env(monkeypatch, controller)

    payload = asyncio.run(avb_routes.get_avdecc_entities())

    assert payload["enabled"] is True
    assert payload["source_node_id"] == "node-local"
    assert "error" not in payload
    assert payload["entities"] == [
        {
            "entity_id": f"{ENTITY_ID:016x}",
            "entity_model_id": "00aa00bb00cc00dd",
            "entity_name": "StageBox",
            "firmware_version": "1.2.3",
            "mac_address": "00:11:22:33:44:55",
            "capabilities": {
                "talker_streams": 1,
                "listener_streams": 1,
                "is_audio_talker": True,
                "is_audio_listener": True,
                "gptp_supported": True,
            },
            "ptp": {
                "grandmaster_id": "00aa00bb00cc00dd",
                "domain": 7,
            },
            "available": True,
            "last_seen": payload["entities"][0]["last_seen"],
            "source_node_id": "node-local",
        }
    ]


def test_get_avdecc_entity_route_falls_back_to_discovery_for_camel_case_controller_surface(monkeypatch):
    controller = _ControllerSurface()
    _prepare_route_env(monkeypatch, controller)

    payload = asyncio.run(avb_routes.get_avdecc_entity(f"{ENTITY_ID:016x}"))

    assert payload["entity_id"] == f"{ENTITY_ID:016x}"
    assert payload["entity_name"] == "StageBox"
    assert payload["capabilities"]["is_audio_talker"] is True
    assert payload["source_node_id"] == "node-local"


def test_get_avdecc_entity_route_returns_404_for_missing_discovered_entity(monkeypatch):
    controller = _ControllerSurface()
    controller.entity.entity_id = int("0000000000000001", 16)
    _prepare_route_env(monkeypatch, controller)

    try:
        asyncio.run(avb_routes.get_avdecc_entity(f"{ENTITY_ID:016x}"))
    except HTTPException as exc:
        assert exc.status_code == 404
        assert exc.detail == "Entity not found"
    else:
        raise AssertionError("Expected get_avdecc_entity to raise HTTPException")


def test_get_avdecc_stats_route_accepts_camel_case_controller_surface(monkeypatch):
    controller = _ControllerSurface()
    _prepare_route_env(monkeypatch, controller)

    payload = asyncio.run(avb_routes.get_avdecc_stats())

    assert payload["enabled"] is True
    assert payload["entities_discovered"] == 1
    assert payload["connections_active"] == 2
