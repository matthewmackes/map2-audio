"""
T2492-2 — `/api/midi/hub/status` enriches each port with USB
descriptor fields + the resolved device-registry profile_id, so the
/midi/connections UI can render the "Unknown device" Tag and pre-
populate the device-pack auto-generator wizard.

Verifies the route-level enrichment in isolation by stubbing the
hub + registry singletons; no daemon required.
"""

from __future__ import annotations

from typing import Any, Dict, List
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.routes import midi_hub as midi_hub_routes


@pytest.fixture
def app_client(monkeypatch):
    from fastapi import FastAPI

    app = FastAPI()
    app.include_router(midi_hub_routes.router)

    fake_hub = MagicMock()
    fake_hub.to_dict.return_value = {
        "running": True,
        "ports": [
            {
                "port_id": "alsa:0:Maschine MK1",
                "name": "Maschine MK1",
                "direction": "duplex",
                "kind": "alsa",
                "is_open": True,
                "metadata": {},
            },
            {
                "port_id": "alsa:1:Some Unknown USB",
                "name": "Some Unknown USB",
                "direction": "duplex",
                "kind": "alsa",
                "is_open": False,
                "metadata": {},
            },
            {
                "port_id": "virtual:0:Network",
                "name": "Network",
                "direction": "duplex",
                "kind": "virtual",
                "is_open": True,
                "metadata": {},
            },
        ],
    }

    fake_router_service = MagicMock()
    fake_router_service.list_routes.return_value = []
    fake_router_service.get_match_mode.return_value = "any"

    fake_monitor = MagicMock()
    fake_monitor.snapshot.return_value = {"captured_total": 0, "capacity": 0}

    fake_registry = MagicMock()
    fake_registry.snapshot.return_value = {
        "devices": [
            {
                "device_id": "maschine_mk1:Maschine MK1",
                "profile_id": "maschine_mk1",
                "vendor_id": "0x17cc",
                "product_id": "0x0808",
                "port_ids": ["alsa:0:Maschine MK1"],
                "port_names": ["Maschine MK1"],
            },
            {
                "device_id": "generic_controller:some-unknown-usb",
                "profile_id": "generic_controller",
                "vendor_id": "0x1234",
                "product_id": "0x5678",
                "port_ids": ["alsa:1:Some Unknown USB"],
                "port_names": ["Some Unknown USB"],
            },
        ]
    }

    monkeypatch.setattr(midi_hub_routes, "get_midi_hub", lambda: fake_hub)
    monkeypatch.setattr(midi_hub_routes, "get_midi_router", lambda: fake_router_service)
    monkeypatch.setattr(midi_hub_routes, "get_midi_traffic_monitor", lambda: fake_monitor)
    monkeypatch.setattr(midi_hub_routes, "get_midi_device_registry", lambda: fake_registry)
    return TestClient(app)


def _ports_by_id(payload: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    return {p["port_id"]: p for p in payload["ports"]}


def test_curated_alsa_port_carries_resolved_profile_id(app_client):
    response = app_client.get("/api/midi/hub/status")
    assert response.status_code == 200
    by_id = _ports_by_id(response.json())
    maschine = by_id["alsa:0:Maschine MK1"]
    assert maschine["vendor_id"] == "0x17cc"
    assert maschine["product_id"] == "0x0808"
    assert maschine["profile_id"] == "maschine_mk1"


def test_unrecognized_alsa_port_resolves_to_generic_controller(app_client):
    response = app_client.get("/api/midi/hub/status")
    assert response.status_code == 200
    by_id = _ports_by_id(response.json())
    unknown = by_id["alsa:1:Some Unknown USB"]
    assert unknown["vendor_id"] == "0x1234"
    assert unknown["product_id"] == "0x5678"
    assert unknown["profile_id"] == "generic_controller"


def test_virtual_port_has_no_descriptor_or_profile(app_client):
    response = app_client.get("/api/midi/hub/status")
    assert response.status_code == 200
    by_id = _ports_by_id(response.json())
    virt = by_id["virtual:0:Network"]
    assert "vendor_id" not in virt
    assert "product_id" not in virt
    assert "profile_id" not in virt
