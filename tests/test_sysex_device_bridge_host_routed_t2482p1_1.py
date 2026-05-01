"""T2482-P1.1 Gap D.3 (iter 48) — sysex_device_bridge host-routed flip.

Verifies the env-var-gated host enumeration in
``app/services/sysex_device_bridge.SysExDeviceBridge.get_midi_ports()``.

Iter 48 scope (per the iter-41 reality audit):
- Enumeration (get_midi_ports) routes through MidiHostClient.list_ports
  when env-gate is on AND daemon is up.
- Connect loop and per-message send still use rtmidi (deeper refactors
  deferred to a P1.2 follow-up).

This bridge is the base class for both the IntelFX + MPX-1 services,
so the enumeration flip benefits both at once. Tests use a minimal
SysExDeviceBridge subclass that satisfies the abstract surface.
"""

from __future__ import annotations

import asyncio
import os
import unittest
from typing import Any
from unittest import mock

from app.services.sysex_device_bridge import SysExDeviceBridge
from app.services.midi_host_client import MidiBackendStatus, MidiPortInfo


class _MinimalBridge(SysExDeviceBridge):
    """Concrete SysExDeviceBridge for tests — minimal abstract overrides.

    The constructor loads registry/shadow/library/midi-maps from disk
    by default; we no-op those so the test can focus on get_midi_ports.
    """

    DEVICE_LABEL = "TestDev"
    DEVICE_TOPIC = "test_dev"
    BRIDGE_ID = "test_dev_bridge"
    DEFAULT_NAME_HINT = "testdev"
    VIRTUAL_INPUT_NAME = "TestDev:in"
    VIRTUAL_OUTPUT_NAME = "TestDev:out"
    REGISTRY_FILENAME = "test_registry.json"
    SHADOW_FILENAME = "test_shadow.json"
    LIBRARY_FILENAME = "test_library.json"
    MIDI_MAPS_FILENAME = "test_midi_maps.json"

    def _rtmidi_available(self) -> bool: return True
    def _rtmidi_module(self) -> Any: raise NotImplementedError("not used in this test")
    def _simulator_active(self) -> bool: return False
    def _create_simulated_ports(self): return (None, None)
    def _state_extras(self): return {}
    def _health_extras(self): return {}
    def _default_library_entries(self): return []
    def decode_param_sysex(self, message): return None
    def decode_extended_sysex(self, message): return None
    def _program_slot_count(self) -> int: return 16

    # Skip the disk-loading work in tests.
    def _load_registry(self) -> None: self.registry = {"params": []}
    def _load_shadow_state(self) -> None: self.shadow_state = {}
    def _load_library(self) -> None: pass
    def _load_midi_maps(self) -> None: pass
    def _init_midi_hub_bridge(self) -> None: pass


# ---------------------------------------------------------------------
# rtmidi-injection escape hatch (iter 56 — preserves test-mocked rtmidi
# behaviour even after the env-gate was removed)
# ---------------------------------------------------------------------

class RtmidiInjectionEscapeHatchTests(unittest.TestCase):
    """After iter 56 the env-var gate was removed. The rtmidi-direct
    enumeration branch is reachable only when a test patches
    _rtmidi_module on the instance — that's what triggers
    is_test_injected_rtmidi=True in get_midi_ports."""

    def setUp(self) -> None:
        self._bridge = _MinimalBridge()

    def test_rtmidi_module_injection_drives_legacy_branch(self) -> None:
        # Patch the bridge's _rtmidi_module to return a Mock that
        # provides empty port lists. Setting it via mock.patch.object
        # places the override on instance __dict__, which the iter-56
        # `is_test_injected_rtmidi` check detects.
        fake_rtmidi = mock.Mock()
        fake_in = mock.Mock()
        fake_in.get_port_count.return_value = 0
        fake_out = mock.Mock()
        fake_out.get_port_count.return_value = 0
        fake_rtmidi.MidiIn.return_value = fake_in
        fake_rtmidi.MidiOut.return_value = fake_out
        with mock.patch.object(self._bridge, "_rtmidi_module",
                                  return_value=fake_rtmidi):
            result = asyncio.run(self._bridge.get_midi_ports())
        # Should NOT have host_routed marker — used the rtmidi path.
        self.assertNotIn("host_routed", result)
        self.assertTrue(result["rtmidi_available"])
        self.assertEqual(result["inputs"], [])
        self.assertEqual(result["outputs"], [])


# ---------------------------------------------------------------------
# Env ON + daemon up: host enumeration replaces rtmidi
# ---------------------------------------------------------------------

