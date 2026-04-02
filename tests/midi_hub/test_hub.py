import time

from app.services.midi_hub.hub import MidiHub, RT_SAFE_MIDI_HUB_POLL_INTERVAL_FLOOR_S
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

    transmitted = []
    deadline = time.time() + 0.5
    while time.time() < deadline:
        transmitted = dest.read_transmitted(max_messages=16)
        if seen and any(m.data == b"\x80\x3c\x00" for m in transmitted):
            break
        time.sleep(0.01)

    hub.stop()

    assert seen, "hub subscriber did not receive injected MIDI message"
    assert any(m.data == b"\x80\x3c\x00" for m in transmitted)


def test_hub_stats_and_unregister():
    hub = MidiHub(auto_discover_alsa=False)
    port = VirtualMidiPort(port_id="v1", name="V1")
    hub.register_port(port, open_now=False)
    stats = hub.stats()
    assert stats.port_count == 1
    assert hub.unregister_port("v1") is True
    assert hub.unregister_port("v1") is False


def test_hub_enforces_rt_safe_poll_interval_floor():
    hub = MidiHub(auto_discover_alsa=False, poll_interval_s=0.0005)
    assert hub._poll_interval_s == RT_SAFE_MIDI_HUB_POLL_INTERVAL_FLOOR_S
