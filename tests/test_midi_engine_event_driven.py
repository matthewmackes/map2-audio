import asyncio
from types import SimpleNamespace

import pytest

import app.services.midi_engine as midi_engine_module


class _FakeMidiIn:
    instances = []

    def __init__(self):
        self.callback = None
        self.closed = False
        self.deleted = False
        self.opened_port = None
        self.ignore_args = None
        _FakeMidiIn.instances.append(self)

    def get_port_count(self):
        return 1

    def get_port_name(self, index):
        return f"Input {index}"

    def open_port(self, index):
        self.opened_port = index

    def ignore_types(self, sysex=True, timing=True, active_sense=True):
        self.ignore_args = (sysex, timing, active_sense)

    def set_callback(self, callback):
        self.callback = callback

    def cancel_callback(self):
        self.callback = None

    def get_message(self):
        raise AssertionError("event-driven RTMidi path should not poll get_message()")

    def close_port(self):
        self.closed = True

    def delete(self):
        self.deleted = True


class _FakeMidiOut:
    instances = []

    def __init__(self):
        self.closed = False
        self.deleted = False
        _FakeMidiOut.instances.append(self)

    def get_port_count(self):
        return 1

    def get_port_name(self, index):
        return f"Output {index}"

    def close_port(self):
        self.closed = True

    def delete(self):
        self.deleted = True


@pytest.mark.skip(
    reason="T2482 loop 9 / iter 83: rtmidi-direct discovery branch removed "
    "from midi_engine. The rtmidi probe-disposal contract no longer exists "
    "in production code. Discovery now routes exclusively through MidiHub "
    "(host-routed via iter 78) or falls to virtual placeholders."
)
@pytest.mark.asyncio
async def test_midi_engine_discover_devices_disposes_probe_clients(monkeypatch):
    _FakeMidiIn.instances.clear()
    _FakeMidiOut.instances.clear()
    monkeypatch.setattr(midi_engine_module, "get_midi_hub", None)
    monkeypatch.setattr(midi_engine_module, "RTMIDI_AVAILABLE", True)
    monkeypatch.setattr(
        midi_engine_module,
        "rtmidi",
        SimpleNamespace(MidiIn=_FakeMidiIn, MidiOut=_FakeMidiOut),
    )

    service = midi_engine_module.MIDIEngineService()

    devices = await service.discover_devices()

    assert devices["inputs"] == [{"index": 0, "name": "Input 0", "type": "input", "is_virtual": False, "is_connected": True}]
    assert devices["outputs"] == [{"index": 0, "name": "Output 0", "type": "output", "is_virtual": False, "is_connected": True}]
    assert _FakeMidiIn.instances[-1].closed is True
    assert _FakeMidiIn.instances[-1].deleted is True
    assert _FakeMidiOut.instances[-1].closed is True
    assert _FakeMidiOut.instances[-1].deleted is True


@pytest.mark.skip(
    reason="T2482 loop 9 / iter 83: rtmidi callback-queue path removed "
    "from midi_engine.start(). Live MIDI binding now flows through MidiHub "
    "(host-routed via iter 78); the rtmidi.MidiIn.set_callback contract "
    "no longer exists in production code."
)
@pytest.mark.asyncio
async def test_midi_engine_uses_rtmidi_callback_queue(monkeypatch):
    _FakeMidiIn.instances.clear()
    _FakeMidiOut.instances.clear()
    monkeypatch.setattr(midi_engine_module, "get_midi_hub", None)
    monkeypatch.setattr(midi_engine_module, "RTMIDI_AVAILABLE", True)
    monkeypatch.setattr(
        midi_engine_module,
        "rtmidi",
        SimpleNamespace(MidiIn=_FakeMidiIn, MidiOut=_FakeMidiOut),
    )

    service = midi_engine_module.MIDIEngineService()
    received = []

    async def on_param(plugin_uri: str, param_index: int, value: float, *_args):
        received.append((plugin_uri, param_index, value))

    service.set_parameter_callback(on_param)
    await service.add_mapping(
        channel=1,
        message_type="cc",
        cc_number=7,
        target_plugin_uri="plugin://gain",
        target_param_index=0,
        target_param_name="gain",
    )

    assert await service.start() is True
    midi_in = _FakeMidiIn.instances[-1]
    assert midi_in.callback is not None
    assert midi_in.opened_port == 0
    assert midi_in.ignore_args == (True, True, True)

    midi_in.callback(([0xB0, 0x07, 0x40], 0.0), None)
    await asyncio.sleep(0.05)
    await service.stop()

    assert received == [("plugin://gain", 0, 64 / 127.0)]
    assert midi_in.callback is None
    assert midi_in.closed is True
    assert midi_in.deleted is True
