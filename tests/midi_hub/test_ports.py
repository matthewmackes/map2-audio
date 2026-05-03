"""Post iter-78 contract tests for midi_hub.ports.discover_alsa_ports.

The pre-iter-78 ``test_discover_alsa_ports_filters_internal_clients_and_disposes_probes``
test exercised the rtmidi fallback that ran when the controller-host daemon was
down. iter-78 hard-stripped that fallback (see app/services/midi_hub/ports.py
discover_alsa_ports() docstring), so the rtmidi probe path no longer exists and
the ``rtmidi`` attribute on the ``ports`` module was removed. The old test was
asserting behavior that no longer ships; it has been replaced by the strict-mode
contract tests below.

Live integration coverage of the controller-host happy path lives in the
end-to-end suite; this file just guards the unit-level error envelope and the
post-strip happy-path filtering logic.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List

import pytest

import app.services.midi_hub.ports as ports_module
from app.services.midi_host_client import MidiHostClientError


def test_discover_alsa_ports_raises_when_controller_host_unreachable(monkeypatch) -> None:
    """When the controller-host daemon is down, discover_alsa_ports must raise.

    Pre-iter-78 the function silently fell back to a local rtmidi probe; iter-78
    removed that fallback so callers can no longer accidentally enumerate ports
    through a side channel that bypasses the canonical daemon.
    """
    from app.services import midi_host_client

    monkeypatch.setattr(
        midi_host_client.MidiHostClient,
        "is_daemon_available",
        lambda self: False,
    )

    with pytest.raises(MidiHostClientError) as excinfo:
        ports_module.discover_alsa_ports()

    msg = str(excinfo.value)
    assert "controller-host daemon is unreachable" in msg
    assert "iter-78" in msg


def test_discover_alsa_ports_filters_internal_clients_when_daemon_responds(monkeypatch) -> None:
    """Happy path: when the daemon is up, discoverable ports are returned and
    JUCE/RtMidi/Midi-Through/PipeWire-System loopbacks are filtered out by the
    same _is_discoverable_alsa_port_name predicate the pre-iter-78 test guarded.
    """
    from app.services import midi_host_client

    @dataclass
    class _StubPort:
        name: str
        is_input: bool

    raw_ports: List[_StubPort] = [
        _StubPort("RtMidiIn Client:RtMidi input 129:0", is_input=True),
        _StubPort("MAP2 Audio Engine:MIDI In 131:0", is_input=True),
        _StubPort("Midi Through:Midi Through Port-0 14:0", is_input=True),
        _StubPort("M-Audio MIDISPORT 4x4 Port A 24:0", is_input=True),
        _StubPort("MAP2:Maschine-MK1 200:0", is_input=True),
        _StubPort("RtMidiOut Client:RtMidi output 130:0", is_input=False),
        _StubPort("JUCE:announcements 128:0", is_input=False),
        _StubPort("PipeWire-System:input 142:0", is_input=False),
        _StubPort("M-Audio MIDISPORT 4x4 Port A 24:0", is_input=False),
        _StubPort("MAP2:Maschine-MK1 200:0", is_input=False),
    ]

    monkeypatch.setattr(
        midi_host_client.MidiHostClient,
        "is_daemon_available",
        lambda self: True,
    )
    monkeypatch.setattr(
        midi_host_client.MidiHostClient,
        "list_ports",
        lambda self: (None, raw_ports),
    )

    discovered = ports_module.discover_alsa_ports()

    assert discovered == {
        "inputs": ["M-Audio MIDISPORT 4x4 Port A 24:0", "MAP2:Maschine-MK1 200:0"],
        "outputs": ["M-Audio MIDISPORT 4x4 Port A 24:0", "MAP2:Maschine-MK1 200:0"],
    }
