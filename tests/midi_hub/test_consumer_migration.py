import asyncio
import time
from pathlib import Path
from typing import Any, Dict, List

import pytest

from app.services.midi_hub.hub import MidiHub
from app.services.midi_hub.ports import MidiMessage, VirtualMidiPort
from app.services.midi_broadcast import MidiBroadcastService
from app.services.midi_hub.router import MidiRouter
from app.services.midi_engine import MIDIEngineService
from app.services.midi_learn import MIDILearnManager
from app.services.midi_service import TesiraMidiDispatcher
from app.services.platform_event.envelope import PlatformEvent
from app.services.platform_event.severity import Severity


@pytest.mark.asyncio
async def test_midi_engine_consumes_hub_messages(monkeypatch):
    hub = MidiHub(auto_discover_alsa=False)
    monkeypatch.setattr("app.services.midi_engine.get_midi_hub", lambda: hub)

    service = MIDIEngineService()
    async def _noop_persist(*_args, **_kwargs):
        return None
    monkeypatch.setattr(service, "_persist_mapping", _noop_persist)
    received: List[Dict[str, Any]] = []

    async def on_param(plugin_uri: str, param_index: int, value: float) -> None:
        received.append(
            {"plugin_uri": plugin_uri, "param_index": param_index, "value": value}
        )

    service.set_parameter_callback(on_param)
    await service.add_mapping(
        channel=1,
        message_type="cc",
        cc_number=7,
        target_plugin_uri="plugin://gain",
        target_param_index=0,
    )

    await service.start()
    hub.inject(
        MidiMessage(
            data=bytes([0xB0, 0x07, 0x40]),
            timestamp_ns=1,
            source_port="test:source",
            destination_port="consumer:juce_engine_in",
        )
    )
    await asyncio.sleep(0.05)
    await service.stop()
    hub.stop()

    assert received, "Expected MIDIEngineService callback from MidiHub-routed CC"
    assert received[0]["plugin_uri"] == "plugin://gain"
    assert received[0]["param_index"] == 0


@pytest.mark.asyncio
async def test_midi_learn_manager_subscribes_to_hub(monkeypatch):
    hub = MidiHub(auto_discover_alsa=False)
    monkeypatch.setattr("app.services.midi_learn.get_midi_hub", lambda: hub)

    manager = MIDILearnManager()
    manager.start_learn_mode("plugin://test:2")
    hub.start()
    hub.inject(
        MidiMessage(
            data=bytes([0xB0, 0x15, 0x50]),
            timestamp_ns=1,
            source_port="test:source",
            destination_port="consumer:midi_learn",
        )
    )
    await asyncio.sleep(0.05)

    learn_status = manager.get_learn_status()
    mappings = manager.export_mappings()
    manager.shutdown()
    hub.stop()

    assert learn_status["active"] is False
    assert len(mappings) == 1
    mapping = mappings[0]
    assert mapping["parameter_id"] == "plugin://test:2"
    assert mapping["cc_number"] == 0x15


@pytest.mark.asyncio
async def test_midi_broadcast_consumes_hub_traffic(monkeypatch):
    hub = MidiHub(auto_discover_alsa=False)
    monkeypatch.setattr("app.services.midi_broadcast.get_midi_hub", lambda: hub)

    published: List[Dict[str, Any]] = []

    async def fake_broadcast_json(message: Dict[str, Any], topic: str) -> None:
        published.append({"topic": topic, "message": message})

    monkeypatch.setattr("app.services.midi_broadcast.ws_manager.get_subscribers", lambda _topic: {"client-1"})
    monkeypatch.setattr("app.services.midi_broadcast.ws_manager.broadcast_json", fake_broadcast_json)

    service = MidiBroadcastService()
    await service.start()
    hub.start()
    hub.inject(
        MidiMessage(
            data=bytes([0x90, 60, 100]),
            timestamp_ns=1,
            source_port="source:controller",
            destination_port="consumer:midi_broadcast",
        )
    )
    await asyncio.sleep(0.08)
    await service.stop()
    hub.stop()

    assert published, "Expected MidiBroadcastService to publish hub traffic"
    assert published[0]["message"]["type"] == "midi_message"


