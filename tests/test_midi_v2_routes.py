from __future__ import annotations

from contextlib import asynccontextmanager
from dataclasses import dataclass

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import midi_v2 as midi_v2_routes
from app.services.midi_service import CurveType


class _FakeEngine:
    def __init__(self) -> None:
        self.cc_messages: list[tuple[int, int, int]] = []
        self.midi_enabled: bool | None = None

    def midi_send_cc(self, channel: int, cc: int, value: int) -> bool:
        self.cc_messages.append((channel, cc, value))
        return True

    async def enable_midi(self, enable: bool) -> bool:
        self.midi_enabled = enable
        return enable

    async def get_midi_input_devices(self):
        return [{"name": "Engine In"}]

    async def get_midi_output_devices(self):
        return [{"name": "Engine Out"}]


class _FakeMidiService:
    def __init__(self) -> None:
        self._active_chain_id = 12
        self._engine = None
        self.recorded_chain_id = None
        self.recorded_plugin_lookup: tuple[str, int | None] | None = None
        self.created_dto = None
        self.created_command_dto = None
        self.updated_command = None
        self.attached = 0
        self.detached = 0

    def attach_midi_hub(self):
        self.attached += 1

    def detach_midi_hub(self):
        self.detached += 1

    async def get_all_mappings(self, _session, chain_id=None):
        self.recorded_chain_id = chain_id
        return [
            {"id": 1, "name": "Enabled", "is_enabled": True},
            {"id": 2, "name": "Disabled", "is_enabled": False},
        ]

    async def get_mappings_for_plugin(self, plugin_uri, _session, plugin_position=None):
        self.recorded_plugin_lookup = (plugin_uri, plugin_position)
        return [{"id": 3, "plugin_uri": plugin_uri, "plugin_position": plugin_position, "is_enabled": True}]

    async def create_mapping(self, dto, _session):
        self.created_dto = dto
        return 41

    async def get_mapping(self, mapping_id, _session):
        if mapping_id == 41:
            return {
                "id": 41,
                "name": self.created_dto.name,
                "target_plugin_uri": self.created_dto.target_plugin_uri,
                "target_plugin_position": self.created_dto.target_plugin_position,
                "curve_type": self.created_dto.curve_type.value,
            }
        return {"id": mapping_id}

    async def send_mapping_feedback_test(self, *_args, **_kwargs):
        raise RuntimeError("engine offline")

    async def get_all_commands(self, _session):
        return [
            {
                "id": 9,
                "command_type": "note_on",
                "channel": 1,
                "data1": 60,
                "data2": 100,
                "action_type": "toggle_plugin",
                "target_chain_id": None,
                "target_plugin_uri": "map2://plugin",
                "target_plugin_position": 3,
                "action_data": {},
                "name": "Toggle plugin",
                "is_enabled": True,
            }
        ]

    async def create_command(self, dto, _session):
        self.created_command_dto = dto
        return 51

    async def get_command(self, command_id, _session):
        if command_id == 51 and self.created_command_dto is not None:
            return {
                "id": 51,
                "command_type": self.created_command_dto.command_type.value,
                "channel": self.created_command_dto.channel,
                "data1": self.created_command_dto.data1,
                "data2": self.created_command_dto.data2,
                "action_type": self.created_command_dto.action_type.value,
                "target_chain_id": self.created_command_dto.target_chain_id,
                "target_plugin_uri": self.created_command_dto.target_plugin_uri,
                "target_plugin_position": self.created_command_dto.target_plugin_position,
                "action_data": self.created_command_dto.action_data,
                "name": self.created_command_dto.name,
                "is_enabled": True,
            }
        if command_id == 9:
            return {
                "id": 9,
                "command_type": "note_on",
                "channel": 1,
                "data1": 60,
                "data2": 100,
                "action_type": "toggle_plugin",
                "target_chain_id": None,
                "target_plugin_uri": "map2://plugin",
                "target_plugin_position": 4,
                "action_data": {},
                "name": "Toggle plugin",
                "is_enabled": True,
            }
        return None

    async def update_command(self, command_id, updates, _session):
        self.updated_command = (command_id, dict(updates))
        return command_id == 9

    def get_learn_status(self):
        return {
            "active": True,
            "target": {
                "chain_id": 5,
                "plugin_uri": "map2://plugin",
                "plugin_position": 2,
                "param_index": 7,
                "param_symbol": "mix",
                "min_val": 0.2,
                "max_val": 0.8,
                "curve": CurveType.EXPONENTIAL,
            },
        }


def _build_client(monkeypatch, service: _FakeMidiService | None = None) -> tuple[TestClient, _FakeMidiService]:
    fake_service = service or _FakeMidiService()

    @asynccontextmanager
    async def _fake_session():
        yield object()

    app = FastAPI()
    app.include_router(midi_v2_routes.router)
    monkeypatch.setattr(midi_v2_routes, "get_session", _fake_session)
    monkeypatch.setattr(midi_v2_routes, "midi_service", fake_service)
    return TestClient(app), fake_service


