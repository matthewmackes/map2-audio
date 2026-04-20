from __future__ import annotations

from types import SimpleNamespace

import pytest

import app.services.launch_control_surface.service as launch_control_surface_service_module
from app.services.launch_control_surface.service import LaunchControlSurfaceService


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
        self.ports = [
            _FakePort(port_id="lc-in", name="Launch Control XL", direction="input"),
            _FakePort(port_id="lc-out", name="Launch Control XL", direction="duplex"),
        ]

    def subscribe(self, subscriber_id: str, callback) -> None:
        self.subscribers[subscriber_id] = callback

    def unsubscribe(self, subscriber_id: str) -> bool:
        self.subscribers.pop(subscriber_id, None)
        return True

    def list_ports(self):
        return list(self.ports)

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


class _FakeSessionContext:
    async def __aenter__(self):
        return object()

    async def __aexit__(self, exc_type, exc, tb):
        return False


@pytest.mark.asyncio
async def test_launch_control_service_auto_pushes_map2_template_on_detected_output() -> None:
    midi_hub = _FakeMidiHub()
    publisher = _FakePublisher()
    service = LaunchControlSurfaceService(midi_hub=midi_hub, publisher=publisher)

    result = await service.refresh_devices()

    assert result["output_port_count"] == 1
    assert service.get_state_snapshot()["push_count"] == 1
    assert midi_hub.sent[0]["destination_port"] == "lc-out"
    assert midi_hub.sent[0]["metadata"]["message_type"] == "template_select"
    assert any(topics[0] == "launch_control_surface:template_push" for topics, _message in publisher.messages)


@pytest.mark.asyncio
async def test_launch_control_service_tracks_inbound_template_change() -> None:
    service = LaunchControlSurfaceService(midi_hub=_FakeMidiHub(), publisher=_FakePublisher())

    result = await service.handle_inbound_message(
        bytes([0xF0, 0x00, 0x20, 0x29, 0x02, 0x11, 0x77, 0x05, 0xF7]),
        source_port="Launch Control XL",
        metadata={"profile_id": "novation_launch_control"},
    )

    assert result["status"] == "completed"
    snapshot = service.get_state_snapshot()
    assert snapshot["template_state_by_port"]["Launch Control XL"]["template_index"] == 5
    assert snapshot["template_state_by_port"]["Launch Control XL"]["variant"] == "launch_control_xl"


@pytest.mark.asyncio
async def test_launch_control_service_pushes_snapshot_led_feedback_and_records_active_mapping() -> None:
    midi_hub = _FakeMidiHub()
    publisher = _FakePublisher()
    service = LaunchControlSurfaceService(midi_hub=midi_hub, publisher=publisher)

    result = await service.push_snapshot_activation(
        snapshot_id=17,
        snapshot_name="Lead",
        extension_payload={
            "variant": "launch_control_xl",
            "mappings": [
                {
                    "control_id": "button-1",
                    "control_type": "button",
                    "note": 73,
                    "channel": 1,
                    "effect_type": "delay",
                    "assignment": {"kind": "parameter", "param_id": "mix"},
                },
                {
                    "control_id": "button-2",
                    "control_type": "button",
                    "note": 74,
                    "channel": 1,
                    "led_override": {"device_color": "green_full"},
                    "assignment": {"kind": "transport", "action": "play"},
                },
            ],
        },
    )

    assert result["status"] == "completed"
    assert result["mapping_count"] == 2
    assert result["led_push_count"] == 2
    assert result["destination_ports"] == ["lc-out"]
    assert midi_hub.sent[0]["metadata"]["message_type"] == "template_select"
    assert midi_hub.sent[1]["metadata"]["message_type"] == "snapshot_led_feedback"
    assert midi_hub.sent[1]["data"] == bytes([0x90, 73, 0x3E])
    assert midi_hub.sent[2]["data"] == bytes([0x90, 74, 0x3C])
    snapshot = service.get_state_snapshot()
    assert snapshot["active_snapshot_mapping"]["snapshot_id"] == 17
    assert snapshot["active_snapshot_mapping"]["mapping_count"] == 2
    assert snapshot["last_activation_push"]["led_push_count"] == 2
    assert any(topics[0] == "launch_control_surface:snapshot_activation" for topics, _message in publisher.messages)


