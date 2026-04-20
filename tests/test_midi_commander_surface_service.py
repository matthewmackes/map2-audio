from __future__ import annotations

from types import SimpleNamespace

import pytest

import app.services.midi_commander_surface.service as midi_commander_surface_service_module
from app.services.midi_commander_surface.service import MidiCommanderSurfaceService


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
        self.ports = [_FakePort(port_id="mc-in", name="MIDI Commander", direction="duplex")]

    def subscribe(self, subscriber_id: str, callback) -> None:
        self.subscribers[subscriber_id] = callback

    def unsubscribe(self, subscriber_id: str) -> bool:
        self.subscribers.pop(subscriber_id, None)
        return True

    def list_ports(self):
        return list(self.ports)


class _FakeSessionContext:
    async def __aenter__(self):
        return object()

    async def __aexit__(self, exc_type, exc, tb):
        return False


@pytest.mark.asyncio
async def test_midi_commander_service_pushes_manual_setup_snapshot_activation() -> None:
    service = MidiCommanderSurfaceService(midi_hub=_FakeMidiHub(), publisher=_FakePublisher())

    result = await service.push_snapshot_activation(
        snapshot_id=21,
        snapshot_name="Lead",
        extension_payload={
            "mappings": [
                {
                    "control_id": "1",
                    "assignment": {"kind": "transport", "transport_action": "play"},
                },
                {
                    "control_id": "EXP1",
                    "assignment": {"kind": "expression_target", "param_id": "gain"},
                },
            ],
        },
    )

    assert result["status"] == "completed"
    assert result["configuration_transport"] == "manual_setup"
    assert "factory/default MIDI Commander layout" in result["manual_setup"]["lines"][1]
    snapshot = service.get_state_snapshot()
    assert snapshot["active_snapshot_mapping"]["snapshot_id"] == 21
    assert snapshot["last_activation_push"]["mapping_count"] == 10


@pytest.mark.asyncio
async def test_midi_commander_service_dispatches_live_snapshot_button_and_expression(monkeypatch) -> None:
    service = MidiCommanderSurfaceService(midi_hub=_FakeMidiHub(), publisher=_FakePublisher())
    parameter_updates: list[tuple[int, int, int, str, float]] = []
    transport_actions: list[str] = []

    live_snapshot_payload = {
        "id": 31,
        "name": "Lead",
        "extensions": {
            "midi_commander": {
                "mappings": [
                    {
                        "control_id": "1",
                        "message_type": "control_change",
                        "controller": 80,
                        "assignment": {"kind": "transport", "transport_action": "play"},
                    },
                    {
                        "control_id": "EXP1",
                        "control_type": "expression",
                        "message_type": "control_change",
                        "controller": 7,
                        "assignment": {
                            "kind": "expression_target",
                            "snapshot_chain_id": 7,
                            "target_plugin_position": 2,
                            "target_plugin_uri": "urn:test:eq",
                            "param_id": "gain",
                            "out_min": -12.0,
                            "out_max": 12.0,
                        },
                    },
                ],
            },
        },
    }

    class _FakeRuntimeStateService:
        def __init__(self, _session) -> None:
            pass

        async def get_live_snapshot_payload(self):
            return live_snapshot_payload

    class _FakeSnapshotService:
        def __init__(self, _session) -> None:
            pass

        async def update_plugin_parameter_by_position(self, snapshot_id, chain_id, plugin_position, parameter_key, value):
            parameter_updates.append((snapshot_id, chain_id, plugin_position, parameter_key, value))
            return {"id": snapshot_id}

    class _FakeTransportService:
        async def dispatch(self, action: str):
            transport_actions.append(action)
            return {"ok": True, "action": action}

    monkeypatch.setattr(midi_commander_surface_service_module, "get_session", lambda *args, **kwargs: _FakeSessionContext())
    monkeypatch.setattr(midi_commander_surface_service_module, "SnapshotRuntimeStateService", _FakeRuntimeStateService)
    monkeypatch.setattr(midi_commander_surface_service_module, "get_transport_service", lambda: _FakeTransportService())

    import app.services.snapshot as snapshot_service_module

    monkeypatch.setattr(snapshot_service_module, "SnapshotService", _FakeSnapshotService, raising=False)

    transport_result = await service.handle_inbound_message(
        bytes([0xB0, 80, 127]),
        source_port="MIDI Commander",
        metadata={"profile_id": "meloaudio_midi_commander"},
    )
    expression_result = await service.handle_inbound_message(
        bytes([0xB0, 7, 64]),
        source_port="MIDI Commander",
        metadata={"profile_id": "meloaudio_midi_commander"},
    )

    assert transport_result["dispatch"]["matched_count"] == 1
    assert transport_actions == ["play"]
    assert expression_result["dispatch"]["matched_count"] == 1
    assert parameter_updates[0][:4] == (31, 7, 2, "gain")
