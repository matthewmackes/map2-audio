import time

from app.services.midi_hub.hub import MidiHub
from app.services.midi_hub.ports import VirtualMidiPort


def test_hub_register_start_send_dispatch_and_stop():
    hub = MidiHub(auto_discover_alsa=False, poll_interval_s=0.001, hotplug_interval_s=0.25)

    source = VirtualMidiPort(port_id="src", name="Source")
    dest = VirtualMidiPort(port_id="dst", name="Dest")

    hub.register_port(source)
    hub.register_port(dest)

    seen = []

    def _on_msg(msg):
        seen.append(msg)

    hub.subscribe("test", _on_msg)
    hub.start()

    # Inject inbound message and verify subscriber receives it.
    assert source.inject(b"\x90\x3c\x64", source_port="external")

    # Queue outbound send and verify destination transmit queue captured it.
    assert hub.send(source_port="src", destination_port="dst", data=b"\x80\x3c\x00")

    deadline = time.time() + 0.5
    while time.time() < deadline and not seen:
        time.sleep(0.01)

    hub.stop()

    assert seen, "hub subscriber did not receive injected MIDI message"
    tx = dest.read_transmitted(max_messages=16)
    assert any(m.data == b"\x80\x3c\x00" for m in tx)


def test_hub_stats_and_unregister():
    hub = MidiHub(auto_discover_alsa=False)
    port = VirtualMidiPort(port_id="v1", name="V1")
    hub.register_port(port, open_now=False)
    stats = hub.stats()
    assert stats.port_count == 1
    assert hub.unregister_port("v1") is True
    assert hub.unregister_port("v1") is False