@pytest.mark.asyncio
async def test_launch_control_service_dispatches_live_snapshot_mappings(monkeypatch) -> None:
    midi_hub = _FakeMidiHub()
    service = LaunchControlSurfaceService(midi_hub=midi_hub, publisher=_FakePublisher())
    parameter_updates: list[tuple[int, int, int, str, float]] = []
    focused_blocks: list[str] = []
    toggled_blocks: list[str] = []
    transport_actions: list[str] = []

    live_snapshot_payload = {
        "id": 31,
        "name": "Lead",
        "extensions": {
            "launch_control": {
                "mappings": [
                    {
                        "control_id": "knob-1",
                        "control_type": "knob",
                        "controller": 21,
                        "channel": 1,
                        "assignment": {
                            "kind": "parameter",
                            "snapshot_chain_id": 7,
                            "target_plugin_position": 2,
                            "target_plugin_uri": "urn:test:eq",
                            "param_id": "gain",
                            "out_min": -12.0,
                            "out_max": 12.0,
                        },
                    },
                    {
                        "control_id": "button-1",
                        "control_type": "button",
                        "note": 73,
                        "channel": 1,
                        "effect_type": "delay",
                        "assignment": {
                            "kind": "toggle_plugin",
                            "block_id": "lead:0",
                            "target_plugin_uri": "urn:test:eq",
                            "target_plugin_position": 2,
                        },
                    },
                    {
                        "control_id": "button-2",
                        "control_type": "button",
                        "note": 74,
                        "channel": 1,
                        "assignment": {
                            "kind": "focus_block",
                            "block_id": "lead:0",
                            "target_plugin_uri": "urn:test:eq",
                            "target_plugin_position": 2,
                        },
                    },
                    {
                        "control_id": "button-3",
                        "control_type": "button",
                        "note": 75,
                        "channel": 1,
                        "assignment": {
                            "kind": "transport",
                            "transport_action": "play",
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
            return {"id": snapshot_id, "snapshot_revision": "rev-1"}

    class _FakeMaschineService:
        async def get_audio_grid_projection(self, _session):
            return {
                "selected_block_id": "lead:0",
                "blocks": [
                    {
                        "block_id": "lead:0",
                        "plugin_uri": "urn:test:eq",
                        "plugin_position": 2,
                        "bypassed": False,
                    }
                ],
            }

        async def select_audio_grid_block(self, _session, block_id: str):
            focused_blocks.append(block_id)
            return {"selected_block_id": block_id}

        async def toggle_audio_grid_block_bypass(self, _session, block_id: str):
            toggled_blocks.append(block_id)
            return {"blocks": [{"block_id": block_id, "bypassed": True}]}

    class _FakeEngine:
        async def set_parameter(self, plugin_uri, param_id, value, *, plugin_position=None):
            return plugin_uri == "urn:test:eq" and param_id == "gain" and plugin_position == 2 and value > 0

    class _FakeTransportService:
        async def dispatch(self, action: str):
            transport_actions.append(action)
            return {"ok": True, "action": action, "owner": "midi_recorder", "transport": {}, "owner_state": {"last_action": action}}

        def get_state(self):
            return {
                "active_owner": "midi_recorder",
                "owners": [{"active": True, "state": {"last_action": "play"}}],
            }

    monkeypatch.setattr(launch_control_surface_service_module, "get_session", lambda: _FakeSessionContext())
    monkeypatch.setattr(launch_control_surface_service_module, "SnapshotRuntimeStateService", _FakeRuntimeStateService)
    monkeypatch.setattr("app.services.snapshot.SnapshotService", _FakeSnapshotService)
    monkeypatch.setattr("app.services.juce_engine_service.get_audio_engine", lambda: _FakeEngine())
    monkeypatch.setattr("app.services.maschine_service.get_maschine_service", lambda: _FakeMaschineService())
    monkeypatch.setattr(launch_control_surface_service_module, "get_transport_service", lambda: _FakeTransportService())

    cc_result = await service.handle_inbound_message(
        bytes([0xB0, 21, 127]),
        source_port="Launch Control XL",
        metadata={"profile_id": "novation_launch_control"},
    )
    toggle_result = await service.handle_inbound_message(
        bytes([0x90, 73, 127]),
        source_port="Launch Control XL",
        metadata={"profile_id": "novation_launch_control"},
    )
    focus_result = await service.handle_inbound_message(
        bytes([0x90, 74, 127]),
        source_port="Launch Control XL",
        metadata={"profile_id": "novation_launch_control"},
    )
    transport_result = await service.handle_inbound_message(
        bytes([0x90, 75, 127]),
        source_port="Launch Control XL",
        metadata={"profile_id": "novation_launch_control"},
    )

    assert cc_result["dispatch"]["matched_count"] == 1
    assert parameter_updates[0][:4] == (31, 7, 2, "gain")
    assert parameter_updates[0][4] == pytest.approx(12.0)
    assert toggle_result["dispatch"]["results"][0]["action_type"] == "toggle_plugin"
    assert toggled_blocks == ["lead:0"]
    assert focus_result["dispatch"]["results"][0]["selected_block_id"] == "lead:0"
    assert focused_blocks == ["lead:0"]
    assert transport_result["dispatch"]["results"][0]["transport_action"] == "play"
    assert transport_actions == ["play"]
    assert any(message["metadata"].get("message_type") == "live_feedback_refresh" for message in midi_hub.sent)
