"""T2482-P1.1 Gap D.4 + D.5 (iter 49) — flip the two heavy consumers.

Verifies the env-var-gated routing in:
- ``app/services/midi_hub/ports.py::discover_alsa_ports`` (Gap D.4)
- ``app/services/midi_engine.py::_discover_devices`` (Gap D.5)

discover_alsa_ports is the canonical port enumeration entry point used
by every MIDI Hub consumer (Tesira, GPIO, OSC, event list, etc.), so
flipping it benefits the entire Hub surface in one change.

midi_engine._discover_devices already inherits the host-routed path
through its MidiHub-first discovery tier; the additional rtmidi-direct
gate added in iter 49 covers the few code paths that bypass MidiHub.
"""

from __future__ import annotations

import asyncio
import os
import unittest
from unittest import mock

from app.services.midi_host_client import MidiBackendStatus, MidiPortInfo


# ---------------------------------------------------------------------
# discover_alsa_ports() — midi_hub/ports.py (Gap D.4)
# ---------------------------------------------------------------------

class DiscoverAlsaPortsHostRoutedTests(unittest.TestCase):
    def setUp(self) -> None:
        # Iter 51 flipped default to ON; explicit "0" forces OFF.
        self._env_patch_off = mock.patch.dict(os.environ, {"MAP2_USE_MIDI_HOST": "0"})

    def test_env_off_uses_rtmidi_path(self) -> None:
        from app.services.midi_hub import ports as midi_hub_ports
        self._env_patch_off.start()
        try:
            # When env is OFF, no host client is constructed even if
            # one would be available. Patch MidiHostClient so any
            # accidental construction raises (proves we don't take
            # the host path).
            with mock.patch("app.services.midi_host_client.MidiHostClient",
                              side_effect=AssertionError("host client must not be constructed")):
                # Real rtmidi or stub — either way, host shouldn't be hit.
                with mock.patch.object(midi_hub_ports, "rtmidi", None):
                    result = midi_hub_ports.discover_alsa_ports()
            # rtmidi=None falls through to empty lists.
            self.assertEqual(result, {"inputs": [], "outputs": []})
        finally:
            self._env_patch_off.stop()

    def test_env_on_routes_through_host(self) -> None:
        from app.services.midi_hub import ports as midi_hub_ports
        env_patch = mock.patch.dict(os.environ, {"MAP2_USE_MIDI_HOST": "1"})
        env_patch.start()
        try:
            fake_status = MidiBackendStatus(backend="jack_midi", degraded=False)
            # Mix of discoverable + filtered (internal) names.
            fake_ports = [
                MidiPortInfo(name="UA-1000 MIDI", id="ua-in", is_input=True, is_virtual=False),
                MidiPortInfo(name="RtMidiIn Client:test", id="rt-in", is_input=True, is_virtual=False),
                MidiPortInfo(name="Maschine MK1", id="mk1-in", is_input=True, is_virtual=False),
                MidiPortInfo(name="UA-1000 MIDI", id="ua-out", is_input=False, is_virtual=False),
            ]
            fake_client = mock.Mock()
            fake_client.is_daemon_available.return_value = True
            fake_client.list_ports.return_value = (fake_status, fake_ports)
            with mock.patch("app.services.midi_host_client.MidiHostClient",
                              return_value=fake_client):
                result = midi_hub_ports.discover_alsa_ports()
            # Internal/filtered names ("RtMidiIn Client:...") should
            # be excluded by _is_discoverable_alsa_port_name().
            self.assertNotIn("RtMidiIn Client:test", result["inputs"])
            self.assertIn("UA-1000 MIDI", result["inputs"])
            self.assertIn("Maschine MK1", result["inputs"])
            self.assertEqual(result["outputs"], ["UA-1000 MIDI"])
        finally:
            env_patch.stop()

    def test_env_on_daemon_down_falls_through_to_rtmidi(self) -> None:
        from app.services.midi_hub import ports as midi_hub_ports
        env_patch = mock.patch.dict(os.environ, {"MAP2_USE_MIDI_HOST": "1"})
        env_patch.start()
        try:
            fake_client = mock.Mock()
            fake_client.is_daemon_available.return_value = False  # daemon down
            with mock.patch("app.services.midi_host_client.MidiHostClient",
                              return_value=fake_client), \
                 mock.patch.object(midi_hub_ports, "rtmidi", None):
                result = midi_hub_ports.discover_alsa_ports()
            # Falls through to rtmidi path; rtmidi=None gives empty lists.
            self.assertEqual(result, {"inputs": [], "outputs": []})
            fake_client.is_daemon_available.assert_called_once()
        finally:
            env_patch.stop()


