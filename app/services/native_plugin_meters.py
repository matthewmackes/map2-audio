"""
Native Plugin Metering Service

Provides real-time audio level tracking for native MAP2 plugins.
Integrates with the JUCE audio engine to get actual VU levels.
"""

import logging
import asyncio
from typing import Dict, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime, timedelta
import numpy as np
from threading import Lock

logger = logging.getLogger(__name__)


@dataclass
class PluginLevels:
    """Audio level data for a single plugin."""
    input_level: float = -60.0      # Current input RMS in dBFS
    output_level: float = -60.0     # Current output RMS in dBFS
    peak_input: float = -60.0       # Peak input level (with hold)
    peak_output: float = -60.0      # Peak output level (with hold)
    gain_reduction: float = 0.0     # For compressors (dB)
    last_update: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> Dict[str, float]:
        """Convert to dictionary for API responses."""
        return {
            "inputLevel": self.input_level,
            "outputLevel": self.output_level,
            "peakInput": self.peak_input,
            "peakOutput": self.peak_output,
            "gainReduction": self.gain_reduction,
        }


class NativePluginMeterService:
    """
    Centralized metering service for native plugins.

    Tracks audio levels for each native plugin and provides
    consistent level data to the API routes.
    """

    # Plugin name to URI mapping
    PLUGIN_NAMES = {
        "nam": "http://map2-audio.local/nam-loader",
        "cabinet": "http://map2-audio.local/ir-cabinet-loader",
        "reverb": "http://map2-audio.local/ir-reverb-loader",
        "delay": "http://map2-audio.local/cocoa-delay",
        "autotune": "http://map2-audio.local/zita-at1",
        "triplespread": "http://map2-audio.local/triplespread",
        "valentine": "http://map2-audio.local/valentine",
        "zlequalizer": "http://map2-audio.local/zlequalizer",
        "freeverb3": "http://map2-audio.local/freeverb3",
        "whammy": "http://github.com/davemollen/dm-Whammy",
        "dragonfly": "https://github.com/michaelwillis/dragonfly-reverb",
    }

    def __init__(self):
        self._levels: Dict[str, PluginLevels] = {}
        self._lock = Lock()
        self._decay_rate = 20.0  # dB per second for level decay
        self._peak_hold_time = 1.5  # seconds

        # Initialize levels for all plugins
        for plugin_name in self.PLUGIN_NAMES:
            self._levels[plugin_name] = PluginLevels()

    def update_levels(
        self,
        plugin_name: str,
        input_level: float,
        output_level: float,
        gain_reduction: float = 0.0
    ) -> None:
        """
        Update levels for a plugin.

        Args:
            plugin_name: Plugin identifier (e.g., "nam", "cabinet")
            input_level: Input RMS level in dBFS
            output_level: Output RMS level in dBFS
            gain_reduction: Gain reduction for compressors (dB, positive)
        """
        with self._lock:
            if plugin_name not in self._levels:
                self._levels[plugin_name] = PluginLevels()

            levels = self._levels[plugin_name]
            now = datetime.now()

            # Update RMS levels
            levels.input_level = input_level
            levels.output_level = output_level
            levels.gain_reduction = gain_reduction

            # Update peak hold
            if input_level > levels.peak_input:
                levels.peak_input = input_level
            if output_level > levels.peak_output:
                levels.peak_output = output_level

            levels.last_update = now

    def update_from_audio(
        self,
        plugin_name: str,
        input_audio: np.ndarray,
        output_audio: np.ndarray,
        gain_reduction: float = 0.0
    ) -> None:
        """
        Update levels by calculating from audio buffers.

        Args:
            plugin_name: Plugin identifier
            input_audio: Input audio samples
            output_audio: Output audio samples
            gain_reduction: Gain reduction for compressors
        """
        input_rms = self._calculate_rms_db(input_audio)
        output_rms = self._calculate_rms_db(output_audio)
        self.update_levels(plugin_name, input_rms, output_rms, gain_reduction)

    def get_levels(self, plugin_name: str) -> Dict[str, float]:
        """
        Get current levels for a plugin.

        Args:
            plugin_name: Plugin identifier

        Returns:
            Dictionary with inputLevel, outputLevel, peakInput, peakOutput
        """
        with self._lock:
            if plugin_name not in self._levels:
                return PluginLevels().to_dict()

            levels = self._levels[plugin_name]
            now = datetime.now()
            elapsed = (now - levels.last_update).total_seconds()

            # Apply decay if no recent updates
            if elapsed > 0.1:  # More than 100ms since last update
                decay = self._decay_rate * elapsed

                # Decay levels towards -60 dB
                input_level = max(-60.0, levels.input_level - decay)
                output_level = max(-60.0, levels.output_level - decay)

                # Reset peaks after hold time
                if elapsed > self._peak_hold_time:
                    peak_input = input_level
                    peak_output = output_level
                else:
                    peak_input = levels.peak_input
                    peak_output = levels.peak_output

                return {
                    "inputLevel": round(input_level, 1),
                    "outputLevel": round(output_level, 1),
                    "peakInput": round(peak_input, 1),
                    "peakOutput": round(peak_output, 1),
                    "gainReduction": round(levels.gain_reduction, 1),
                }

            return {
                "inputLevel": round(levels.input_level, 1),
                "outputLevel": round(levels.output_level, 1),
                "peakInput": round(levels.peak_input, 1),
                "peakOutput": round(levels.peak_output, 1),
                "gainReduction": round(levels.gain_reduction, 1),
            }

    def get_all_levels(self) -> Dict[str, Dict[str, float]]:
        """
        Get levels for all plugins.

        Returns:
            Dictionary mapping plugin names to their level data
        """
        result = {}
        for plugin_name in self.PLUGIN_NAMES:
            result[plugin_name] = self.get_levels(plugin_name)
        return result

    def reset_plugin(self, plugin_name: str) -> None:
        """Reset levels for a specific plugin."""
        with self._lock:
            if plugin_name in self._levels:
                self._levels[plugin_name] = PluginLevels()

    def reset_all(self) -> None:
        """Reset levels for all plugins."""
        with self._lock:
            for plugin_name in self._levels:
                self._levels[plugin_name] = PluginLevels()

    @staticmethod
    def _calculate_rms_db(audio: np.ndarray, min_db: float = -60.0) -> float:
        """
        Calculate RMS level in dBFS from audio samples.

        Args:
            audio: Audio samples as numpy array
            min_db: Minimum dB value for silence

        Returns:
            RMS level in dBFS
        """
        if audio is None or len(audio) == 0:
            return min_db

        # Handle multi-channel audio
        if audio.ndim > 1:
            audio = audio.flatten()

        # Calculate RMS
        rms = np.sqrt(np.mean(np.square(audio)))

        if rms <= 0:
            return min_db

        # Convert to dBFS
        db = 20.0 * np.log10(rms)
        return max(db, min_db)


# Global instance
_meter_service: Optional[NativePluginMeterService] = None


def get_native_plugin_meters() -> NativePluginMeterService:
    """Get the global native plugin metering service instance."""
    global _meter_service
    if _meter_service is None:
        _meter_service = NativePluginMeterService()
    return _meter_service
