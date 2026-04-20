"""
Shared JUCE audio engine service imports, constants, and module discovery.
"""

import asyncio
import logging
import sys
from collections import defaultdict, deque
from pathlib import Path
from typing import Optional, List, Dict, Any
from dataclasses import dataclass

from app.services.juce_parameter_schema import (
    actual_to_normalized,
    coerce_actual_parameter_value,
    get_parameter_specs,
    is_fixed_native_processor_uri,
    normalized_to_actual,
    native_fixed_processor_slug,
)
from app.services.juce_runtime_metering_service import JuceRuntimeMeteringService
from app.services.juce_runtime_midi_service import JuceRuntimeMidiService
from app.services.plugin_uris import (
    LEXICON_MPX1_URI,
    build_lexicon_mpx1_plugin_descriptor,
)
from app.utils.singleton import Singleton
from app.utils.dependencies import DependencyChecker
from app.utils.logging_utils import get_logger

logger = get_logger(__name__)

def _discover_juce_module_build_dirs(project_root: Path) -> list[Path]:
    """Return candidate JUCE build dirs ordered by newest engine module first."""
    candidates: list[tuple[float, Path]] = []
    for build_dir in (project_root / "build", project_root / "juce-engine" / "build"):
        module_files = list(build_dir.glob("map2_audio_engine*.so"))
        if not module_files:
            continue
        newest_mtime = max(module_file.stat().st_mtime for module_file in module_files)
        candidates.append((newest_mtime, build_dir))
    return [path for _mtime, path in sorted(candidates, key=lambda item: item[0], reverse=True)]


def _configure_juce_module_search_path(project_root: Path) -> list[str]:
    """Insert candidate build dirs into sys.path with the freshest module first."""
    ordered_dirs = _discover_juce_module_build_dirs(project_root)
    ordered_paths = [str(path) for path in ordered_dirs]
    for path in ordered_paths:
        while path in sys.path:
            sys.path.remove(path)
    for path in reversed(ordered_paths):
        sys.path.insert(0, path)
    return ordered_paths


# FIX #5: Use repo-relative build discovery instead of hardcoded import order.
# When multiple build outputs exist, prefer the freshest engine module so stale
# artifacts do not silently hide newer chain/topology APIs from the live service.
_project_root = Path(__file__).resolve().parents[3]
_juce_build_paths = _configure_juce_module_search_path(_project_root)

# Check JUCE availability using dependency checker
JUCE_AVAILABLE, juce_engine = DependencyChecker.check('map2_audio_engine')

if JUCE_AVAILABLE and juce_engine:
    logger.info(
        f"JUCE Audio Engine loaded: {juce_engine.get_version()} "
        f"from {getattr(juce_engine, '__file__', 'unknown')}"
    )
else:
    logger.warning("JUCE Audio Engine not available")


# Hotone Jogg USB Audio Interface constants
HOTONE_JOGG = {
    "vendor_id": "84ef",
    "product_id": "0014",
    "name": "Jogg USB Audio",
    "manufacturer": "HotoneAudio",
    "alsa_device": "hw:0,0",
    "alsa_device_alt": "hw:1,0",
    "sample_rate": 48000,
    "input_channels": 2,
    "output_channels": 2,
    "format": "S24_3LE",
    "period_size": 64,
    "buffer_size": 64,
}

# Edirol UA-1000 Hi-Speed USB Audio Interface constants
EDIROL_UA1000 = {
    "vendor_id": "0582",
    "product_id": "0044",
    "name": "Edirol UA-1000",
    "manufacturer": "Roland",
    "alsa_device": "hw:UA1000",
    "alsa_device_alt": "hw:1,0",
    "sample_rate": 48000,
    "input_channels": 10,  # 4 analog + 2 S/PDIF + 8 ADAT (shared optical)
    "output_channels": 10,  # 8 analog + 2 S/PDIF (+ ADAT optical)
    "format": "S24_3LE",
    "period_size": 64,
    "buffer_size": 64,
}


@dataclass
class AudioEngineConfig:
    """Audio engine configuration - defaults to Edirol UA-1000"""
    sample_rate: int = EDIROL_UA1000["sample_rate"]
    # RT-LATENCY FIX: Must match the PipeWire force-quantum (64/48000 = 1.33 ms/period).
    # The previous value of 256 was passed to set_buffer_size(), overriding the C++
    # DEFAULT_BUFFER_SIZE=64 defined in Common.h and accumulating 4× PipeWire periods
    # (~5.3 ms) inside the JUCE JACK client before the first processBlock() call.
    # EDIROL_UA1000["buffer_size"] is 64, which aligns with clock.force-quantum=64.
    buffer_size: int = EDIROL_UA1000["buffer_size"]
    audio_device: str = EDIROL_UA1000["alsa_device"]
    input_channels: int = EDIROL_UA1000["input_channels"]
    output_channels: int = EDIROL_UA1000["output_channels"]
    input_channel_mode: str = "stereo"
    input_gain_db: float = 0.0
    output_gain_db: float = 0.0
    enable_midi: bool = True
    lv2_path: str = "/usr/lib64/lv2:/usr/lib/lv2:/usr/local/lib/lv2"
    config_file: str = ""



__all__ = [name for name in globals() if not name.startswith("__")]
