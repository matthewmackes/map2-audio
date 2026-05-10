"""T2500-MV-B2 + B-RAW-TAP — visualization producer bridge tests."""

from __future__ import annotations

from dataclasses import dataclass

from app.services.engine_command_dispatcher import (
    EngineCommandContext,
    EngineCommandDispatcher,
)
from app.services.midi_visualization_buffer import MidiTrafficBuffer
from app.services.midi_visualization_bridge import MidiVisualizationProducerBridge


# ---------------------------------------------------------------------
# Dispatched layer
# ---------------------------------------------------------------------


def test_dispatcher_observer_writes_dispatched_event(monkeypatch) -> None:
    buf = MidiTrafficBuffer(clock_filter_default=False, time_source=lambda: 0.0)
    dispatcher = EngineCommandDispatcher()

    # Stub the singleton accessor used by the bridge's dispatcher install.
    class _StubBridge:
        def __init__(self, dispatcher: EngineCommandDispatcher) -> None:
            self.dispatcher = dispatcher

    stub = _StubBridge(dispatcher)
    monkeypatch.setattr(
        "app.services.engine_command_bridge.get_engine_command_bridge",
        lambda: stub,
    )
    # Skip the hub install path for this test.
    monkeypatch.setattr(
        MidiVisualizationProducerBridge,
        "_install_hub_subscription",
        lambda self: None,
    )

    bridge = MidiVisualizationProducerBridge(buffer=buf)
    bridge.install()

    dispatcher.register("audio.snapshot.recall", lambda c: None)
    dispatcher.dispatch(
        {
            "type": "engine_command",
            "msg_id": "m1",
            "schema_version": 1,
            "controller_key": "alsa:32:0",
            "target": "audio.snapshot.recall",
            "action": "set",
            "value": 5.0,
        }
    )

    out = buf.replay(include_noise=True)
    assert len(out) == 1
    assert out[0]["kind"] == "dispatched"
    assert out[0]["source_node_id"] == "mapping:alsa:32:0"
    assert out[0]["target_node_id"] == "target:audio.snapshot.recall"
    assert out[0]["target"] == "audio.snapshot.recall"
    assert out[0]["controller_key"] == "alsa:32:0"
    assert out[0]["value"] == 5.0


def test_dispatcher_observer_fires_on_handler_error(monkeypatch) -> None:
    buf = MidiTrafficBuffer(clock_filter_default=False, time_source=lambda: 0.0)
    dispatcher = EngineCommandDispatcher()

    class _StubBridge:
        def __init__(self, dispatcher: EngineCommandDispatcher) -> None:
            self.dispatcher = dispatcher

    monkeypatch.setattr(
        "app.services.engine_command_bridge.get_engine_command_bridge",
        lambda: _StubBridge(dispatcher),
    )
    monkeypatch.setattr(
        MidiVisualizationProducerBridge,
        "_install_hub_subscription",
        lambda self: None,
    )

    bridge = MidiVisualizationProducerBridge(buffer=buf)
    bridge.install()

    def _boom(ctx: EngineCommandContext) -> None:
        raise RuntimeError("kaboom")

    dispatcher.register("audio.snapshot.recall", _boom)
    dispatcher.dispatch(
        {
            "type": "engine_command",
            "msg_id": "m1",
            "schema_version": 1,
            "controller_key": "k",
            "target": "audio.snapshot.recall",
            "action": "set",
        }
    )
    out = buf.replay(include_noise=True)
    # Errored dispatch still observed — operator can see the attempt.
    assert len(out) == 1


# ---------------------------------------------------------------------
# Raw layer
# ---------------------------------------------------------------------


@dataclass
class _FakeMidiMessage:
    source_port: str
    destination_port: str
    data: bytes
    timestamp_ns: int
    metadata: dict | None = None


