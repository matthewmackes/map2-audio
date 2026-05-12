"""HTTP tests for `GET /api/audio/interfaces` (T2518)."""

from __future__ import annotations

from typing import Any, Dict, List

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


def _pw_dump_fixture() -> List[Dict[str, Any]]:
    return [
        {
            "type": "PipeWire:Interface:Node",
            "id": 100,
            "info": {
                "props": {
                    "media.class": "Audio/Source",
                    "device.vendor.id": "0x1234",
                    "device.product.id": "0x5678",
                    "device.serial": "abcdef",
                    "device.vendor.name": "Acme",
                    "device.product.name": "USB Box",
                    "node.description": "Acme USB Box",
                    "audio.channels": 4,
                    "audio.rate": 48000,
                },
            },
        },
    ]


def _build_app(monkeypatch: pytest.MonkeyPatch, *, pipewire: Any, avb: Any, cluster: Any, local_id: Any) -> TestClient:
    from app.routes import audio as audio_routes
    from app.services import audio_interface_registry as registry_module

    async def _async_value(value: Any) -> Any:
        return value

    test_registry = registry_module.AudioInterfaceRegistry(
        pipewire_dump_loader=lambda: _async_value(pipewire),
        avb_capabilities_loader=lambda: _async_value(avb),
        cluster_inventory_loader=lambda: _async_value(cluster),
        local_node_id_loader=lambda: _async_value(local_id),
    )

    monkeypatch.setattr(
        registry_module,
        "get_audio_interface_registry",
        lambda: test_registry,
    )

    app = FastAPI()
    app.include_router(audio_routes.router)
    return TestClient(app)


def test_get_audio_interfaces_returns_merged_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    client = _build_app(
        monkeypatch,
        pipewire=_pw_dump_fixture(),
        avb={
            "avb_talkers": [
                {
                    "endpoint_id": "AVB-T-1",
                    "device_name": "MOTU",
                    "host": "10.0.0.1",
                    "channels": 8,
                    "sample_rate": 48000,
                    "available": True,
                }
            ],
            "avb_listeners": [],
        },
        cluster={
            "peer-2": {
                "pipewire_devices": [
                    {
                        "identifier": "tascam",
                        "name": "TASCAM",
                        "input_count": 4,
                        "output_count": 4,
                        "available": True,
                    }
                ]
            }
        },
        local_id="local-1",
    )

    response = client.get("/api/audio/interfaces")
    assert response.status_code == 200

    payload = response.json()
    interface_ids = {iface["interface_id"] for iface in payload["interfaces"]}
    assert interface_ids == {
        "pipewire:usb:0x1234:0x5678:abcdef",
        "avb:avb-t-1",
        "cluster:peer-2:tascam",
    }

    assert payload["default_interface_id"] == "pipewire:usb:0x1234:0x5678:abcdef"
    assert "pipewire_usb" in payload["transports"]
    assert "avb" in payload["transports"]
    assert "cluster" in payload["transports"]


def test_get_audio_interfaces_empty_when_no_sources(monkeypatch: pytest.MonkeyPatch) -> None:
    client = _build_app(
        monkeypatch,
        pipewire=[],
        avb={},
        cluster={},
        local_id=None,
    )

    response = client.get("/api/audio/interfaces")
    assert response.status_code == 200
    payload = response.json()
    assert payload["interfaces"] == []
    assert payload["default_interface_id"] is None
