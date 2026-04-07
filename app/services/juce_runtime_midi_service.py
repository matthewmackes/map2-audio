from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from app.services.juce_engine_service import JuceEngineService


logger = logging.getLogger(__name__)


class JuceRuntimeMidiService:
    """Focused JUCE runtime MIDI bridge helpers."""

    def __init__(self, owner: "JuceEngineService") -> None:
        self._owner = owner

    @property
    def _engine(self):
        return self._owner.engine

    async def enable_midi(self, enable: bool) -> bool:
        return bool(await self._owner._run_engine_call("enable_midi", enable, default=False))

    async def get_midi_devices(self) -> List[str]:
        return await self._owner._run_engine_call("get_midi_devices", default=[])

    async def get_midi_input_devices(self) -> List[Dict[str, Any]]:
        try:
            return await self._owner._run_engine_call("get_midi_input_devices", default=[])
        except AttributeError:
            devices = await self._owner._run_engine_call("get_midi_devices", default=[])
            return [{"index": i, "name": d, "type": "input"} for i, d in enumerate(devices)]

    async def get_midi_output_devices(self) -> List[Dict[str, Any]]:
        try:
            return await self._owner._run_engine_call("get_midi_output_devices", default=[])
        except AttributeError:
            return []

    async def open_midi_input(self, device_index: int) -> bool:
        try:
            return bool(await self._owner._run_engine_call("open_midi_input", device_index, default=False))
        except AttributeError:
            logger.warning("JUCE engine does not support open_midi_input")
            return False

    async def close_midi_input(self) -> bool:
        try:
            return bool(await self._owner._run_engine_call("close_midi_input", default=False))
        except AttributeError:
            return False

    async def open_midi_output(self, device_index: int) -> bool:
        try:
            return bool(await self._owner._run_engine_call("open_midi_output", device_index, default=False))
        except AttributeError:
            logger.warning("JUCE engine does not support open_midi_output")
            return False

    async def close_midi_output(self) -> bool:
        try:
            return bool(await self._owner._run_engine_call("close_midi_output", default=False))
        except AttributeError:
            return False

    async def get_midi_status(self) -> Dict[str, Any]:
        try:
            return await self._owner._run_engine_call("get_midi_status", default={})
        except AttributeError:
            return {
                "enabled": bool(await self._owner._run_engine_call("is_midi_enabled", default=False)),
                "running": self._owner._initialized,
                "input_device": None,
                "output_device": None,
                "mappings_count": 0,
                "learning": False,
            }

    async def inject_midi_note_on(self, channel: int, note: int, velocity: int) -> bool:
        handler = getattr(self._engine, "midi_inject_note_on", None)
        if not callable(handler):
            return False
        return bool(await asyncio.to_thread(handler, channel, note, velocity))

    async def inject_midi_note_off(self, channel: int, note: int, velocity: int = 0) -> bool:
        handler = getattr(self._engine, "midi_inject_note_off", None)
        if not callable(handler):
            return False
        return bool(await asyncio.to_thread(handler, channel, note, velocity))
