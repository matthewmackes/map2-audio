from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import midi_v2 as midi_v2_routes
from app.services.midi_service import CurveType


class _FakeEngine:
    def __init__(self) -> None:
        self.cc_messages: list[tuple[int, int, int]] = []

    def midi_send_cc(self, channel: int, cc: int, value: int) -> bool:
        self.cc_messages.append((channel, cc, value))
        return True


class _FakeMidiService:
    def __init__(self) -> None:
        self._active_chain_id = 12
        self._engine = None
        self.recorded_chain_id = None
        self.recorded_plugin_lookup: tuple[str, int | None] | None = None
        self.created_dto = None

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
