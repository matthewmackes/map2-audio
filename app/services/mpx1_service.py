"""
MPX1 MIDI bridge service.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.services.sysex_device_bridge import SysExDeviceBridge

logger = logging.getLogger(__name__)

try:
    import rtmidi  # type: ignore

    RTMIDI_AVAILABLE = True
except ImportError:
    RTMIDI_AVAILABLE = False
    rtmidi = None
    logger.warning("python-rtmidi not installed, MPX1 MIDI I/O running in simulation mode")

_SIMULATOR_ENABLED = os.environ.get("MPX1_SIMULATOR", "").strip() in ("1", "true", "yes")

if _SIMULATOR_ENABLED and not RTMIDI_AVAILABLE:
    try:
        import pathlib as _pathlib
        import sys as _sys

        _tests_dir = str(_pathlib.Path(__file__).resolve().parents[2] / "tests")
        if _tests_dir not in _sys.path:
            _sys.path.insert(0, _tests_dir)
        from mpx1_simulator import MPX1Simulator, SimulatedMidiIn, SimulatedMidiOut, get_simulator  # type: ignore

        _SIMULATOR_ACTIVE = True
        logger.info("MPX1 SysEx simulator activated")
    except ImportError:
        _SIMULATOR_ACTIVE = False
        logger.warning("MPX1_SIMULATOR requested but mpx1_simulator module not found")
else:
    _SIMULATOR_ACTIVE = False


class MPX1Service(SysExDeviceBridge):
    DEVICE_LABEL = "MPX1"
    DEVICE_TOPIC = "mpx1"
    BRIDGE_ID = "mpx1_service"
    REGISTRY_FILENAME = "mpx1_params.json"
    SHADOW_FILENAME = "mpx1_shadow.json"
    LIBRARY_FILENAME = "mpx1_library.json"
    MIDI_MAPS_FILENAME = "mpx1_midi_maps.json"
    HUB_INPUT_PORT_ID = "consumer:mpx1_in"
    HUB_OUTPUT_PORT_ID = "consumer:mpx1_out"
    HUB_INPUT_NAME = "MPX1 Input"
    HUB_OUTPUT_NAME = "MPX1 Output"
    VIRTUAL_INPUT_NAME = "Virtual MPX1 Input"
    VIRTUAL_OUTPUT_NAME = "Virtual MPX1 Output"
    DEFAULT_NAME_HINT = "mpx"
    PORT_MATCH_ALIASES: Tuple[str, ...] = ("lexicon",)
    DEFAULT_PROGRAM_SLOTS = 250
    PING_PARAM_ID = "program.pitch.algorithm"
    _SYSEX_PREFIX = [0xF0, 0x06, 0x7F, 0x11]
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

    def _default_library_entries(self) -> List[Dict[str, Any]]:
        curated_names = [
            "Vocal Hall Gold", "Studio Plate A", "Stereo Tape Echo", "Wide Chorus Air", "Pitch Shift +5th",
            "Ambient Glass Pad", "LoFi Room Wash", "Dual Delay Pulse", "Thick Guitar Plate", "Bright Drum Room",
            "Reverse Bloom", "Cathedral Sky", "Edge Of Cloud", "Motion Flanger", "Dream Choir Gate",
            "Arena Vocal Lift", "Dark Plate Vox", "Shimmer Octave", "Tape Flutter", "MicroShift Double",
            "Big Snare Hall", "Tight Drum Plate", "Analog Slap", "Ping Pong Swell", "Neon Chorus Lead",
            "Formant Sweep", "Octaver Crush", "Subtle Widener", "Glass Delay Wash", "Cinematic Rise",
            "Hallway Verb", "Room Glue", "Mega Sustain", "Punch Delay", "Stereo Drift",
            "Airy Ensemble", "Wide Bloom", "Depth Field", "Crystal Mod", "Plate + Echo",
            "Epic Tail", "Shoegaze Drift", "Lush Vox Hall", "Edge Delay", "Guitar Arena",
            "Sparkle Verb", "Pulse Chorus", "Modulated Space", "Mono Slap Pro", "Go-To Vocal Plate",
        ]
        curated_tags = [
            ["vocal", "go-to", "lush"], ["vocal", "plate"], ["delay", "guitar"], ["chorus", "wide"], ["pitch", "guitar"],
            ["ambient", "epic"], ["ambient", "lofi"], ["delay", "rhythmic"], ["guitar", "plate"], ["drums", "room"],
            ["ambient", "fx"], ["ambient", "epic"], ["ambient", "shoegaze"], ["mod", "guitar"], ["fx", "vocal"],
            ["vocal", "arena"], ["vocal", "dark"], ["pitch", "ambient"], ["delay", "lofi"], ["vocal", "double"],
            ["drums", "snare"], ["drums", "plate"], ["delay", "slap"], ["delay", "pingpong"], ["chorus", "lead"],
            ["pitch", "fx"], ["pitch", "bass"], ["utility", "wide"], ["delay", "ambient"], ["fx", "epic"],
            ["room", "utility"], ["room", "mix"], ["sustain", "guitar"], ["delay", "punch"], ["mod", "stereo"],
            ["chorus", "vocal"], ["ambient", "lush"], ["ambient", "depth"], ["mod", "crystal"], ["plate", "delay"],
            ["epic", "tail"], ["shoegaze", "ambient"], ["vocal", "lush"], ["delay", "guitar"], ["guitar", "arena"],
            ["reverb", "sparkle"], ["chorus", "pulse"], ["mod", "space"], ["delay", "mono"], ["vocal", "go-to"],
        ]
        entries: List[Dict[str, Any]] = []
        for index, name in enumerate(curated_names):
            tags = curated_tags[index] if index < len(curated_tags) else ["curated"]
            entries.append(
                {
                    "program": index,
                    "name": name,
                    "tags": tags,
                    "rating": 2 if ("go-to" in tags or "epic" in tags) else 1,
                    "type": tags[0] if tags else "general",
                }
            )
        return entries

    def decode_param_sysex(self, message: List[int]) -> Optional[Dict[str, Any]]:
        if len(message) < 10 or int(message[0]) & 0xFF != 0xF0:
            return None
        if (int(message[1]) & 0x7F) != 0x06:
            return None
        if int(message[-1]) & 0xFF != self._SYSEX_SUFFIX:
            return None

        for offset in [4, 5]:
            decoded = self._decode_param_sysex_at_offset(message, offset)
            if decoded is not None:
                return decoded
        return None

    def decode_extended_sysex(self, message: List[int]) -> Optional[Dict[str, Any]]:
        if len(message) < 8 or int(message[0]) & 0xFF != 0xF0:
            return None
        if (int(message[1]) & 0x7F) != 0x06:
            return None
        if int(message[-1]) & 0xFF != self._SYSEX_SUFFIX:
            return None

        if (
            (int(message[2]) & 0x7F) == 0x12
            and (int(message[3]) & 0x7F) == 0x00
            and (int(message[4]) & 0x7F) == 0x12
            and (int(message[5]) & 0x7F) == 0x01
        ):
            return {"frame_type": "heartbeat"}

        if (int(message[2]) & 0x7F) != 0x09 or (int(message[3]) & 0x7F) != 0x00:
            return None

        if len(message) >= 11 and (int(message[4]) & 0x7F, int(message[5]) & 0x7F) == (0x01, 0x02):
            return {
                "frame_type": "program_status",
                "program": int((int(message[9]) & 0x0F) + ((int(message[10]) & 0x0F) << 4)),
                "command": [0x01, 0x02],
            }

        if len(message) >= 11 and (int(message[4]) & 0x7F, int(message[5]) & 0x7F) == (0x01, 0x01):
            return {
                "frame_type": "panel_status",
                "control_value": int((int(message[9]) & 0x0F) + ((int(message[10]) & 0x0F) << 4)),
                "command": [0x01, 0x01],
            }
        return None

    async def import_syx_bytes(
        self, data: bytes, source_name: str = "<upload>", skip_duplicates: bool = True
    ) -> Dict[str, Any]:
        from app.services.mpx1_syx_parser import MPX1SyxParser, deduplicate_programs

        parser = MPX1SyxParser()
        try:
            programs = parser.parse_bytes(data, source_name=source_name)
        except Exception as exc:
            logger.error("SysEx parse error: %s", exc)
            return {"imported": 0, "skipped": 0, "errors": [str(exc)]}

        if skip_duplicates:
            programs = deduplicate_programs(programs)
        return await self._import_parsed_programs(programs, source_name=source_name, skip_duplicates=skip_duplicates)


_mpx1_service: Optional[MPX1Service] = None


def get_mpx1_service() -> MPX1Service:
    global _mpx1_service
    if _mpx1_service is None:
        _mpx1_service = MPX1Service()
    return _mpx1_service
