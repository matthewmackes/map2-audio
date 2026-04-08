import time
import threading
import logging

from app.services.midi_hub import hub as hub_module
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


def test_hub_sets_running_before_worker_threads_begin(monkeypatch):
    hub = MidiHub(auto_discover_alsa=False, poll_interval_s=0.001, hotplug_interval_s=0.25)
    observations: list[tuple[str, bool]] = []
    entered = threading.Event()

    def _run_loop():
        observations.append(("io", hub.running))
        entered.set()
        hub._stop_evt.wait(timeout=0.2)

    def _run_hotplug_loop():
        observations.append(("hotplug", hub.running))
        entered.set()
        hub._stop_evt.wait(timeout=0.2)

    monkeypatch.setattr(hub, "_run_loop", _run_loop)
    monkeypatch.setattr(hub, "_run_hotplug_loop", _run_hotplug_loop)

    hub.start()
    entered.wait(timeout=0.5)
    hub.stop()

    assert observations
    assert all(flag is True for _, flag in observations)


def test_hub_logs_warning_when_subscriber_raises(caplog):
    hub = MidiHub(auto_discover_alsa=False, poll_interval_s=0.001, hotplug_interval_s=0.25)

    source = VirtualMidiPort(port_id="src", name="Source")
    hub.register_port(source)

    seen = []

    def _bad(_msg):
        raise RuntimeError("boom")

    def _good(msg):
        seen.append(msg)

    hub.subscribe("bad", _bad)
    hub.subscribe("good", _good)

    with caplog.at_level(logging.WARNING):
        hub.start()
        try:
            assert source.inject(b"\x90\x3c\x64", source_port="external")
            deadline = time.time() + 0.5
            while time.time() < deadline and not seen:
                time.sleep(0.01)
        finally:
            hub.stop()

    assert seen
    assert any("MidiHub subscriber callback failed: boom" in record.getMessage() for record in caplog.records)


def test_get_midi_hub_singleton_is_guarded():
    original = hub_module._midi_hub_singleton
    try:
        hub_module._midi_hub_singleton = None
        seen = []

        def _worker():
            seen.append(id(hub_module.get_midi_hub()))

        threads = [threading.Thread(target=_worker) for _ in range(8)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=0.5)

        assert len(set(seen)) == 1
    finally:
        hub_module._midi_hub_singleton = original