# ---------------------------------------------------------------------
# midi_engine._discover_devices() (Gap D.5)
# ---------------------------------------------------------------------

class MidiEngineDiscoverDevicesHostRoutedTests(unittest.TestCase):
    def _make_engine(self):
        # MIDIEngine instantiation pulls the rtmidi module + may try
        # to discover devices. Build it with discovery disabled by
        # patching _discover_devices in __init__.
        from app.services import midi_engine as me
        # Subclass to bypass the constructor's heavy init.
        class _BareEngine(me.MIDIEngineService):
            def __init__(self):
                # Skip the full MIDIEngineService.__init__ — set only
                # the fields _discover_devices reads.
                self.input_devices = []
                self.output_devices = []
                self._hub_enabled = False
                self._hub = None
        return _BareEngine()

    def test_env_on_with_host_replaces_rtmidi_discovery(self) -> None:
        env_patch = mock.patch.dict(os.environ, {"MAP2_USE_MIDI_HOST": "1"})
        env_patch.start()
        try:
            from app.services import midi_engine as me
            fake_status = MidiBackendStatus(backend="jack_midi", degraded=False)
            fake_ports = [
                MidiPortInfo(name="UA-1000 In", id="ua-in", is_input=True, is_virtual=False),
                MidiPortInfo(name="UA-1000 Out", id="ua-out", is_input=False, is_virtual=False),
                MidiPortInfo(name="JUCE Virtual", id="juce", is_input=False, is_virtual=True),
            ]
            fake_client = mock.Mock()
            fake_client.is_daemon_available.return_value = True
            fake_client.list_ports.return_value = (fake_status, fake_ports)

            engine = self._make_engine()
            # Force the MidiHub-first path to fall through (so we test
            # the rtmidi-replacement branch added in iter 49).
            with mock.patch.object(me, "get_midi_hub", None), \
                 mock.patch("app.services.midi_host_client.MidiHostClient",
                              return_value=fake_client):
                engine._discover_devices()

            # Engine should now have the host-supplied inputs/outputs.
            in_names = [d.name for d in engine.input_devices]
            out_names = [d.name for d in engine.output_devices]
            self.assertIn("UA-1000 In", in_names)
            self.assertIn("UA-1000 Out", out_names)
            self.assertIn("JUCE Virtual", out_names)
            # is_virtual flag survives the wire.
            juce_dev = next(d for d in engine.output_devices if d.name == "JUCE Virtual")
            self.assertTrue(juce_dev.is_virtual)
        finally:
            env_patch.stop()

    def test_env_off_does_not_use_host(self) -> None:
        env_patch = mock.patch.dict(os.environ, {"MAP2_USE_MIDI_HOST": "0"})
        env_patch.start()
        try:
            from app.services import midi_engine as me
            engine = self._make_engine()
            with mock.patch.object(me, "get_midi_hub", None), \
                 mock.patch.object(me, "RTMIDI_AVAILABLE", False), \
                 mock.patch("app.services.midi_host_client.MidiHostClient",
                              side_effect=AssertionError("host client must not be constructed")):
                engine._discover_devices()
            # Falls to virtual fallback path (RTMIDI_AVAILABLE=False)
            # without touching the host client.
            self.assertEqual(len(engine.input_devices), 1)
            self.assertEqual(engine.input_devices[0].name, "Virtual Input 1")
        finally:
            env_patch.stop()

    def test_env_on_daemon_down_falls_to_virtual(self) -> None:
        env_patch = mock.patch.dict(os.environ, {"MAP2_USE_MIDI_HOST": "1"})
        env_patch.start()
        try:
            from app.services import midi_engine as me
            fake_client = mock.Mock()
            fake_client.is_daemon_available.return_value = False  # daemon down

            engine = self._make_engine()
            with mock.patch.object(me, "get_midi_hub", None), \
                 mock.patch.object(me, "RTMIDI_AVAILABLE", False), \
                 mock.patch("app.services.midi_host_client.MidiHostClient",
                              return_value=fake_client):
                engine._discover_devices()

            # Daemon-down + rtmidi-unavailable → virtual fallback.
            self.assertEqual(engine.input_devices[0].name, "Virtual Input 1")
            fake_client.is_daemon_available.assert_called_once()
        finally:
            env_patch.stop()


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