@pytest.mark.asyncio
async def test_midi_broadcast_bridges_engine_monitor_messages_into_hub(monkeypatch, tmp_path: Path):
    hub = MidiHub(auto_discover_alsa=False)
    router = MidiRouter(hub=hub, persist_path=tmp_path / "routes.json")
    router.add_route(
        {
            "route_id": "engine_to_destination",
            "source_port": "consumer:juce_engine_out",
            "destination_ports": ["virtual:destination"],
            "enabled": True,
            "priority": 100,
        }
    )
    router.start()

    destination = VirtualMidiPort(
        port_id="virtual:destination",
        name="Virtual Destination",
        direction="duplex",
    )
    hub.register_port(destination, open_now=False)

    observed_inbound: List[MidiMessage] = []
    hub.subscribe("test_capture", lambda message: observed_inbound.append(message))
    monkeypatch.setattr("app.services.midi_broadcast.get_midi_hub", lambda: hub)

    published: List[Dict[str, Any]] = []

    async def fake_broadcast_json(message: Dict[str, Any], topic: str) -> None:
        published.append({"topic": topic, "message": message})

    monkeypatch.setattr("app.services.midi_broadcast.ws_manager.get_subscribers", lambda _topic: {"client-1"})
    monkeypatch.setattr("app.services.midi_broadcast.ws_manager.broadcast_json", fake_broadcast_json)

    service = MidiBroadcastService()
    await service.start()

    start_ns = time.perf_counter_ns()
    service._on_midi_message(
        {
            "type": "control_change",
            "channel": 0,
            "data1": 7,
            "data2": 64,
            "timestamp": 123,
        }
    )
    bridge_overhead_ms = (time.perf_counter_ns() - start_ns) / 1_000_000

    await asyncio.sleep(0.08)
    transmitted = destination.read_transmitted(max_messages=16)
    await service.stop()
    router.stop()
    hub.stop()

    assert bridge_overhead_ms < 1.0
    assert observed_inbound
    assert observed_inbound[0].source_port == "consumer:juce_engine_out"
    assert observed_inbound[0].data == bytes([0xB0, 0x07, 0x40])
    assert observed_inbound[0].metadata["bridge"] == "juce_engine_monitor"
    assert transmitted
    assert transmitted[0].data == bytes([0xB0, 0x07, 0x40])
    assert any(
        row["message"]["type"] == "midi_message"
        and row["message"]["data"]["source_port"] == "consumer:juce_engine_out"
        for row in published
    )


def test_midi_broadcast_queue_is_bounded_and_drops_oldest():
    service = MidiBroadcastService(queue_maxsize=2)

    service._queue_event("first", {"idx": 1})
    service._queue_event("second", {"idx": 2})
    service._queue_event("third", {"idx": 3})

    first_remaining = service._event_queue.get_nowait()
    second_remaining = service._event_queue.get_nowait()
    stats = service.get_stats()

    assert first_remaining["type"] == "second"
    assert second_remaining["type"] == "third"
    assert stats["dropped_events"] == 1
    assert stats["queue_maxsize"] == 2
    assert stats["queued_events"] == 0


@pytest.mark.asyncio
async def test_midi_broadcast_bridges_platform_event_topics(monkeypatch):
    hub = MidiHub(auto_discover_alsa=False)
    monkeypatch.setattr("app.services.midi_broadcast.get_midi_hub", lambda: hub)

    class _FakeSubscription:
        active = True

        def close(self):
            self.active = False

    subscriptions = []

    async def _subscribe_callback(callback, _event_filter):
        subscriptions.append(callback)
        return _FakeSubscription()

    monkeypatch.setattr(
        "app.services.midi_broadcast.get_platform_event_bus",
        lambda: type("FakePlatformEventBus", (), {"subscribe_callback": staticmethod(_subscribe_callback)})(),
    )

    published: List[Dict[str, Any]] = []

    async def fake_broadcast_json(message: Dict[str, Any], topic: str) -> None:
        published.append({"topic": topic, "message": message})

    monkeypatch.setattr("app.services.midi_broadcast.ws_manager.get_subscribers", lambda _topic: {"client-1"})
    monkeypatch.setattr("app.services.midi_broadcast.ws_manager.broadcast_json", fake_broadcast_json)

    service = MidiBroadcastService()
    await service.start()

    node_event = PlatformEvent(
        kind="midi.node.discovered",
        severity=Severity.INFO,
        source_node="node-a",
        source_service="test",
        title="Node discovered",
        message="Node discovered",
        context={"node_id": "node-b", "affected_nodes": ["node-b"]},
    )
    clock_event = PlatformEvent(
        kind="midi.clock.drift",
        severity=Severity.WARNING,
        source_node="node-b",
        source_service="test",
        title="Clock drift",
        message="Clock drift",
        context={"drift_ms": 1.25, "affected_nodes": ["node-b"]},
    )

    subscriptions[0](node_event)
    subscriptions[0](clock_event)

    await asyncio.sleep(0.08)
    await service.stop()

    topics = {(row["topic"], row["message"]["type"]) for row in published}
    assert ("midi_cluster_nodes", "midi_cluster_node_online") in topics
    assert ("midi_cluster_clock", "midi_cluster_clock_drift") in topics
    assert ("midi_cluster", "midi_cluster_clock_drift") in topics


@pytest.mark.asyncio
async def test_tesira_dispatcher_emits_hub_event(monkeypatch):
    hub = MidiHub(auto_discover_alsa=False)
    mirror_port = VirtualMidiPort(
        port_id="tesira:unit-1",
        name="Tesira Unit 1",
        direction="duplex",
    )
    hub.register_port(mirror_port, open_now=False)
    hub.start()

    monkeypatch.setattr("app.services.midi_hub.hub.get_midi_hub", lambda: hub)
    TesiraMidiDispatcher._emit_hub_message(
        {
            "device_id": "unit-1",
            "instance_tag": "LevelControl1",
            "action": "level",
            "channel": "1",
        },
        96.0,
    )
    await asyncio.sleep(0.05)
    transmitted = mirror_port.read_transmitted(max_messages=8)
    hub.stop()

    assert transmitted
    assert transmitted[0].data
