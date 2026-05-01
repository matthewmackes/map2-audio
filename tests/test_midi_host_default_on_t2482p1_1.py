"""T2482-P1.1 Gap E phase 1 (iter 51) — verify all 5 env gates default ON.

After iter 51, MAP2_USE_MIDI_HOST defaults to ON across the 5 rtmidi
consumers. The opt-out is now an explicit "0" / "false" / "no" / "off"
value; unset, empty, or any other value routes through the
controller-host.

This test pins the default-ON behaviour so a future regression that
reverses the default surfaces immediately.
"""

from __future__ import annotations

import os
import unittest
from unittest import mock


class DefaultOnGateBehaviourTests(unittest.TestCase):
    """The remaining _use_midi_host() helpers must return True by default.

    NB: GCP's _use_midi_host() helper was removed in iter 54 when the
    rtmidi fallback was stripped — GCP is now unconditionally host-routed
    in production. The 4 helpers below still gate consumers that retain
    a dual-mode rtmidi fallback (iters 55-58 strip those one by one).
    """

    GATE_FNS = [
        ("app.services.maschine.maschine_mk1_daemon", "_maschine_use_midi_host"),
        # _sysex_bridge_use_midi_host removed in iter 56 (host path
        # is now mandatory in production for sysex_device_bridge
        # enumeration; rtmidi-direct survives only as a test-injection
        # escape hatch).
        ("app.services.midi_hub.ports", "_midi_hub_use_midi_host"),
        ("app.services.midi_engine", "_midi_engine_use_midi_host"),
    ]

    def _import_gate(self, mod_name: str, fn_name: str):
        import importlib
        mod = importlib.import_module(mod_name)
        return getattr(mod, fn_name)

    def test_unset_env_defaults_to_on(self) -> None:
        """No MAP2_USE_MIDI_HOST in os.environ → all gates return True."""
        env = {k: v for k, v in os.environ.items() if k != "MAP2_USE_MIDI_HOST"}
        with mock.patch.dict(os.environ, env, clear=True):
            for mod_name, fn_name in self.GATE_FNS:
                gate = self._import_gate(mod_name, fn_name)
                self.assertTrue(gate(), f"{mod_name}.{fn_name} should default ON when env unset")

    def test_empty_env_defaults_to_on(self) -> None:
        """MAP2_USE_MIDI_HOST="" → all gates return True (treated as default)."""
        with mock.patch.dict(os.environ, {"MAP2_USE_MIDI_HOST": ""}):
            for mod_name, fn_name in self.GATE_FNS:
                gate = self._import_gate(mod_name, fn_name)
                self.assertTrue(gate(), f"{mod_name}.{fn_name} should default ON when env empty")

    def test_explicit_0_disables(self) -> None:
        with mock.patch.dict(os.environ, {"MAP2_USE_MIDI_HOST": "0"}):
            for mod_name, fn_name in self.GATE_FNS:
                gate = self._import_gate(mod_name, fn_name)
                self.assertFalse(gate(), f"{mod_name}.{fn_name} should return False for '0'")

    def test_explicit_false_disables(self) -> None:
        for opt_out in ("false", "FALSE", "no", "off", "NO", "Off"):
            with mock.patch.dict(os.environ, {"MAP2_USE_MIDI_HOST": opt_out}):
                for mod_name, fn_name in self.GATE_FNS:
                    gate = self._import_gate(mod_name, fn_name)
                    self.assertFalse(
                        gate(),
                        f"{mod_name}.{fn_name} should return False for '{opt_out}'",
                    )

    def test_explicit_1_enables(self) -> None:
        for opt_in in ("1", "true", "yes", "on", "TRUE", "Yes"):
            with mock.patch.dict(os.environ, {"MAP2_USE_MIDI_HOST": opt_in}):
                for mod_name, fn_name in self.GATE_FNS:
                    gate = self._import_gate(mod_name, fn_name)
                    self.assertTrue(
                        gate(),
                        f"{mod_name}.{fn_name} should return True for '{opt_in}'",
                    )

    def test_garbage_value_defaults_to_on(self) -> None:
        """Any unrecognized value → ON (not OFF). Surprising values must not
        accidentally take the legacy rtmidi path."""
        for garbage in ("maybe", "yes please", "2", "ON ", " 1 "):
            with mock.patch.dict(os.environ, {"MAP2_USE_MIDI_HOST": garbage}):
                for mod_name, fn_name in self.GATE_FNS:
                    gate = self._import_gate(mod_name, fn_name)
                    # NB: garbage strings (other than the explicit
                    # opt-outs) → True. " 1 " is the trimmed "1" so
                    # it's an opt-in. "ON " is the trimmed/lowered
                    # "on" so opt-in too.
                    self.assertTrue(
                        gate(),
                        f"{mod_name}.{fn_name} returned False for unrecognized '{garbage}'",
                    )


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
