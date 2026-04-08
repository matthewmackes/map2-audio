from __future__ import annotations

from types import SimpleNamespace

import app.services.midi_hub.ports as ports_module


class _FakeMidiClient:
    def __init__(self, names: list[str]) -> None:
        self._names = list(names)
        self.closed = False
        self.deleted = False

    def get_port_count(self) -> int:
        return len(self._names)

    def get_port_name(self, index: int) -> str:
        return self._names[index]

    def close_port(self) -> None:
        self.closed = True

    def delete(self) -> None:
        self.deleted = True


def test_discover_alsa_ports_filters_internal_clients_and_disposes_probes(monkeypatch) -> None:
    midi_in = _FakeMidiClient(
        [
            "RtMidiIn Client:RtMidi input 129:0",
            "MAP2 Audio Engine:MIDI In 131:0",
            "Midi Through:Midi Through Port-0 14:0",
            "M-Audio MIDISPORT 4x4 Port A 24:0",
            "MAP2:Maschine-MK1 200:0",
        ]
    )
    midi_out = _FakeMidiClient(
        [
            "RtMidiOut Client:RtMidi output 130:0",
            "JUCE:announcements 128:0",
            "PipeWire-System:input 142:0",
            "M-Audio MIDISPORT 4x4 Port A 24:0",
            "MAP2:Maschine-MK1 200:0",
        ]
    )
    monkeypatch.setattr(
        ports_module,
        "rtmidi",
        SimpleNamespace(MidiIn=lambda: midi_in, MidiOut=lambda: midi_out),
    )

    discovered = ports_module.discover_alsa_ports()

    assert discovered == {
        "inputs": ["M-Audio MIDISPORT 4x4 Port A 24:0", "MAP2:Maschine-MK1 200:0"],
        "outputs": ["M-Audio MIDISPORT 4x4 Port A 24:0", "MAP2:Maschine-MK1 200:0"],
    }
    assert midi_in.closed is True
    assert midi_in.deleted is True
    assert midi_out.closed is True
    assert midi_out.deleted is True
