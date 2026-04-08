import time
from pathlib import Path

from app.services.midi_hub.hub import MidiHub
from app.services.midi_hub.ports import VirtualMidiPort
from app.services.midi_hub.router import MidiRouter


class _FakePublisher:
    def __init__(self) -> None:
        self.messages: list[tuple[tuple[str, ...], dict[str, object]]] = []
        self.threadsafe_messages: list[tuple[tuple[str, ...], dict[str, object]]] = []

    async def publish_message(self, message: dict[str, object], *, topics) -> None:
        self.messages.append((tuple(topics), dict(message)))

    def publish_message_threadsafe(self, message: dict[str, object], *, topics) -> None:
        self.threadsafe_messages.append((tuple(topics), dict(message)))


def _wait_until(predicate, timeout_s: float = 0.8) -> bool:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(0.01)
    return False


def test_router_routes_note_messages_between_ports(tmp_path):
    hub = MidiHub(auto_discover_alsa=False, poll_interval_s=0.001)
    src = VirtualMidiPort(port_id="src", name="Source")
    dst = VirtualMidiPort(port_id="dst", name="Dest")
    hub.register_port(src)
    hub.register_port(dst)

    router = MidiRouter(hub=hub, persist_path=Path(tmp_path / "routes.json"))
    router.start()
    hub.start()
    try:
        route = router.add_route(
            {
                "source_port": "src",
                "destination_ports": ["dst"],
                "filter": {"message_types": ["note_on"], "channels": [1]},
            }
        )
        assert route["source_port"] == "src"

        assert src.inject(b"\x90\x3C\x64", source_port="src")
        assert _wait_until(lambda: len(dst.read_transmitted(max_messages=32)) > 0)
    finally:
        hub.stop()
        router.stop()


def test_router_transform_chain_cc_remap_and_scale(tmp_path):
    hub = MidiHub(auto_discover_alsa=False, poll_interval_s=0.001)
    src = VirtualMidiPort(port_id="src", name="Source")
    dst = VirtualMidiPort(port_id="dst", name="Dest")
    hub.register_port(src)
    hub.register_port(dst)

    router = MidiRouter(hub=hub, persist_path=Path(tmp_path / "routes.json"))
    router.start()
    hub.start()
    try:
        router.add_route(
            {
                "source_port": "src",
                "destination_ports": ["dst"],
                "filter": {"message_types": ["control_change"]},
                "transform_chain": [
                    {"type": "cc_remap", "mapping": {"7": 11}},
                    {"type": "value_scale", "scale": 0.5},
                ],
            }
        )
        assert src.inject(b"\xB0\x07\x64", source_port="src")
        captured = []
        assert _wait_until(
            lambda: bool((captured.extend(dst.read_transmitted(max_messages=32)) or captured))
        )
        assert captured[0].data == b"\xB0\x0B\x32"
    finally:
        hub.stop()
        router.stop()


def test_router_persistence_round_trip(tmp_path):
    path = Path(tmp_path / "routes.json")
    hub = MidiHub(auto_discover_alsa=False)
    router = MidiRouter(hub=hub, persist_path=path)
    route = router.add_route(
        {
            "source_port": "s",
            "destination_ports": ["d1", "d2"],
            "priority": 250,
            "route_type": "split",
        }
    )
    route_id = route["route_id"]
    assert path.exists()

    router_reloaded = MidiRouter(hub=hub, persist_path=path)
    loaded = router_reloaded.get_route(route_id)
    assert loaded is not None
    assert loaded["destination_ports"] == ["d1", "d2"]


def test_router_delayed_dispatch_uses_bounded_worker_instead_of_thread_per_message(tmp_path, monkeypatch):
    hub = MidiHub(auto_discover_alsa=False, poll_interval_s=0.001)
    src = VirtualMidiPort(port_id="src", name="Source")
    dst = VirtualMidiPort(port_id="dst", name="Dest")
    hub.register_port(src)
    hub.register_port(dst)

    def _forbid_timer(*args, **kwargs):
        raise AssertionError("threading.Timer should not be used for delayed routing")

    monkeypatch.setattr("app.services.midi_hub.router.threading.Timer", _forbid_timer)

    router = MidiRouter(hub=hub, persist_path=Path(tmp_path / "routes.json"))
    router.start()
    hub.start()
    try:
        router.add_route(
            {
                "source_port": "src",
                "destination_ports": ["dst"],
                "filter": {"message_types": ["note_on"]},
                "transform_chain": [{"type": "message_delay", "delay_ms": 20}],
            }
        )
        assert src.inject(b"\x90\x3C\x64", source_port="src")

        captured = []
        assert _wait_until(lambda: bool((captured.extend(dst.read_transmitted(max_messages=32)) or captured)), timeout_s=1.0)
        assert captured[0].data == b"\x90\x3C\x64"
    finally:
        hub.stop()
        router.stop()


def test_router_uses_injected_realtime_publisher_for_route_events(tmp_path):
    hub = MidiHub(auto_discover_alsa=False)
    publisher = _FakePublisher()
    router = MidiRouter(
        hub=hub,
        persist_path=Path(tmp_path / "routes.json"),
        publisher=publisher,
    )

    route = router.add_route(
        {
            "route_id": "route-1",
            "source_port": "src",
            "destination_ports": ["dst"],
        }
    )

    assert route["route_id"] == "route-1"
    published = publisher.threadsafe_messages or publisher.messages
    assert published
    topics, message = published[0]
    assert topics == ("midi:routes",)
    assert message["type"] == "midi:route_changed"
    assert message["data"]["action"] == "added"
    assert message["data"]["route"]["route_id"] == "route-1"


def test_router_delayed_overflow_evicts_least_urgent_event(tmp_path):
    hub = MidiHub(auto_discover_alsa=False)
    router = MidiRouter(hub=hub, persist_path=Path(tmp_path / "routes.json"))
    router._running = True
    router._max_pending_delayed_events = 1

    router._schedule_delayed_event(
        source_port="src",
        destination_port="dst",
        event_data=b"first",
        route_id="route-fast",
        delay_ms=5,
        metadata={},
    )
    router._schedule_delayed_event(
        source_port="src",
        destination_port="dst",
        event_data=b"second",
        route_id="route-slow",
        delay_ms=50,
        metadata={},
    )

    assert len(router._delay_queue) == 1
    _, _, payload = router._delay_queue[0]
    assert payload["route_id"] == "route-fast"


def test_router_prefers_threadsafe_publisher_from_worker_threads(tmp_path):
    hub = MidiHub(auto_discover_alsa=False)
    publisher = _FakePublisher()
    router = MidiRouter(
        hub=hub,
        persist_path=Path(tmp_path / "routes.json"),
        publisher=publisher,
    )

    router._emit_websocket_message("midi:traffic", {"route_id": "route-1"}, topic="midi:traffic")

    assert publisher.threadsafe_messages == [
        (
            ("midi:traffic",),
            {"type": "midi:traffic", "data": {"route_id": "route-1"}},
        )
    ]
    assert publisher.messages == []