class EnvVarOnRoutesEnumerationThroughHost(unittest.TestCase):
    """After iter 56, host enumeration is mandatory in production. The
    env-var setup here is no-op (kept for symmetry with sibling test
    suites); the host path is taken whenever _rtmidi_module is NOT
    injected on the instance."""

    def setUp(self) -> None:
        self._env_patch = mock.patch.dict(os.environ, {"MAP2_USE_MIDI_HOST": "1"})
        self._env_patch.start()
        self._bridge = _MinimalBridge()

    def tearDown(self) -> None:
        self._env_patch.stop()

    def test_host_enumeration_returns_inputs_and_outputs_with_indices(self) -> None:
        fake_status = MidiBackendStatus(backend="jack_midi", degraded=False)
        fake_ports = [
            MidiPortInfo(name="OtherDev In", id="other-in", is_input=True, is_virtual=False),
            MidiPortInfo(name="TestDev Input", id="testdev-in", is_input=True, is_virtual=False),
            MidiPortInfo(name="TestDev Output", id="testdev-out", is_input=False, is_virtual=False),
            MidiPortInfo(name="OtherDev Out", id="other-out", is_input=False, is_virtual=False),
        ]
        fake_client = mock.Mock()
        fake_client.is_daemon_available.return_value = True
        fake_client.list_ports.return_value = (fake_status, fake_ports)
        with mock.patch("app.services.midi_host_client.MidiHostClient",
                          return_value=fake_client):
            result = asyncio.run(self._bridge.get_midi_ports())
        self.assertTrue(result["host_routed"])
        self.assertEqual(result["host_backend"], "jack_midi")
        self.assertEqual(len(result["inputs"]), 2)
        self.assertEqual(len(result["outputs"]), 2)
        # Indices renumbered per direction starting at 0.
        self.assertEqual(result["inputs"][0]["index"], 0)
        self.assertEqual(result["inputs"][0]["name"], "OtherDev In")
        self.assertEqual(result["inputs"][1]["index"], 1)
        self.assertEqual(result["inputs"][1]["name"], "TestDev Input")
        self.assertEqual(result["outputs"][0]["index"], 0)
        # Recommended index should match the TestDev hint.
        self.assertEqual(result["recommended_input_index"], 1)
        self.assertEqual(result["recommended_output_index"], 0)

    def test_daemon_down_uses_test_injection_when_rtmidi_module_overridden(self) -> None:
        # Iter 77 hard-stripped the lenient-mode rtmidi fallback. The
        # iter-66 instance-level _rtmidi_module override remains as a
        # test-injection escape hatch — when a test has explicitly
        # patched _rtmidi_module on the instance, daemon-down still
        # routes through the legacy enumeration. This preserves the
        # iter-67 test_get_midi_ports_probe_failure_returns_structured_payload
        # idiom in test_mpx1.py.
        fake_client = mock.Mock()
        fake_client.is_daemon_available.return_value = False
        fake_rtmidi = mock.Mock()
        fake_in = mock.Mock()
        fake_in.get_port_count.return_value = 0
        fake_out = mock.Mock()
        fake_out.get_port_count.return_value = 0
        fake_rtmidi.MidiIn.return_value = fake_in
        fake_rtmidi.MidiOut.return_value = fake_out
        with mock.patch("app.services.midi_host_client.MidiHostClient",
                          return_value=fake_client), \
             mock.patch.object(self._bridge, "_rtmidi_module",
                                  return_value=fake_rtmidi):
            result = asyncio.run(self._bridge.get_midi_ports())
        # Uses the rtmidi escape hatch; no host_routed marker.
        self.assertNotIn("host_routed", result)
        self.assertTrue(result["rtmidi_available"])

    def test_daemon_down_without_test_injection_raises(self) -> None:
        # Iter 77: production path raises when daemon down + no
        # test-injection override. This is the new hard contract;
        # operators must run map2-controller-host.service.
        from app.services.midi_host_client import MidiHostClientError
        fake_client = mock.Mock()
        fake_client.is_daemon_available.return_value = False
        with mock.patch("app.services.midi_host_client.MidiHostClient",
                          return_value=fake_client):
            with self.assertRaises(MidiHostClientError) as ctx:
                asyncio.run(self._bridge.get_midi_ports())
        msg = str(ctx.exception)
        self.assertIn("controller-host daemon is unreachable", msg)
        self.assertIn("TestDev", msg)
        self.assertIn("lenient-mode rtmidi fallback removed in iter 77", msg)

    def test_host_enumeration_recommended_index_matches_hint(self) -> None:
        # The bridge's DEFAULT_NAME_HINT is "testdev" — verify the
        # recommendation logic finds the matching port even with case
        # variations.
        fake_status = MidiBackendStatus(backend="jack_midi", degraded=False)
        fake_ports = [
            MidiPortInfo(name="UA-1000 Input", id="ua-in",
                          is_input=True, is_virtual=False),
            MidiPortInfo(name="TESTDEV (USB MIDI)", id="td-in",
                          is_input=True, is_virtual=False),  # caps mismatch
        ]
        fake_client = mock.Mock()
        fake_client.is_daemon_available.return_value = True
        fake_client.list_ports.return_value = (fake_status, fake_ports)
        with mock.patch("app.services.midi_host_client.MidiHostClient",
                          return_value=fake_client):
            result = asyncio.run(self._bridge.get_midi_ports())
        # The case-insensitive matcher should still pick index 1.
        self.assertEqual(result["recommended_input_index"], 1)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
