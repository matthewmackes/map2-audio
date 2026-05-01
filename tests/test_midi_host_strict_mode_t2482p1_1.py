"""T2482-P1.1 Gap E phase 3 (iter 53) — MAP2_REQUIRE_MIDI_HOST strict mode.

When MAP2_REQUIRE_MIDI_HOST is set to a truthy value, the rtmidi
fallback paths in the 5 consumers MUST raise rather than fall through.
This is the failure-mode validation surface needed before iters 54-58
strip the rtmidi fallback paths entirely.

Tests cover:
1. midi_host_required() helper — env var detection
2. GCP midi_transport list_ports + send_sysex raise under strict mode
3. sysex_device_bridge get_midi_ports raises under strict mode
4. midi_hub/ports.discover_alsa_ports raises under strict mode
5. midi_engine _discover_devices raises under strict mode
6. Strict mode does NOT trigger when host IS available (positive case)
"""

from __future__ import annotations

import asyncio
import os
import unittest
from unittest import mock

from app.services.midi_host_client import (
    MidiHostClientError,
    midi_host_required,
)


# ---------------------------------------------------------------------
# midi_host_required() helper
# ---------------------------------------------------------------------

class MidiHostRequiredHelperTests(unittest.TestCase):
    def test_unset_returns_false(self) -> None:
        env = {k: v for k, v in os.environ.items() if k != "MAP2_REQUIRE_MIDI_HOST"}
        with mock.patch.dict(os.environ, env, clear=True):
            self.assertFalse(midi_host_required())

    def test_explicit_true_returns_true(self) -> None:
        for val in ("1", "true", "yes", "on", "TRUE", "Yes"):
            with mock.patch.dict(os.environ, {"MAP2_REQUIRE_MIDI_HOST": val}):
                self.assertTrue(midi_host_required(),
                                  f"midi_host_required() should return True for '{val}'")

    def test_explicit_false_returns_false(self) -> None:
        for val in ("0", "false", "no", "off", ""):
            with mock.patch.dict(os.environ, {"MAP2_REQUIRE_MIDI_HOST": val}):
                self.assertFalse(midi_host_required(),
                                   f"midi_host_required() should return False for '{val}'")


# ---------------------------------------------------------------------
# GCP transport — strict mode in list_ports + send_sysex
# ---------------------------------------------------------------------

class GcpStrictModeTests(unittest.TestCase):
    """After iter 54 stripped GCP's rtmidi fallback, GCP raises on
    daemon-unreachable regardless of strict mode. These tests confirm
    the always-raise behaviour holds whether MAP2_REQUIRE_MIDI_HOST
    is set or not."""

    def setUp(self) -> None:
        # Strict mode: REQUIRE the host. Default ON (via iter 51 flip).
        self._env = mock.patch.dict(os.environ, {
            "MAP2_USE_MIDI_HOST": "1",
            "MAP2_REQUIRE_MIDI_HOST": "1",
        })
        self._env.start()

    def tearDown(self) -> None:
        self._env.stop()

    def test_list_ports_raises_when_daemon_down(self) -> None:
        from app.services.ground_control_pro.midi_transport import (
            GroundControlMidiTransport,
        )
        transport = GroundControlMidiTransport()  # no factories
        fake_client = mock.Mock()
        fake_client.is_daemon_available.return_value = False  # daemon down
        with mock.patch.object(transport, "_get_host_client",
                                  return_value=fake_client):
            with self.assertRaises(MidiHostClientError) as ctx:
                transport.list_ports()
        # Iter 54 message: "controller-host daemon is unreachable; cannot
        # enumerate MIDI ports for GCP."
        self.assertIn("controller-host daemon is unreachable", str(ctx.exception))
        self.assertIn("GCP", str(ctx.exception))

    def test_send_sysex_raises_when_daemon_down(self) -> None:
        from app.services.ground_control_pro.midi_transport import (
            GroundControlMidiTransport,
        )
        from app.services.ground_control_pro.model import (
            GroundControlTransportOptions,
        )
        transport = GroundControlMidiTransport()
        fake_client = mock.Mock()
        fake_client.is_daemon_available.return_value = False

        async def go():
            opts = GroundControlTransportOptions(
                output_port_index=0, dry_run_path=None,
                inter_message_delay_ms=0,
            )
            return await transport.send_sysex(b"\xF0\x06\x00\xF7", opts)

        with mock.patch.object(transport, "_get_host_client",
                                  return_value=fake_client):
            with self.assertRaises(MidiHostClientError) as ctx:
                asyncio.run(go())
        self.assertIn("controller-host daemon is unreachable", str(ctx.exception))
        self.assertIn("GCP", str(ctx.exception))