def test_list_mappings_filters_enabled_entries(monkeypatch):
    client, service = _build_client(monkeypatch)

    response = client.get("/api/v2/midi/mappings?chain_id=7&enabled_only=true")

    assert response.status_code == 200
    assert service.recorded_chain_id == 7
    assert response.json() == {
        "mappings": [{"id": 1, "name": "Enabled", "is_enabled": True}],
        "count": 1,
        "active_chain_id": 12,
    }


def test_list_mappings_for_plugin_passes_duplicate_safe_position(monkeypatch):
    client, service = _build_client(monkeypatch)

    response = client.get("/api/v2/midi/mappings?plugin_uri=map2://plugin&plugin_position=3")

    assert response.status_code == 200
    assert service.recorded_plugin_lookup == ("map2://plugin", 3)
    assert response.json()["mappings"][0]["plugin_position"] == 3


def test_create_mapping_returns_reloaded_mapping(monkeypatch):
    client, service = _build_client(monkeypatch)

    response = client.post(
        "/api/v2/midi/mappings",
        json={
            "channel": 1,
            "cc": 74,
            "chain_id": 9,
            "target_plugin_uri": "map2://plugin",
            "target_plugin_position": 2,
            "target_param_index": 5,
            "target_param_symbol": "gain",
            "min_val": 0.0,
            "max_val": 1.0,
            "curve_type": "linear",
            "invert": False,
            "feedback_enabled": True,
            "feedback_cc": 74,
            "name": "Filter cutoff",
            "group_id": 4,
        },
    )

    assert response.status_code == 200
    assert service.created_dto.target_plugin_position == 2
    assert service.created_dto.group_id == 4
    assert response.json() == {
        "mapping": {
            "id": 41,
            "name": "Filter cutoff",
            "target_plugin_uri": "map2://plugin",
            "target_plugin_position": 2,
            "curve_type": "linear",
        },
        "message": "Mapping created",
    }


def test_mapping_feedback_test_surfaces_engine_runtime_error(monkeypatch):
    client, _service = _build_client(monkeypatch)

    response = client.post("/api/v2/midi/mappings/41/test", json={"use_current_value": True})

    assert response.status_code == 503
    assert response.json()["detail"] == "engine offline"


def test_learn_status_normalizes_curve_enum_payload(monkeypatch):
    client, _service = _build_client(monkeypatch)

    response = client.get("/api/v2/midi/learn/status")

    assert response.status_code == 200
    assert response.json() == {
        "learning": True,
        "target": {
            "chain_id": 5,
            "plugin_uri": "map2://plugin",
            "plugin_position": 2,
            "parameter_index": 7,
            "parameter_symbol": "mix",
            "min_value": 0.2,
            "max_value": 0.8,
            "curve": "exponential",
        },
    }


def test_send_cc_requires_engine_and_uses_engine_when_present(monkeypatch):
    client, service = _build_client(monkeypatch)

    unavailable = client.post("/api/v2/midi/send/cc", json={"channel": 1, "cc": 10, "value": 64})
    service._engine = _FakeEngine()
    available = client.post("/api/v2/midi/send/cc", json={"channel": 2, "cc": 11, "value": 99})

    assert unavailable.status_code == 503
    assert unavailable.json()["detail"] == "MIDI engine not available"
    assert available.status_code == 200
    assert available.json() == {"success": True}
    assert service._engine.cc_messages == [(2, 11, 99)]


@dataclass
class _FakePort:
    name: str
    direction: str
    port_id: str
    kind: str = "hardware"


class _FakeHub:
    def __init__(self) -> None:
        self.running = False
        self.started = 0
        self.stopped = 0

    def start(self) -> None:
        self.running = True
        self.started += 1

    def stop(self) -> None:
        self.running = False
        self.stopped += 1

    def list_ports(self):
        return [
            _FakePort(name="Keys In", direction="input", port_id="in-1"),
            _FakePort(name="Synth Out", direction="output", port_id="out-1"),
        ]


class _FakeTrafficMonitor:
    def __init__(self) -> None:
        self.cleared = 0

    def clear(self) -> None:
        self.cleared += 1


class _FakeClockEngine:
    def __init__(self) -> None:
        self.running = False
        self.configured: dict | None = None

    def status(self):
        return {"bpm": 120.0, "running": self.running, "source_mode": "internal"}

    def configure(self, **updates):
        self.configured = dict(updates)
        return {"bpm": updates.get("bpm", 120.0), "running": self.running, "source_mode": updates.get("source_mode", "internal")}

    async def start(self):
        self.running = True
        return self.status()

    async def stop(self):
        self.running = False
        return self.status()

    async def cont(self):
        self.running = True
        return self.status()

    async def tap(self):
        return {"bpm": 121.0, "running": self.running, "source_mode": "internal"}


