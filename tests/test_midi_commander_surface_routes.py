from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import midi_commander_surface as midi_commander_routes
from app.services.midi_commander_surface.service import (
    get_midi_commander_surface_service,
    reset_midi_commander_surface_service,
)


class _FakeMidiCommanderService:
    async def ensure_daemon_started(self) -> None:
        return None

    def list_matching_ports(self) -> list[dict]:
        return [{"port_id": "mc-in", "name": "MIDI Commander", "direction": "duplex", "variant": "midi_commander"}]

    def get_state_snapshot(self) -> dict:
        return {
            "active_snapshot_mapping": {
                "snapshot_id": 11,
                "mapping_count": 12,
                "manual_setup": {"supported": False, "transport": "manual_setup", "lines": ["line 1", "line 2"]},
            },
            "last_activation_push": {"configuration_transport": "manual_setup"},
            "active_profile": {"name": "MeloAudio MIDI Commander"},
            "current_bank": 0,
            "expression_calibrations": {"EXP1": {"min_raw": 0}},
            "daemon_status": {"state": "connected", "available": True, "reconnect_count": 1, "matched_port_count": 1, "notification": None},
            "recent_events": [{"event": {"event_type": "button"}}],
            "detected_ports": [{"port_id": "mc-in", "name": "MIDI Commander", "direction": "duplex", "variant": "midi_commander"}],
        }

    def _iter_live_input_mappings(self, live_snapshot_payload: dict) -> list[dict]:
        return [
            {
                "control_id": "1",
                "control_type": "button",
                "label": "Switch 1",
                "message_type": "control_change",
                "controller": 80,
                "assignment": {"kind": "transport", "transport_action": "play"},
            },
            {
                "control_id": "EXP1",
                "control_type": "expression",
                "label": "EXP1",
                "message_type": "control_change",
                "controller": 7,
                "assignment": {"kind": "expression_target", "param_id": "gain"},
            },
        ]

    def _normalize_extension_payload(self, _payload: dict) -> list[dict]:
        return self._iter_live_input_mappings({})

    async def push_snapshot_activation(self, **kwargs) -> dict:
        return {"status": "completed", **kwargs}


class _FakeRuntimeStateService:
    def __init__(self, _session) -> None:
        pass

    async def get_live_snapshot_payload(self):
        return {"id": 11, "name": "Lead", "extensions": {"midi_commander": {"mappings": [{"control_id": "1"}]}}}


class _FakeSnapshotService:
    def __init__(self, _session) -> None:
        pass

    async def get_live_snapshot(self):
        return {"id": 11, "name": "Lead", "extensions": {"midi_commander": {"mappings": [{"control_id": "1"}]}}}

    async def update_snapshot(self, snapshot_id: int, *, detail_payload=None, capture_current_authority_extensions=True):
        return {
            "id": snapshot_id,
            "name": "Lead",
            "extensions": {
                "midi_commander": {
                    "mappings": [{"control_id": "1", "assignment": {"kind": "transport", "transport_action": "play"}}],
                }
            },
        }


def _build_client(monkeypatch) -> TestClient:
    app = FastAPI()
    app.include_router(midi_commander_routes.router)

    @asynccontextmanager
    async def _fake_get_session(read_only: bool = False):
        yield {"read_only": read_only}

    monkeypatch.setattr(midi_commander_routes, "get_session", _fake_get_session)
    monkeypatch.setattr(midi_commander_routes, "get_midi_commander_surface_service", lambda: _FakeMidiCommanderService())
    monkeypatch.setattr(midi_commander_routes, "SnapshotRuntimeStateService", _FakeRuntimeStateService)
    monkeypatch.setattr(midi_commander_routes, "SnapshotService", _FakeSnapshotService)
    return TestClient(app)


def test_midi_commander_routes_status_projection_and_mapping_patch(monkeypatch):
    client = _build_client(monkeypatch)

    status = client.get("/api/midi-commander/status")
    assert status.status_code == 200
    assert status.json()["state"]["connected"] is True
    assert status.json()["state"]["matched_port_count"] == 1

    projection = client.get("/api/midi-commander/projection")
    assert projection.status_code == 200
    assert projection.json()["projection"]["snapshot"]["name"] == "Lead"
    assert projection.json()["projection"]["controls"][0]["assignment_summary"] == "Transport: play"

    mapping = client.post(
        "/api/midi-commander/mapping",
        json={"control_id": "1", "patch": {"assignment": {"kind": "transport", "transport_action": "play"}}},
    )
    assert mapping.status_code == 200
    assert mapping.json()["projection"]["snapshot"]["id"] == 11


def test_midi_commander_surface_singleton_reset():
    reset_midi_commander_surface_service()
    first = get_midi_commander_surface_service()
    second = get_midi_commander_surface_service()
    assert first is second

    reset_midi_commander_surface_service()
    replacement = get_midi_commander_surface_service()
    assert replacement is not first