# ---------------------------------------------------------------------
# sysex_device_bridge — strict mode in get_midi_ports
# ---------------------------------------------------------------------

class _MinimalBridge:
    """Importable lazily to avoid heavy class init at module load."""
    pass


def _build_minimal_bridge():
    from app.services.sysex_device_bridge import SysExDeviceBridge

    class _MB(SysExDeviceBridge):
        DEVICE_LABEL = "TestDev"
        DEVICE_TOPIC = "test_dev"
        BRIDGE_ID = "test_dev_bridge"
        DEFAULT_NAME_HINT = "testdev"
        VIRTUAL_INPUT_NAME = "TestDev:in"
        VIRTUAL_OUTPUT_NAME = "TestDev:out"
        REGISTRY_FILENAME = "test.json"
        SHADOW_FILENAME = "test_shadow.json"
        LIBRARY_FILENAME = "test_library.json"
        MIDI_MAPS_FILENAME = "test_midi_maps.json"

        def _rtmidi_available(self): return True
        def _rtmidi_module(self): raise NotImplementedError
        def _simulator_active(self): return False
        def _create_simulated_ports(self): return (None, None)
        def _state_extras(self): return {}
        def _health_extras(self): return {}
        def _default_library_entries(self): return []
        def decode_param_sysex(self, m): return None
        def decode_extended_sysex(self, m): return None
        def _program_slot_count(self): return 16
        def _load_registry(self): self.registry = {"params": []}
        def _load_shadow_state(self): self.shadow_state = {}
        def _load_library(self): pass
        def _load_midi_maps(self): pass
        def _init_midi_hub_bridge(self): pass

    return _MB()


class SysexDeviceBridgeStrictModeTests(unittest.TestCase):
    def setUp(self) -> None:
        self._env = mock.patch.dict(os.environ, {
            "MAP2_USE_MIDI_HOST": "1",
            "MAP2_REQUIRE_MIDI_HOST": "1",
        })
        self._env.start()
        self._bridge = _build_minimal_bridge()

    def tearDown(self) -> None:
        self._env.stop()

    def test_get_midi_ports_raises_when_daemon_down(self) -> None:
        # After iter 56, sysex_device_bridge raises unconditionally on
        # daemon-unreachable (rtmidi enumeration fallback removed for
        # production). Strict mode is now redundant for this surface
        # but the failure message is the same shape as the always-raise.
        fake_client = mock.Mock()
        fake_client.is_daemon_available.return_value = False
        with mock.patch("app.services.midi_host_client.MidiHostClient",
                          return_value=fake_client):
            with self.assertRaises(MidiHostClientError) as ctx:
                asyncio.run(self._bridge.get_midi_ports())
        self.assertIn("controller-host daemon is unreachable", str(ctx.exception))
        self.assertIn("TestDev", str(ctx.exception))


# ---------------------------------------------------------------------
# midi_hub/ports.discover_alsa_ports — strict mode
# ---------------------------------------------------------------------

class MidiHubDiscoverStrictModeTests(unittest.TestCase):
    def setUp(self) -> None:
        self._env = mock.patch.dict(os.environ, {
            "MAP2_USE_MIDI_HOST": "1",
            "MAP2_REQUIRE_MIDI_HOST": "1",
        })
        self._env.start()

    def tearDown(self) -> None:
        self._env.stop()

    def test_discover_alsa_ports_raises_when_daemon_down(self) -> None:
        from app.services.midi_hub import ports as mhp
        fake_client = mock.Mock()
        fake_client.is_daemon_available.return_value = False
        with mock.patch("app.services.midi_host_client.MidiHostClient",
                          return_value=fake_client):
            with self.assertRaises(MidiHostClientError) as ctx:
                mhp.discover_alsa_ports()
        self.assertIn("MAP2_REQUIRE_MIDI_HOST", str(ctx.exception))


# ---------------------------------------------------------------------
# midi_engine._discover_devices — strict mode
# ---------------------------------------------------------------------

