"""
T2491-5 — Milan v1.2 §5 MVU surface.

Covers the four MVU endpoints under /api/avb/milan/{entity_id}/*
and the Python-side `MilanCapabilitiesProvider`'s honest-state
contract: returns None when the engine controller isn't reachable,
and projects controller responses through dataclasses when it is.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes.avb import milan as milan_routes
from app.services.avb import milan_capabilities


@pytest.fixture
def app_client():
    app = FastAPI()
    app.include_router(milan_routes.router, prefix="/api/avb")
    return TestClient(app)


class _StubController:
    """Drop-in stand-in for the real Map2AvdeccController. Only
    the four MVU helpers are exercised here."""

    def __init__(self) -> None:
        self.set_calls: list[tuple[str, int]] = []

    def get_milan_info(self, entity_id: str) -> dict[str, Any]:
        return {
            "protocol_version": "1.2",
            "feature_flags": ["TALKER_DYNAMIC_MAPPINGS_WHILE_RUNNING"],
            "certification_version": "Milan-1.2",
            "device_profile": "talker_listener",
        }

    def get_system_unique_id(self, entity_id: str) -> int:
        return 0x91E0F000FE000001

    def set_system_unique_id(self, entity_id: str, value: int) -> bool:
        self.set_calls.append((entity_id, value))
        return True

    def get_media_clock_reference_info(self, entity_id: str) -> list[dict[str, Any]]:
        return [
            {
                "interface_index": 0,
                "priority": 50,
                "domain_class": "Class A",
                "recovered_clock_state": "locked",
                "grandmaster_id": "0x0011aafffe5566aa",
            },
        ]


@pytest.fixture
def stubbed_provider(monkeypatch):
    stub = _StubController()
    provider = milan_capabilities.MilanCapabilitiesProvider()
    monkeypatch.setattr(provider, "_resolve_controller", lambda: stub)
    monkeypatch.setattr(milan_capabilities, "_singleton", provider)
    monkeypatch.setattr(
        milan_capabilities,
        "get_milan_capabilities",
        lambda: provider,
    )
    return stub


def test_engine_unavailable_returns_honest_envelope(app_client, monkeypatch):
    """Default state: no engine controller is reachable in dev."""
    provider = milan_capabilities.MilanCapabilitiesProvider()
    monkeypatch.setattr(provider, "_resolve_controller", lambda: None)
    monkeypatch.setattr(milan_capabilities, "_singleton", provider)
    monkeypatch.setattr(
        milan_capabilities,
        "get_milan_capabilities",
        lambda: provider,
    )

    res = app_client.get("/api/avb/milan/0xabcd/info")
    assert res.status_code == 200
    body = res.json()
    assert body["available"] is False
    assert body["data"] is None
    assert "engine" in (body["error"] or "").lower()


def test_get_milan_info_surfaces_protocol_version_and_flags(app_client, stubbed_provider):
    res = app_client.get("/api/avb/milan/0xabcd/info")
    assert res.status_code == 200
    body = res.json()
    assert body["available"] is True
    assert body["data"]["protocol_version"] == "1.2"
    assert "TALKER_DYNAMIC_MAPPINGS_WHILE_RUNNING" in body["data"]["feature_flags"]
    assert body["data"]["device_profile"] == "talker_listener"


def test_get_system_unique_id_renders_64bit_hex(app_client, stubbed_provider):
    res = app_client.get("/api/avb/milan/0xabcd/system_unique_id")
    assert res.status_code == 200
    body = res.json()
    assert body["available"] is True
    assert body["data"]["value"] == "0x91e0f000fe000001"


def test_set_system_unique_id_round_trips_value(app_client, stubbed_provider):
    res = app_client.post(
        "/api/avb/milan/0xabcd/system_unique_id",
        json={"value": 0xDEADBEEFCAFEBABE},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["available"] is True
    assert body["data"]["value"] == "0xdeadbeefcafebabe"
    assert stubbed_provider.set_calls == [("0xabcd", 0xDEADBEEFCAFEBABE)]


def test_set_system_unique_id_validates_range(app_client, stubbed_provider):
    too_big = 1 << 65
    res = app_client.post(
        "/api/avb/milan/0xabcd/system_unique_id",
        json={"value": too_big},
    )
    assert res.status_code == 422


def test_get_media_clock_reference_info_returns_records(app_client, stubbed_provider):
    res = app_client.get("/api/avb/milan/0xabcd/media_clock_reference_info")
    assert res.status_code == 200
    body = res.json()
    assert body["available"] is True
    records = body["data"]["records"]
    assert len(records) == 1
    assert records[0]["domain_class"] == "Class A"
    assert records[0]["recovered_clock_state"] == "locked"
    assert records[0]["grandmaster_id"] == "0x0011aafffe5566aa"


def test_provider_handles_controller_method_exceptions(monkeypatch, caplog):
    class _ThrowingController:
        def get_milan_info(self, entity_id: str):
            raise RuntimeError("AVDECC boom")

    provider = milan_capabilities.MilanCapabilitiesProvider()
    monkeypatch.setattr(provider, "_resolve_controller", lambda: _ThrowingController())
    with caplog.at_level("WARNING"):
        info = provider.get_milan_info("0xabcd")
    assert info is None
    assert any("get_milan_info" in r.message for r in caplog.records)


def test_provider_set_returns_false_when_controller_raises(monkeypatch):
    class _ThrowingController:
        def set_system_unique_id(self, entity_id: str, value: int):
            raise RuntimeError("AECP timeout")

    provider = milan_capabilities.MilanCapabilitiesProvider()
    monkeypatch.setattr(provider, "_resolve_controller", lambda: _ThrowingController())
    assert provider.set_system_unique_id("0xabcd", 0x1234) is False