class _FakePortRouter:
    def __init__(self) -> None:
        self.routes: dict[str, dict] = {}
        self.match_mode = "all_match"

    def list_routes(self):
        return list(self.routes.values())

    def get_match_mode(self):
        return self.match_mode

    def add_route(self, payload):
        route_id = payload.get("route_id") or f"route-{len(self.routes) + 1}"
        route = {"route_id": route_id, **dict(payload)}
        self.routes[route_id] = route
        return route

    def update_route(self, route_id, payload):
        if route_id not in self.routes:
            return None
        self.routes[route_id] = {**self.routes[route_id], **dict(payload), "route_id": route_id}
        return self.routes[route_id]

    def delete_route(self, route_id):
        return self.routes.pop(route_id, None) is not None

    def set_route_enabled(self, route_id, enabled):
        if route_id not in self.routes:
            return None
        self.routes[route_id] = {**self.routes[route_id], "enabled": bool(enabled)}
        return self.routes[route_id]


def test_engine_lifecycle_uses_midi_hub_when_available(monkeypatch):
    hub = _FakeHub()
    client, service = _build_client(monkeypatch)
    monkeypatch.setattr(midi_v2_routes, "MIDI_HUB_AVAILABLE", True)
    monkeypatch.setattr(midi_v2_routes, "get_midi_hub", lambda: hub)

    started = client.post("/api/v2/midi/engine/start")
    stopped = client.post("/api/v2/midi/engine/stop")

    assert started.status_code == 200
    assert started.json() == {"status": "started", "running": True, "source": "midi_hub"}
    assert stopped.status_code == 200
    assert stopped.json() == {"status": "stopped", "running": False, "source": "midi_hub"}
    assert hub.started == 1
    assert hub.stopped == 1
    assert service.attached == 1
    assert service.detached == 1


def test_engine_lifecycle_falls_back_to_juce_engine(monkeypatch):
    client, service = _build_client(monkeypatch)
    service._engine = _FakeEngine()
    monkeypatch.setattr(midi_v2_routes, "MIDI_HUB_AVAILABLE", False)

    started = client.post("/api/v2/midi/engine/start")
    stopped = client.post("/api/v2/midi/engine/stop")

    assert started.status_code == 200
    assert started.json() == {"status": "started", "running": True, "source": "juce_engine"}
    assert stopped.status_code == 200
    assert stopped.json() == {"status": "stopped", "running": False, "source": "juce_engine"}
    assert service._engine.midi_enabled is False


def test_devices_refresh_uses_shared_inventory_path(monkeypatch):
    hub = _FakeHub()
    client, _service = _build_client(monkeypatch)
    monkeypatch.setattr(midi_v2_routes, "MIDI_HUB_AVAILABLE", True)
    monkeypatch.setattr(midi_v2_routes, "get_midi_hub", lambda: hub)

    response = client.post("/api/v2/midi/devices/refresh")

    assert response.status_code == 200
    assert response.json() == {
        "status": "refreshed",
        "inputs": [{"index": 0, "name": "Keys In", "type": "input", "port_id": "in-1", "kind": "hardware"}],
        "outputs": [{"index": 1, "name": "Synth Out", "type": "output", "port_id": "out-1", "kind": "hardware"}],
        "source": "midi_hub",
    }


def test_activity_clear_uses_midi_hub_traffic_monitor(monkeypatch):
    monitor = _FakeTrafficMonitor()
    client, _service = _build_client(monkeypatch)
    monkeypatch.setattr(midi_v2_routes, "MIDI_HUB_AVAILABLE", True)
    monkeypatch.setattr(midi_v2_routes, "get_midi_traffic_monitor", lambda: monitor)

    response = client.post("/api/v2/midi/activity/clear")

    assert response.status_code == 200
    assert response.json() == {"success": True, "source": "midi_hub"}
    assert monitor.cleared == 1


def test_clock_facade_delegates_to_midi_hub_clock_engine(monkeypatch):
    clock = _FakeClockEngine()
    client, _service = _build_client(monkeypatch)
    monkeypatch.setattr(midi_v2_routes, "MIDI_HUB_AVAILABLE", True)
    monkeypatch.setattr(midi_v2_routes, "get_midi_clock_engine", lambda: clock)

    status = client.get("/api/v2/midi/clock")
    configured = client.put("/api/v2/midi/clock", json={"bpm": 126.5, "source_mode": "external"})
    started = client.post("/api/v2/midi/clock/start")
    tapped = client.post("/api/v2/midi/clock/tap")
    stopped = client.post("/api/v2/midi/clock/stop")
    continued = client.post("/api/v2/midi/clock/continue")

    assert status.status_code == 200
    assert status.json()["bpm"] == 120.0
    assert configured.status_code == 200
    assert configured.json()["bpm"] == 126.5
    assert clock.configured == {"bpm": 126.5, "source_mode": "external"}
    assert started.json()["running"] is True
    assert tapped.json()["bpm"] == 121.0
    assert stopped.json()["running"] is False
    assert continued.json()["running"] is True