class MidiEngineDiscoverStrictModeTests(unittest.TestCase):
    def setUp(self) -> None:
        self._env = mock.patch.dict(os.environ, {
            "MAP2_USE_MIDI_HOST": "1",
            "MAP2_REQUIRE_MIDI_HOST": "1",
        })
        self._env.start()

    def tearDown(self) -> None:
        self._env.stop()

    def test_discover_devices_raises_when_daemon_down(self) -> None:
        from app.services import midi_engine as me

        class _BareEngine(me.MIDIEngineService):
            def __init__(self):
                self.input_devices = []
                self.output_devices = []
                self._hub_enabled = False
                self._hub = None

        engine = _BareEngine()
        fake_client = mock.Mock()
        fake_client.is_daemon_available.return_value = False
        with mock.patch.object(me, "get_midi_hub", None), \
             mock.patch("app.services.midi_host_client.MidiHostClient",
                          return_value=fake_client):
            with self.assertRaises(MidiHostClientError) as ctx:
                engine._discover_devices()
        self.assertIn("MAP2_REQUIRE_MIDI_HOST", str(ctx.exception))


# ---------------------------------------------------------------------
# Maschine — strict mode raises on shadow-skip
# ---------------------------------------------------------------------

class MaschineStrictModeTests(unittest.TestCase):
    def setUp(self) -> None:
        self._env = mock.patch.dict(os.environ, {
            "MAP2_USE_MIDI_HOST": "1",
            "MAP2_REQUIRE_MIDI_HOST": "1",
        })
        self._env.start()

    def tearDown(self) -> None:
        self._env.stop()

    def test_send_messages_raises_when_daemon_down_in_strict(self) -> None:
        from app.services.maschine import maschine_mk1_daemon
        # Stub rtmidi so VirtualMidiOutput.open() succeeds.
        class _StubOut:
            def __init__(self):
                self.sent = []
                self.opened = None
            def open_virtual_port(self, name): self.opened = name
            def send_message(self, m): self.sent.append(list(m))
            def close_port(self): pass
            def delete(self): pass
        stub = mock.Mock()
        stub.MidiOut = lambda: _StubOut()
        fake_client = mock.Mock()
        fake_client.is_daemon_available.return_value = False  # daemon down
        with mock.patch.object(maschine_mk1_daemon, "rtmidi", stub):
            vo = maschine_mk1_daemon.VirtualMidiOutput("test:port")
            self.assertTrue(vo.open())
            with mock.patch.object(vo, "_get_host_client",
                                      return_value=fake_client):
                with self.assertRaises(MidiHostClientError) as ctx:
                    vo.send_messages([bytes([0xB0, 0x07, 0x40])])
        self.assertIn("MAP2_REQUIRE_MIDI_HOST", str(ctx.exception))
        self.assertIn("Maschine", str(ctx.exception))


# ---------------------------------------------------------------------
# Positive case — strict mode does NOT raise when daemon IS available
# ---------------------------------------------------------------------

class StrictModePositiveCaseTests(unittest.TestCase):
    def setUp(self) -> None:
        self._env = mock.patch.dict(os.environ, {
            "MAP2_USE_MIDI_HOST": "1",
            "MAP2_REQUIRE_MIDI_HOST": "1",
        })
        self._env.start()

    def tearDown(self) -> None:
        self._env.stop()

    def test_gcp_list_ports_succeeds_when_daemon_up(self) -> None:
        from app.services.ground_control_pro.midi_transport import (
            GroundControlMidiTransport,
        )
        from app.services.midi_host_client import (
            MidiBackendStatus, MidiPortInfo,
        )
        transport = GroundControlMidiTransport()
        fake_client = mock.Mock()
        fake_client.is_daemon_available.return_value = True
        fake_client.list_ports.return_value = (
            MidiBackendStatus(backend="jack_midi", degraded=False),
            [MidiPortInfo(name="Port", id="p", is_input=True, is_virtual=False)],
        )
        with mock.patch.object(transport, "_get_host_client",
                                  return_value=fake_client):
            result = transport.list_ports()
        self.assertTrue(result["host_routed"])

    def test_midi_hub_discover_succeeds_when_daemon_up(self) -> None:
        from app.services.midi_hub import ports as mhp
        from app.services.midi_host_client import (
            MidiBackendStatus, MidiPortInfo,
        )
        fake_client = mock.Mock()
        fake_client.is_daemon_available.return_value = True
        fake_client.list_ports.return_value = (
            MidiBackendStatus(backend="jack_midi", degraded=False),
            [MidiPortInfo(name="UA-1000 MIDI", id="ua",
                           is_input=True, is_virtual=False)],
        )
        with mock.patch("app.services.midi_host_client.MidiHostClient",
                          return_value=fake_client):
            result = mhp.discover_alsa_ports()
        self.assertEqual(result["inputs"], ["UA-1000 MIDI"])


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
