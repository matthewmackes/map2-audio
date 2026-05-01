"""
Shared MIDI SysEx bridge base for hardware-backed device services.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Tuple

from app.services.sysex_device_bridge import SysExDeviceBridge

logger = logging.getLogger(__name__)


def build_midi_sysex_runtime(
    *,
    simulator_env_var: str,
    simulator_module: str,
    device_label: str,
) -> Dict[str, Any]:
    """Load optional simulator bindings for a SysEx bridge.

    T2482 loop 9 / iter 84: rtmidi import removed. The runtime
    surface keeps `rtmidi_available` + `rtmidi_module` keys (always
    False / None) for backwards compatibility with subclasses that
    introspect the dict, but the bridge no longer provides rtmidi.
    Production MIDI I/O routes through the controller-host (per
    iter-77 sysex_device_bridge enumeration strip + iter-83
    midi_engine binding strip).
    """
    runtime: Dict[str, Any] = {
        "rtmidi_available": False,
        "rtmidi_module": None,
        "simulator_active": False,
        "simulated_midi_in": None,
        "simulated_midi_out": None,
        "get_simulator": None,
    }

    simulator_enabled = os.environ.get(simulator_env_var, "").strip() in {"1", "true", "yes"}
    if simulator_enabled:
        try:
            import sys

            tests_dir = str(Path(__file__).resolve().parents[2] / "tests")
            if tests_dir not in sys.path:
                sys.path.insert(0, tests_dir)
            module = __import__(
                simulator_module,
                fromlist=["SimulatedMidiIn", "SimulatedMidiOut", "get_simulator"],
            )
            runtime["simulator_active"] = True
            runtime["simulated_midi_in"] = getattr(module, "SimulatedMidiIn")
            runtime["simulated_midi_out"] = getattr(module, "SimulatedMidiOut")
            runtime["get_simulator"] = getattr(module, "get_simulator")
            logger.info("%s SysEx simulator activated", device_label)
        except ImportError:
            logger.warning("%s requested but %s module not found", simulator_env_var, simulator_module)

    return runtime


class MidiSysexBridgeBase(SysExDeviceBridge):
    """Common runtime/bootstrap layer for MIDI SysEx device bridges."""

    _MIDI_RUNTIME: Dict[str, Any] = {
        "rtmidi_available": False,
        "rtmidi_module": None,
        "simulator_active": False,
        "simulated_midi_in": None,
        "simulated_midi_out": None,
        "get_simulator": None,
    }
    SYX_PARSER_MODULE = ""
    SYX_PARSER_CLASS = ""

    def _rtmidi_available(self) -> bool:
        return bool(self._MIDI_RUNTIME.get("rtmidi_available", False))

    def _rtmidi_module(self) -> Any:
        return self._MIDI_RUNTIME.get("rtmidi_module")

    def _simulator_active(self) -> bool:
        return bool(self._MIDI_RUNTIME.get("simulator_active", False))

    def _create_simulated_ports(self) -> Tuple[Any, Any]:
        get_simulator = self._MIDI_RUNTIME.get("get_simulator")
        simulated_midi_in = self._MIDI_RUNTIME.get("simulated_midi_in")
        simulated_midi_out = self._MIDI_RUNTIME.get("simulated_midi_out")
        if not callable(get_simulator) or simulated_midi_in is None or simulated_midi_out is None:
            raise RuntimeError(f"{self.DEVICE_LABEL} simulator unavailable")
        sim = get_simulator()
        return simulated_midi_in(sim), simulated_midi_out(sim)

    async def import_syx_bytes(
        self,
        data: bytes,
        source_name: str = "<upload>",
        skip_duplicates: bool = True,
    ) -> Dict[str, Any]:
        module = __import__(
            self.SYX_PARSER_MODULE,
            fromlist=[self.SYX_PARSER_CLASS, "deduplicate_programs"],
        )
        parser_cls = getattr(module, self.SYX_PARSER_CLASS)
        deduplicate_programs = getattr(module, "deduplicate_programs")
        parser = parser_cls()
        try:
            programs = parser.parse_bytes(data, source_name=source_name)
        except Exception as exc:
            logger.error("SysEx parse error: %s", exc)
            return {"imported": 0, "skipped": 0, "errors": [str(exc)]}

        if skip_duplicates:
            programs = deduplicate_programs(programs)
        return await self._import_parsed_programs(
            programs,
            source_name=source_name,
            skip_duplicates=skip_duplicates,
        )