def test_clock_facade_reports_unavailable_without_midi_hub(monkeypatch):
    client, _service = _build_client(monkeypatch)
    monkeypatch.setattr(midi_v2_routes, "MIDI_HUB_AVAILABLE", False)

    response = client.get("/api/v2/midi/clock")

    assert response.status_code == 503
    assert response.json()["detail"] == "MIDI clock engine not available"


def test_port_route_facade_uses_midi_hub_router_with_legacy_aliases(monkeypatch):
    router = _FakePortRouter()
    client, _service = _build_client(monkeypatch)
    monkeypatch.setattr(midi_v2_routes, "MIDI_HUB_AVAILABLE", True)
    monkeypatch.setattr(midi_v2_routes, "get_midi_router", lambda: router)

    created = client.post(
        "/api/v2/midi/routes",
        json={
            "input_port": "Keys In",
            "output_port": "Synth Out",
            "filter": {"message_types": ["control_change"], "channels": [1]},
        },
    )
    listed = client.get("/api/v2/midi/routes")
    updated = client.put(
        "/api/v2/midi/routes/route-1",
        json={"source_port": "Keys In", "destination_ports": ["Rack Out"], "priority": 250},
    )
    disabled = client.post("/api/v2/midi/routes/route-1/disable")
    enabled = client.post("/api/v2/midi/routes/route-1/enable")
    deleted = client.delete("/api/v2/midi/routes/route-1")

    assert created.status_code == 200
    assert created.json()["route"]["source_port"] == "Keys In"
    assert created.json()["route"]["destination_ports"] == ["Synth Out"]
    assert created.json()["route"]["filter"]["message_types"] == ["control_change"]
    assert listed.json()["count"] == 1
    assert listed.json()["match_mode"] == "all_match"
    assert updated.json()["route"]["destination_ports"] == ["Rack Out"]
    assert updated.json()["route"]["priority"] == 250
    assert disabled.json()["route"]["enabled"] is False
    assert enabled.json()["route"]["enabled"] is True
    assert deleted.json() == {"status": "deleted", "route_id": "route-1"}


def test_port_route_facade_reports_unavailable_without_midi_hub(monkeypatch):
    client, _service = _build_client(monkeypatch)
    monkeypatch.setattr(midi_v2_routes, "MIDI_HUB_AVAILABLE", False)

    response = client.get("/api/v2/midi/routes")

    assert response.status_code == 503
    assert response.json()["detail"] == "MIDI route service not available"


def test_list_commands_includes_duplicate_safe_target_position(monkeypatch):
    client, _service = _build_client(monkeypatch)

    response = client.get("/api/v2/midi/commands")

    assert response.status_code == 200
    assert response.json()["commands"][0]["target_plugin_position"] == 3


def test_create_command_round_trips_duplicate_safe_target_position(monkeypatch):
    client, service = _build_client(monkeypatch)

    response = client.post(
        "/api/v2/midi/commands",
        json={
            "command_type": "note_on",
            "channel": 1,
            "data1": 60,
            "data2": 100,
            "action_type": "toggle_plugin",
            "target_plugin_uri": "map2://plugin",
            "target_plugin_position": 2,
            "name": "Toggle plugin",
            "action_data": {"scene": "lead"},
        },
    )

    assert response.status_code == 200
    assert service.created_command_dto.target_plugin_position == 2
    assert response.json() == {
        "command": {
            "id": 51,
            "command_type": "note_on",
            "channel": 1,
            "data1": 60,
            "data2": 100,
            "action_type": "toggle_plugin",
            "target_chain_id": None,
            "target_plugin_uri": "map2://plugin",
            "target_plugin_position": 2,
            "action_data": {"scene": "lead"},
            "name": "Toggle plugin",
            "is_enabled": True,
        },
        "message": "Command created",
    }


def test_update_command_passes_duplicate_safe_target_position(monkeypatch):
    client, service = _build_client(monkeypatch)

    response = client.patch(
        "/api/v2/midi/commands/9",
        json={
            "target_plugin_position": 4,
            "target_plugin_uri": "map2://plugin",
        },
    )

    assert response.status_code == 200
    assert service.updated_command == (9, {"target_plugin_position": 4, "target_plugin_uri": "map2://plugin"})
    assert response.json()["command"]["target_plugin_position"] == 4
