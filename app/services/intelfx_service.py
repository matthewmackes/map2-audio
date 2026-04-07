"""
IntelFX MIDI bridge service.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional, Tuple

from app.services.sysex_device_bridge import SysExDeviceBridge

logger = logging.getLogger(__name__)

try:
    import rtmidi  # type: ignore

    RTMIDI_AVAILABLE = True
except ImportError:
    RTMIDI_AVAILABLE = False
    rtmidi = None
    logger.warning("python-rtmidi not installed, IntelFX MIDI I/O running in simulation mode")

_SIMULATOR_ENABLED = os.environ.get("INTELFX_SIMULATOR", "").strip() in ("1", "true", "yes")

if _SIMULATOR_ENABLED and not RTMIDI_AVAILABLE:
    try:
        import pathlib as _pathlib
        import sys as _sys

        _tests_dir = str(_pathlib.Path(__file__).resolve().parents[2] / "tests")
        if _tests_dir not in _sys.path:
            _sys.path.insert(0, _tests_dir)
        from intelfx_simulator import IntelFXSimulator, SimulatedMidiIn, SimulatedMidiOut, get_simulator  # type: ignore

        _SIMULATOR_ACTIVE = True
        logger.info("IntelFX SysEx simulator activated")
    except ImportError:
        _SIMULATOR_ACTIVE = False
        logger.warning("INTELFX_SIMULATOR requested but intelfx_simulator module not found")
else:
    _SIMULATOR_ACTIVE = False


class IntelFXService(SysExDeviceBridge):
    DEVICE_LABEL = "IntelFX"
    DEVICE_TOPIC = "intelfx"
    BRIDGE_ID = "intelfx_service"
    REGISTRY_FILENAME = "intelfx_params.json"
    SHADOW_FILENAME = "intelfx_shadow.json"
    LIBRARY_FILENAME = "intelfx_library.json"
    MIDI_MAPS_FILENAME = "intelfx_midi_maps.json"
    HUB_INPUT_PORT_ID = "consumer:intelfx_in"
    HUB_OUTPUT_PORT_ID = "consumer:intelfx_out"
    HUB_INPUT_NAME = "IntelFX Input"
    HUB_OUTPUT_NAME = "IntelFX Output"
    VIRTUAL_INPUT_NAME = "Virtual IntelFX Input"
    VIRTUAL_OUTPUT_NAME = "Virtual IntelFX Output"
    DEFAULT_NAME_HINT = "intelfx"
    PORT_MATCH_ALIASES: Tuple[str, ...] = ("intellifex", "rocktron")
    DEFAULT_PROGRAM_SLOTS = 256
    PING_PARAM_ID = "hush.threshold"
    _SYSEX_PREFIX = [0xF0, 0x00, 0x01, 0x56]
    _SYSEX_SUFFIX = 0xF7

    def _rtmidi_available(self) -> bool:
        return RTMIDI_AVAILABLE

    def _rtmidi_module(self) -> Any:
        return rtmidi

    def _simulator_active(self) -> bool:
        return _SIMULATOR_ACTIVE

    def _create_simulated_ports(self) -> Tuple[Any, Any]:
        sim = get_simulator()  # type: ignore[name-defined]
        return SimulatedMidiIn(sim), SimulatedMidiOut(sim)  # type: ignore[name-defined]

    def _state_extras(self) -> Dict[str, Any]:
        return {"simulator": _SIMULATOR_ACTIVE}

    def _health_extras(self) -> Dict[str, Any]:
        return {"simulator": _SIMULATOR_ACTIVE}

    def _default_library_entries(self) -> List[Dict[str, Any]]:
        curated_names = [
            "Clean Shimmer", "Crunch Delay", "Heavy Flange", "Acoustic Room", "Lead Chorus",
            "Warm Overdrive", "Tape Echo Slap", "Deep Phaser", "Crystal Chorus", "Studio Reverb",
            "Tight Doubler", "Analog Flange", "Bright Plate", "Dark Hall", "Slapback Echo",
            "Power Crunch", "Subtle Detune", "Rotary Spin", "Tremolo Pulse", "Metal Gate",
            "Jazz Clean", "Blues Drive", "Rock Delay", "Shred Chorus", "Funk Wah",
            "Ambient Wash", "Gated Reverb", "Stereo Spread", "Octave Fuzz", "Envelope Filter",
            "Spring Verb", "Thick Chorus", "Mod Delay", "Pitch Shift +5", "Harmonizer 3rd",
            "Arena Reverb", "Lo-Fi Crush", "Tape Warble", "Auto Swell", "Noise Gate Pro",
            "Vintage Vibe", "Modern Lead", "Rhythm Crunch", "Ballad Clean", "Acoustic Sim",
            "Stage Monitor", "Feedback Loop", "Infinite Sustain", "Dual Delay Pan", "Master Bypass",
        ]
        curated_tags = [
            ["clean", "shimmer"], ["crunch", "delay"], ["heavy", "flange"], ["acoustic", "room"], ["lead", "chorus"],
            ["warm", "overdrive"], ["tape", "echo"], ["deep", "phaser"], ["crystal", "chorus"], ["studio", "reverb"],
            ["tight", "doubler"], ["analog", "flange"], ["bright", "plate"], ["dark", "hall"], ["slapback", "echo"],
            ["power", "crunch"], ["subtle", "detune"], ["rotary", "modulation"], ["tremolo", "pulse"], ["metal", "gate"],
            ["jazz", "clean"], ["blues", "drive"], ["rock", "delay"], ["shred", "chorus"], ["funk", "wah"],
            ["ambient", "wash"], ["gated", "reverb"], ["stereo", "spread"], ["octave", "fuzz"], ["envelope", "filter"],
            ["spring", "reverb"], ["thick", "chorus"], ["mod", "delay"], ["pitch", "shift"], ["harmonizer", "pitch"],
            ["arena", "reverb"], ["lofi", "crush"], ["tape", "warble"], ["auto", "swell"], ["noise", "gate"],
            ["vintage", "vibe"], ["modern", "lead"], ["rhythm", "crunch"], ["ballad", "clean"], ["acoustic", "sim"],
            ["stage", "monitor"], ["feedback", "loop"], ["sustain", "infinite"], ["dual", "delay"], ["master", "bypass"],
        ]
        entries: List[Dict[str, Any]] = []
        for index, name in enumerate(curated_names):
            tags = curated_tags[index] if index < len(curated_tags) else ["curated"]
            entries.append(
                {
                    "program": index,
                    "name": name,
                    "tags": tags,
                    "rating": 2 if ("clean" in tags or "lead" in tags) else 1,
                    "type": tags[0] if tags else "general",
                }
            )
        return entries

    def decode_param_sysex(self, message: List[int]) -> Optional[Dict[str, Any]]:
        if len(message) < 10 or int(message[0]) & 0xFF != 0xF0:
            return None
        if (int(message[1]) & 0x7F) != 0x00 or (int(message[2]) & 0x7F) != 0x01 or (int(message[3]) & 0x7F) != 0x56:
            return None
        if int(message[-1]) & 0xFF != self._SYSEX_SUFFIX:
            return None

        for offset in [6, 5]:
            decoded = self._decode_param_sysex_at_offset(message, offset)
            if decoded is not None:
                return decoded
        return None

    def decode_extended_sysex(self, message: List[int]) -> Optional[Dict[str, Any]]:
        if len(message) < 8 or int(message[0]) & 0xFF != 0xF0:
            return None
        if (int(message[1]) & 0x7F) != 0x00 or (int(message[2]) & 0x7F) != 0x01 or (int(message[3]) & 0x7F) != 0x56:
            return None
        if int(message[-1]) & 0xFF != self._SYSEX_SUFFIX:
            return None

        if len(message) >= 10 and (
            (int(message[5]) & 0x7F) == 0x12
            and (int(message[6]) & 0x7F) == 0x00
            and (int(message[7]) & 0x7F) == 0x12
            and (int(message[8]) & 0x7F) == 0x01
        ):
            return {"frame_type": "heartbeat"}

        if (int(message[5]) & 0x7F) != 0x09 or (int(message[6]) & 0x7F) != 0x00:
            return None

        if len(message) >= 14 and (int(message[7]) & 0x7F, int(message[8]) & 0x7F) == (0x01, 0x02):
            return {
                "frame_type": "program_status",
                "program": int((int(message[12]) & 0x0F) + ((int(message[13]) & 0x0F) << 4)),
                "command": [0x01, 0x02],
            }

        if len(message) >= 14 and (int(message[7]) & 0x7F, int(message[8]) & 0x7F) == (0x01, 0x01):
            return {
                "frame_type": "panel_status",
                "control_value": int((int(message[12]) & 0x0F) + ((int(message[13]) & 0x0F) << 4)),
                "command": [0x01, 0x01],
            }
        return None

    async def import_syx_bytes(
        self, data: bytes, source_name: str = "<upload>", skip_duplicates: bool = True
    ) -> Dict[str, Any]:
        from app.services.intelfx_syx_parser import IntelFXSyxParser, deduplicate_programs

        parser = IntelFXSyxParser()
        try:
            programs = parser.parse_bytes(data, source_name=source_name)
        except Exception as exc:
            logger.error("SysEx parse error: %s", exc)
            return {"imported": 0, "skipped": 0, "errors": [str(exc)]}

        if skip_duplicates:
            programs = deduplicate_programs(programs)
        return await self._import_parsed_programs(programs, source_name=source_name, skip_duplicates=skip_duplicates)


_intelfx_service: Optional[IntelFXService] = None


def get_intelfx_service() -> IntelFXService:
    global _intelfx_service
    if _intelfx_service is None:
        _intelfx_service = IntelFXService()
    return _intelfx_service
