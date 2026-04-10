from __future__ import annotations

from contextlib import asynccontextmanager

import pytest

from app.services.mcu_surface.bridge import McuSnapshotEditorBridgeService
from app.services.mcu_surface.daemon import McuSurfaceDaemon
from app.services.mcu_surface.protocol import build_device_query
from app.services.mcu_surface.service import McuSurfaceService


class _FakePublisher:
    def __init__(self) -> None:
        self.messages: list[tuple[tuple[str, ...], dict[str, object]]] = []

    async def publish_message(self, message: dict[str, object], *, topics) -> None:
        self.messages.append((tuple(topics), dict(message)))


class _FakePort:
    def __init__(self, *, port_id: str, name: str, direction: str) -> None:
        self.port_id = port_id
        self.name = name
        self.direction = direction


class _FakeMidiHub:
    def __init__(self) -> None:
        self.subscribers: dict[str, object] = {}
        self.sent: list[dict[str, object]] = []
        self.port_snapshots: list[list[_FakePort]] = [
            [],
            [_FakePort(port_id="mcu-out", name="Mackie MCU Pro", direction="duplex")],
        ]

    def subscribe(self, subscriber_id: str, callback) -> None:
        self.subscribers[subscriber_id] = callback

    def list_ports(self):
        return self.port_snapshots[0] if len(self.port_snapshots) == 1 else self.port_snapshots.pop(0)

    def send(self, *, source_port: str, destination_port: str, data: bytes, metadata=None) -> bool:
        self.sent.append(
            {
                "source_port": source_port,
                "destination_port": destination_port,
                "data": bytes(data),
                "metadata": dict(metadata or {}),
            }
        )
        return True


class _FakeMaschineService:
    async def get_audio_grid_projection(self, _session):
        return {
            "selected_block_id": "path-a:0",
            "blocks": [
                {
                    "block_id": "path-a:0",
                    "path_id": "path-a",
                    "plugin_name": "Parametric EQ",
                    "plugin_uri": "urn:test:eq",
                    "plugin_position": 0,
                    "snapshot_chain_id": 11,
                }
            ],
        }

    async def select_audio_grid_block(self, _session, _block_id: str) -> None:
        return None


async def _fake_snapshot_provider(_session):
    return {
        "id": 77,
        "paths": [
            {
                "id": "path-a",
                "plugins": [
                    {
                        "position": 0,
                        "uri": "urn:test:eq",
                        "name": "Parametric EQ",
                        "category": "eq",
                        "parameters": {
                            "band0_freq": 220.0,
                            "band0_gain": 3.5,
                            "band0_q": 0.9,
                        },
                    }
                ],
            }
        ],
    }


def _plugin_catalog():
    return {
        "urn:test:eq": {
            "parameters": [
                {"index": 0, "name": "Band0 Freq", "symbol": "band0_freq", "min": 20.0, "max": 20000.0, "default": 440.0},
                {"index": 1, "name": "Band0 Gain", "symbol": "band0_gain", "min": -18.0, "max": 18.0, "default": 0.0},
                {"index": 2, "name": "Band0 Q", "symbol": "band0_q", "min": 0.1, "max": 8.0, "default": 1.0},
            ]
        }
    }


@pytest.mark.asyncio
async def test_mcu_surface_integration_reconnect_repushes_handshake_projection_and_faders(monkeypatch) -> None:
    publisher = _FakePublisher()
    midi_hub = _FakeMidiHub()
    service = McuSurfaceService(midi_hub=midi_hub, publisher=publisher)
    bridge = McuSnapshotEditorBridgeService(
        maschine_service=_FakeMaschineService(),
        mcu_surface_service=service,
        publisher=publisher,
        plugin_catalog_provider=_plugin_catalog,
        snapshot_provider=_fake_snapshot_provider,
    )

    @asynccontextmanager
    async def _fake_get_session(read_only: bool = False):
        yield {"read_only": read_only}

    class _Transport:
        def get_state(self) -> dict[str, object]:
            return {"active_owner": "midi_recorder", "owners": []}

    monkeypatch.setattr("app.database.get_session", _fake_get_session)
    monkeypatch.setattr("app.services.mcu_surface.bridge.get_mcu_snapshot_editor_bridge_service", lambda: bridge)
    monkeypatch.setattr("app.services.transport_service.get_transport_service", lambda: _Transport())

    daemon = McuSurfaceDaemon(
        get_ports=service.list_matching_ports,
        repush_surface_state=service._repush_surface_state,
        emit=service._emit,
        poll_interval_s=999.0,
    )

    await daemon.tick()
    assert daemon.snapshot()["state"] == "reconnecting"

    await daemon.tick()
    snapshot = daemon.snapshot()
    assert snapshot["state"] == "connected"
    assert snapshot["reconnect_count"] == 1
    assert snapshot["last_transport_owner"] == "midi_recorder"
    assert snapshot["last_destination_ports"] == ["mcu-out"]

    assert midi_hub.sent[0]["data"] == build_device_query()
    assert midi_hub.sent[1]["metadata"]["message_type"] == "scribble_strip"
    assert midi_hub.sent[2]["metadata"]["message_type"] == "motor_fader"
    assert midi_hub.sent[-1]["metadata"]["message_type"] == "meter_bridge"
    assert any(topics[0] == "mcu_surface:projection" for topics, _message in publisher.messages)
    assert any(topics[0] == "mcu_surface:transport_state" for topics, _message in publisher.messages)
