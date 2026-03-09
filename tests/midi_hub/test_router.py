import time
from pathlib import Path

from app.services.midi_hub.hub import MidiHub
from app.services.midi_hub.ports import VirtualMidiPort
from app.services.midi_hub.router import MidiRouter


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
