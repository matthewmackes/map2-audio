import time

from app.services.midi_hub.gateway import MidiGateway, MidiGatewayManager
from app.services.midi_hub.hub import MidiHub
from app.services.midi_hub.ports import VirtualMidiPort


class IdentityResponderPort(VirtualMidiPort):
    def send(self, data: bytes) -> bool:
        ok = super().send(data)
        if ok and data == b"\xF0\x7E\x7F\x06\x01\xF7":
            self.inject(b"\xF0\x7E\x00\x06\x02\x01\x02\x03\xF7", source_port=self.port_id)
        return ok


def _wait_until(predicate, timeout_s: float = 1.0) -> bool:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(0.01)
    return False


def test_gateway_connects_and_reports_latency():
    hub = MidiHub(auto_discover_alsa=False)
    port = IdentityResponderPort(port_id="loop", name="Loop")
    hub.register_port(port)

    gateway = MidiGateway(
        gateway_id="gw1",
        in_port_id="loop",
        out_port_id="loop",
        hub=hub,
        reconnect_interval_s=0.05,
        health_interval_s=0.05,
        probe_timeout_s=0.2,
    )
    gateway.start()
    try:
        assert _wait_until(lambda: gateway.status().connected, timeout_s=0.6)
        assert _wait_until(lambda: gateway.status().responding, timeout_s=0.6)
        status = gateway.status()
        assert status.state == "connected"
        assert status.latency_ms is not None
    finally:
        gateway.stop()


def test_gateway_enters_reconnecting_when_port_removed():
    hub = MidiHub(auto_discover_alsa=False)
    port = VirtualMidiPort(port_id="a", name="A")
    hub.register_port(port)

    gateway = MidiGateway(
        gateway_id="gw2",
        in_port_id="a",
        out_port_id="a",
        hub=hub,
        reconnect_interval_s=0.05,
        health_interval_s=0.2,
        probe_timeout_s=0.05,
    )
    gateway.start()
    try:
        assert _wait_until(lambda: gateway.status().connected, timeout_s=0.5)
        hub.unregister_port("a")
        assert _wait_until(lambda: gateway.status().state == "reconnecting", timeout_s=0.8)
    finally:
        gateway.stop()


def test_gateway_manager_create_and_remove():
    hub = MidiHub(auto_discover_alsa=False)
    port = VirtualMidiPort(port_id="a", name="A")
    hub.register_port(port)
    manager = MidiGatewayManager(hub=hub)
    payload = manager.create_gateway(
        gateway_id="gw3",
        in_port_id="a",
        out_port_id="a",
        auto_start=False,
    )
    assert payload["gateway_id"] == "gw3"
    assert manager.get_gateway("gw3") is not None
    assert manager.remove_gateway("gw3") is True
    assert manager.remove_gateway("gw3") is False
