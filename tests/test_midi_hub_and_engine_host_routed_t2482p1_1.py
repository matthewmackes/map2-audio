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
        # Iter 57 removed the env-gate from midi_hub/ports; the env
        # patch is no-op now but kept for symmetry with sibling
        # suites. Keeping it pinned to a known value also prevents
        # MAP2_USE_MIDI_HOST in the dev shell from leaking into
        # tests for the other consumers that still honor the gate.
        self._env_patch_off = mock.patch.dict(os.environ, {"MAP2_USE_MIDI_HOST": "0"})

    def test_daemon_down_raises_unconditionally_after_iter78(self) -> None:
        # Iter 78 hard-strip: discover_alsa_ports raises on
        # daemon-down regardless of env-flag setting. The lenient-mode
        # rtmidi-empty-fallback that lived through iter 57-77 is gone.
        from app.services.midi_hub import ports as midi_hub_ports
        from app.services.midi_host_client import MidiHostClientError
        fake_client = mock.Mock()
        fake_client.is_daemon_available.return_value = False
        with mock.patch("app.services.midi_host_client.MidiHostClient",
                          return_value=fake_client):
            with self.assertRaises(MidiHostClientError) as ctx:
                midi_hub_ports.discover_alsa_ports()
        self.assertIn("controller-host daemon is unreachable", str(ctx.exception))
        fake_client.is_daemon_available.assert_called()

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

    def test_daemon_down_raises_after_iter78_hard_strip(self) -> None:
        # Iter 78: discover_alsa_ports raises unconditionally on
        # daemon-down. The iter-49-era "falls through to rtmidi"
        # behaviour was removed; this test pins the new contract.
        from app.services.midi_hub import ports as midi_hub_ports
        from app.services.midi_host_client import MidiHostClientError
        env_patch = mock.patch.dict(os.environ, {"MAP2_USE_MIDI_HOST": "1"})
        env_patch.start()
        try:
            fake_client = mock.Mock()
            fake_client.is_daemon_available.return_value = False
            with mock.patch("app.services.midi_host_client.MidiHostClient",
                              return_value=fake_client):
                with self.assertRaises(MidiHostClientError) as ctx:
                    midi_hub_ports.discover_alsa_ports()
            self.assertIn("controller-host daemon is unreachable", str(ctx.exception))
            self.assertIn("iter-78", str(ctx.exception))
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

    def test_daemon_down_falls_to_virtual_in_lenient_mode_after_iter83(self) -> None:
        # Iter 83 softened the iter-78 raise: when daemon is down +
        # lenient mode (no MAP2_REQUIRE_MIDI_HOST), midi_engine falls
        # to the virtual placeholder rather than raising. Strict mode
        # still raises (covered separately).
        env_patch = mock.patch.dict(os.environ, {"MAP2_USE_MIDI_HOST": "1"})
        env_patch.start()
        try:
            from app.services import midi_engine as me
            fake_client = mock.Mock()
            fake_client.is_daemon_available.return_value = False
            engine = self._make_engine()
            with mock.patch.object(me, "get_midi_hub", None), \
                 mock.patch("app.services.midi_host_client.MidiHostClient",
                              return_value=fake_client):
                # Should NOT raise.
                engine._discover_devices()
            self.assertEqual(len(engine.input_devices), 1)
            self.assertEqual(engine.input_devices[0].name, "Virtual Input 1")
            fake_client.is_daemon_available.assert_called_once()
        finally:
            env_patch.stop()


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
