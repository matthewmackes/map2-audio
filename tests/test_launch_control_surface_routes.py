from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import launch_control_surface as launch_control_routes
from app.services.launch_control_surface.service import (
    get_launch_control_surface_service,
    reset_launch_control_surface_service,
)


class _FakeLaunchControlService:
    async def ensure_daemon_started(self) -> None:
        return None

    def list_matching_ports(self) -> list[dict]:
        return [
            {"port_id": "lc-out", "name": "Launch Control XL", "direction": "duplex", "variant": "launch_control_xl"},
        ]

    def get_state_snapshot(self) -> dict:
        return {
            "template_state_by_port": {"lc-out": {"template_index": 0}},
            "active_snapshot_mapping": {"snapshot_id": 11, "mapping_count": 1},
            "last_activation_push": {"led_push_count": 1},
            "daemon_status": {"state": "connected", "available": True, "reconnect_count": 1, "matched_port_count": 1, "last_destination_ports": ["lc-out"], "notification": None},
            "recent_events": [{"event": {"event_type": "note"}}],
        }

    def _iter_live_input_mappings(self, live_snapshot_payload: dict) -> list[dict]:
        return [
            {
                "control_id": "button-1",
                "control_type": "button",
                "label": "Lead",
                "note": 73,
                "channel": 1,
                "assignment": {"kind": "toggle_plugin", "block_id": "lead:0"},
                "led_override": "green_full",
            }
        ]

    async def push_snapshot_activation(self, **kwargs) -> dict:
        return {"status": "completed", **kwargs}


class _FakeRuntimeStateService:
    def __init__(self, _session) -> None:
        pass

    async def get_live_snapshot_payload(self):
        return {"id": 11, "name": "Lead", "extensions": {"launch_control": {"mappings": [{"control_id": "button-1"}]}}}


class _FakeSnapshotService:
    def __init__(self, _session) -> None:
        pass

    async def get_live_snapshot(self):
        return {"id": 11, "name": "Lead", "extensions": {"launch_control": {"mappings": [{"control_id": "button-1"}]}}}

    async def update_snapshot(self, snapshot_id: int, *, detail_payload=None, capture_current_authority_extensions=True):
        return {
            "id": snapshot_id,
            "name": "Lead",
            "extensions": {
                "launch_control": {
                    "mappings": [
                        {
                            "control_id": "button-1",
                            "led_override": "amber_full",
                        }
                    ]
                }
            },
        }


def _build_client(monkeypatch) -> TestClient:
    app = FastAPI()
    app.include_router(launch_control_routes.router)

    @asynccontextmanager
    async def _fake_get_session(read_only: bool = False):
        yield {"read_only": read_only}

    monkeypatch.setattr(launch_control_routes, "get_session", _fake_get_session)
    monkeypatch.setattr(launch_control_routes, "get_launch_control_surface_service", lambda: _FakeLaunchControlService())
    monkeypatch.setattr(launch_control_routes, "SnapshotRuntimeStateService", _FakeRuntimeStateService)
    monkeypatch.setattr(launch_control_routes, "SnapshotService", _FakeSnapshotService)
    return TestClient(app)


def test_launch_control_routes_status_projection_and_mapping_patch(monkeypatch):
    client = _build_client(monkeypatch)

    status = client.get("/api/launch-control/status")
    assert status.status_code == 200
    assert status.json()["state"]["connected"] is True
    assert status.json()["state"]["matched_port_count"] == 1
    assert status.json()["state"]["daemon_status"]["state"] == "connected"

    projection = client.get("/api/launch-control/projection")
    assert projection.status_code == 200
    assert projection.json()["projection"]["snapshot"]["name"] == "Lead"
    assert projection.json()["projection"]["controls"][0]["assignment_summary"] == "Bypass toggle: lead:0"

    mapping = client.post(
        "/api/launch-control/mapping",
        json={"control_id": "button-1", "patch": {"led_override": "amber_full"}},
    )
    assert mapping.status_code == 200
    assert mapping.json()["projection"]["snapshot"]["id"] == 11


def test_launch_control_surface_singleton_reset():
    reset_launch_control_surface_service()
    first = get_launch_control_surface_service()
    second = get_launch_control_surface_service()
    assert first is second

    reset_launch_control_surface_service()
    replacement = get_launch_control_surface_service()
    assert replacement is not first
