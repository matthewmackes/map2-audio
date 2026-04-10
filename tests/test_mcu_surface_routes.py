from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import mcu_surface as mcu_routes


class _FakeMcuSurfaceService:
    async def ensure_daemon_started(self) -> None:
        return None

    def list_matching_ports(self) -> list[dict]:
        return [
            {"port_id": "mcu-in", "name": "Mackie MCU Pro", "direction": "duplex"},
        ]

    def get_state_snapshot(self) -> dict:
        return {
            "identity": {"event_type": "identity_response", "version": "1.2.3.4"},
            "recent_events": [{"status": "completed", "event": {"event_type": "button"}}],
            "daemon_status": {"state": "connected", "available": True, "matched_port_count": 1},
        }


class _FakeBridgeService:
    async def build_projection(self, _session):
        return {
            "selected_plugin": {"plugin_name": "Parametric EQ", "plugin_uri": "urn:test:eq"},
            "bank_index": 0,
            "bank_count": 2,
            "active_bank": {"title": "EQ 1/2"},
            "scribble_labels": ["Freq", "Gain"],
            "channel_strips": [
                {"slot_index": 0, "assigned": True, "scribble_label": "Freq", "normalized_value": 0.5},
                {"slot_index": 1, "assigned": True, "scribble_label": "Gain", "normalized_value": 0.75},
            ],
        }

    async def handle_surface_event(self, _session, event, destination_port=None):
        return {
            "status": "completed",
            "event": dict(event),
            "destination_port": destination_port,
        }


class _FakeTransportService:
    def get_state(self) -> dict:
        return {"active_owner": "midi_recorder", "owners": []}


def _build_client(monkeypatch) -> TestClient:
    app = FastAPI()
    app.include_router(mcu_routes.router)

    @asynccontextmanager
    async def _fake_get_session(read_only: bool = False):
        yield {"read_only": read_only}

    monkeypatch.setattr(mcu_routes, "get_session", _fake_get_session)
    monkeypatch.setattr(mcu_routes, "get_mcu_surface_service", lambda: _FakeMcuSurfaceService())
    monkeypatch.setattr(mcu_routes, "get_mcu_snapshot_editor_bridge_service", lambda: _FakeBridgeService())
    monkeypatch.setattr(mcu_routes, "get_transport_service", lambda: _FakeTransportService())
    return TestClient(app)


def test_mcu_routes_status_projection_and_event(monkeypatch):
    client = _build_client(monkeypatch)

    status = client.get("/api/mcu/status")
    assert status.status_code == 200
    assert status.json()["state"]["connected"] is True
    assert status.json()["state"]["matched_port_count"] == 1
    assert status.json()["state"]["identity"]["version"] == "1.2.3.4"
    assert status.json()["state"]["daemon_status"]["state"] == "connected"

    projection = client.get("/api/mcu/projection")
    assert projection.status_code == 200
    assert projection.json()["projection"]["selected_plugin"]["plugin_name"] == "Parametric EQ"
    assert projection.json()["projection"]["active_bank"]["title"] == "EQ 1/2"
    assert projection.json()["transport"]["active_owner"] == "midi_recorder"

    event = client.post("/api/mcu/event", json={"event": {"event_type": "button", "pressed": True, "note": 46}, "destination_port": "MCU Out"})
    assert event.status_code == 200
    assert event.json()["result"]["status"] == "completed"
    assert event.json()["result"]["destination_port"] == "MCU Out"