def test_raw_hub_subscriber_writes_raw_event_when_mapping_resolves(monkeypatch) -> None:
    buf = MidiTrafficBuffer(clock_filter_default=False, time_source=lambda: 0.0)

    # Stub get_engine_command_bridge → None so the dispatcher install short-circuits.
    monkeypatch.setattr(
        "app.services.engine_command_bridge.get_engine_command_bridge",
        lambda: None,
    )

    # Stub MidiHub: capture the subscriber callback.
    captured: dict[str, object] = {}

    class _StubHub:
        def subscribe(self, sid, cb):
            captured["sid"] = sid
            captured["cb"] = cb

        def unsubscribe(self, sid):
            captured.pop("sid", None)

    monkeypatch.setattr(
        "app.services.midi_hub.hub.get_midi_hub", lambda: _StubHub()
    )

    # Stub controller service → mapping registry: pretend port has an active mapping.
    class _Active:
        controller_key = "alsa:32:0"

    class _Mappings:
        def all(self):
            return (_Active(),)

    class _ControllerService:
        _mappings = _Mappings()

    monkeypatch.setattr(
        "app.services.controllers.get_controller_service",
        lambda: _ControllerService(),
    )

    bridge = MidiVisualizationProducerBridge(buffer=buf)
    bridge.install()

    # Drive the captured subscriber with a Note On from the mapped port.
    cb = captured["cb"]
    cb(
        _FakeMidiMessage(
            source_port="alsa:32:0",
            destination_port="",
            data=bytes([0x90, 0x3C, 0x40]),
            timestamp_ns=1,
        )
    )
    out = buf.replay(include_noise=True)
    assert len(out) == 1
    assert out[0]["kind"] == "raw"
    assert out[0]["source_node_id"] == "device:alsa:32:0"
    assert out[0]["target_node_id"] == "mapping:alsa:32:0"
    assert out[0]["raw_hex"] == "903c40"
    assert out[0]["status_byte"] == 0x90


def test_raw_hub_subscriber_drops_unmapped_ports(monkeypatch) -> None:
    buf = MidiTrafficBuffer(clock_filter_default=False, time_source=lambda: 0.0)

    monkeypatch.setattr(
        "app.services.engine_command_bridge.get_engine_command_bridge",
        lambda: None,
    )

    captured: dict[str, object] = {}

    class _StubHub:
        def subscribe(self, sid, cb):
            captured["cb"] = cb

        def unsubscribe(self, sid):
            pass

    monkeypatch.setattr(
        "app.services.midi_hub.hub.get_midi_hub", lambda: _StubHub()
    )

    class _ControllerService:
        class _Mappings:
            def all(self):
                return ()

        _mappings = _Mappings()

    monkeypatch.setattr(
        "app.services.controllers.get_controller_service",
        lambda: _ControllerService(),
    )

    bridge = MidiVisualizationProducerBridge(buffer=buf)
    bridge.install()

    cb = captured["cb"]
    cb(
        _FakeMidiMessage(
            source_port="alsa:99:0",
            destination_port="",
            data=bytes([0x90, 0x3C, 0x40]),
            timestamp_ns=1,
        )
    )
    # No mapping → no edge → buffer stays empty.
    assert buf.event_count() == 0


def test_raw_hub_subscriber_skips_router_dispatch_round_trip(monkeypatch) -> None:
    buf = MidiTrafficBuffer(clock_filter_default=False, time_source=lambda: 0.0)

    monkeypatch.setattr(
        "app.services.engine_command_bridge.get_engine_command_bridge",
        lambda: None,
    )

    captured: dict[str, object] = {}

    class _StubHub:
        def subscribe(self, sid, cb):
            captured["cb"] = cb

        def unsubscribe(self, sid):
            pass

    monkeypatch.setattr(
        "app.services.midi_hub.hub.get_midi_hub", lambda: _StubHub()
    )

    bridge = MidiVisualizationProducerBridge(buffer=buf)
    bridge.install()

    cb = captured["cb"]
    cb(
        _FakeMidiMessage(
            source_port="alsa:32:0",
            destination_port="",
            data=bytes([0x90, 0x3C, 0x40]),
            timestamp_ns=1,
            metadata={"router_dispatch": True},
        )
    )
    assert buf.event_count() == 0


# ---------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------


def test_install_is_idempotent(monkeypatch) -> None:
    buf = MidiTrafficBuffer(clock_filter_default=False, time_source=lambda: 0.0)
    monkeypatch.setattr(
        "app.services.engine_command_bridge.get_engine_command_bridge",
        lambda: None,
    )
    install_count = [0]

    class _StubHub:
        def subscribe(self, sid, cb):
            install_count[0] += 1

        def unsubscribe(self, sid):
            pass

    monkeypatch.setattr(
        "app.services.midi_hub.hub.get_midi_hub", lambda: _StubHub()
    )

    bridge = MidiVisualizationProducerBridge(buffer=buf)
    bridge.install()
    bridge.install()  # second call must be a no-op
    assert install_count[0] == 1
