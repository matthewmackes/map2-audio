"""
Latency Analyzer and Compensator
Automatic plugin latency detection and phase-aligned compensation.

Features:
- Impulse response latency measurement
- LV2 latency port reading
- Automatic delay compensation
- Phase-aligned signal processing
- RT-safe delay lines with pre-allocated buffers
"""

import logging
import numpy as np
from typing import Dict, Optional, List
from collections import deque

logger = logging.getLogger(__name__)


class LatencyAnalyzer:
    """Measure plugin processing latency."""
    
    def __init__(self, sample_rate: int = 48000):
        """Initialize latency analyzer.
        
        Args:
            sample_rate: Audio sample rate
        """
        self.sample_rate = sample_rate
        self.measured_latencies: Dict[str, int] = {}
    
    def measure_plugin_latency_impulse(self, plugin_uri: str, process_func, buffer_size: int = 1024) -> int:
        """Measure plugin latency using impulse response.
        
        Args:
            plugin_uri: Plugin URI
            process_func: Plugin process function
            buffer_size: Test buffer size
            
        Returns:
            Latency in samples
        """
        try:
            # Create impulse (delta function)
            impulse = np.zeros((buffer_size, 2), dtype=np.float32)
            impulse[0, :] = 1.0
            
            # Process through plugin
            output = process_func(impulse)
            
            # Find peak location in output
            # Peak location = latency in samples
            peak_left = np.argmax(np.abs(output[:, 0]))
            peak_right = np.argmax(np.abs(output[:, 1]))
            
            # Use maximum of both channels
            latency_samples = max(peak_left, peak_right)
            
            self.measured_latencies[plugin_uri] = latency_samples
            logger.info(f"Measured latency for {plugin_uri}: {latency_samples} samples "
                       f"({latency_samples * 1000.0 / self.sample_rate:.2f}ms)")
            
            return latency_samples
            
        except Exception as e:
            logger.error(f"Error measuring latency for {plugin_uri}: {e}")
            return 0
    
    def get_reported_latency_lv2(self, plugin_info, plugin_instance) -> Optional[int]:
        """Get latency from LV2 plugin's latency port.
        
        Args:
            plugin_info: LV2PluginInfo object
            plugin_instance: Active plugin instance
            
        Returns:
            Latency in samples or None
        """
        if not plugin_info.has_latency or plugin_info.latency_port_index is None:
            return None
        
        try:
            # Read latency port value
            latency_port = plugin_info.latency_port_index
            latency_samples = int(plugin_instance.get_port_value(latency_port))
            
            self.measured_latencies[plugin_info.uri] = latency_samples
            logger.debug(f"Plugin {plugin_info.uri} reports {latency_samples} samples latency")
            
            return latency_samples
            
        except Exception as e:
            logger.warning(f"Could not read latency port for {plugin_info.uri}: {e}")
            return None
    
    def get_latency(self, plugin_uri: str) -> int:
        """Get measured or reported latency for plugin.
        
        Args:
            plugin_uri: Plugin URI
            
        Returns:
            Latency in samples (0 if unknown)
        """
        return self.measured_latencies.get(plugin_uri, 0)
    
    def samples_to_ms(self, samples: int) -> float:
        """Convert samples to milliseconds.
        
        Args:
            samples: Sample count
            
        Returns:
            Time in milliseconds
        """
        return (samples * 1000.0) / self.sample_rate


class LatencyCompensator:
    """Phase-aligned latency compensation with RT-safe delay lines."""
    
    def __init__(self, sample_rate: int = 48000, max_latency_samples: int = 8192):
        """Initialize latency compensator.
        
        Args:
            sample_rate: Audio sample rate
            max_latency_samples: Maximum latency to compensate (default 170ms @ 48kHz)
        """
        self.sample_rate = sample_rate
        self.max_latency = max_latency_samples
        
        # Delay lines per plugin (pre-allocated)
        self.delay_buffers: Dict[str, np.ndarray] = {}
        self.delay_write_pos: Dict[str, int] = {}
        self.delay_amounts: Dict[str, int] = {}
        
        # Chain compensation settings
        self.compensation_enabled = True
        self.max_chain_latency = 0
        
        logger.info(f"Latency compensator initialized: max {max_latency_samples} samples "
                   f"({max_latency_samples * 1000.0 / sample_rate:.1f}ms)")
    
    def allocate_delay_line(self, plugin_uri: str, channels: int = 2) -> None:
        """Pre-allocate delay buffer for a plugin (RT-safe preparation).
        
        Args:
            plugin_uri: Plugin URI
            channels: Number of audio channels
        """
        if plugin_uri not in self.delay_buffers:
            # Pre-allocate circular buffer
            self.delay_buffers[plugin_uri] = np.zeros((self.max_latency, channels), dtype=np.float32)
            self.delay_write_pos[plugin_uri] = 0
            self.delay_amounts[plugin_uri] = 0
            logger.debug(f"Allocated delay line for {plugin_uri}: {self.max_latency} samples")
    
    def set_compensation_delay(self, plugin_uri: str, delay_samples: int) -> None:
        """Set compensation delay for a plugin.
        
        Args:
            plugin_uri: Plugin URI
            delay_samples: Delay in samples
        """
        if delay_samples > self.max_latency:
            logger.warning(f"Requested delay {delay_samples} exceeds maximum {self.max_latency}, clamping")
            delay_samples = self.max_latency
        
        self.delay_amounts[plugin_uri] = delay_samples
        logger.debug(f"Set compensation delay for {plugin_uri}: {delay_samples} samples")
    
    def process_with_compensation(self, plugin_uri: str, audio: np.ndarray) -> np.ndarray:
        """Process audio with latency compensation (RT-safe).
        
        Args:
            plugin_uri: Plugin URI
            audio: Input audio buffer [samples, channels]
            
        Returns:
            Delayed audio buffer
        """
        if not self.compensation_enabled or plugin_uri not in self.delay_amounts:
            return audio
        
        delay_samples = self.delay_amounts[plugin_uri]
        if delay_samples == 0:
            return audio
        
        # Ensure delay line exists
        if plugin_uri not in self.delay_buffers:
            self.allocate_delay_line(plugin_uri, audio.shape[1])
        
        delay_buffer = self.delay_buffers[plugin_uri]
        write_pos = self.delay_write_pos[plugin_uri]
        buffer_size = len(audio)
        channels = audio.shape[1]
        
        # Output buffer
        output = np.zeros_like(audio)
        
        # Process sample by sample (circular buffer)
        for i in range(buffer_size):
            # Read from delay line
            read_pos = (write_pos - delay_samples) % self.max_latency
            output[i] = delay_buffer[read_pos]
            
            # Write new sample
            delay_buffer[write_pos] = audio[i]
            
            # Advance write position
            write_pos = (write_pos + 1) % self.max_latency
        
        # Update write position
        self.delay_write_pos[plugin_uri] = write_pos
        
        return output
    
    def calculate_chain_compensation(self, chain_latencies: Dict[str, int]) -> Dict[str, int]:
        """Calculate compensation delays for entire chain.
        
        Each plugin is delayed by (max_latency - its_own_latency) to align phases.
        
        Args:
            chain_latencies: Dict of plugin_uri -> latency_samples
            
        Returns:
            Dict of plugin_uri -> compensation_delay_samples
        """
        if not chain_latencies:
            return {}
        
        # Find maximum latency in chain
        max_latency = max(chain_latencies.values())
        self.max_chain_latency = max_latency
        
        # Calculate compensation for each plugin
        compensations = {}
        for plugin_uri, latency in chain_latencies.items():
            compensation = max_latency - latency
            compensations[plugin_uri] = compensation
            self.set_compensation_delay(plugin_uri, compensation)
        
        logger.info(f"Chain compensation calculated: max latency {max_latency} samples "
                   f"({max_latency * 1000.0 / self.sample_rate:.2f}ms)")
        
        return compensations
    
    def get_total_chain_latency(self) -> int:
        """Get total chain latency after compensation.
        
        Returns:
            Total latency in samples
        """
        return self.max_chain_latency
    
    def enable_compensation(self, enabled: bool = True) -> None:
        """Enable or disable latency compensation.
        
        Args:
            enabled: True to enable, False to disable
        """
        self.compensation_enabled = enabled
        logger.info(f"Latency compensation {'enabled' if enabled else 'disabled'}")
    
    def reset_delay_lines(self) -> None:
        """Reset all delay line buffers (clear audio)."""
        for uri in self.delay_buffers:
            self.delay_buffers[uri].fill(0)
            self.delay_write_pos[uri] = 0
        logger.debug("Reset all delay line buffers")
    
    def get_status(self) -> Dict:
        """Get compensator status.
        
        Returns:
            Status dict
        """
        return {
            "enabled": self.compensation_enabled,
            "max_latency_samples": self.max_latency,
            "max_latency_ms": self.max_latency * 1000.0 / self.sample_rate,
            "chain_latency_samples": self.max_chain_latency,
            "chain_latency_ms": self.max_chain_latency * 1000.0 / self.sample_rate,
            "active_delay_lines": len(self.delay_buffers),
            "compensated_plugins": list(self.delay_amounts.keys())
        }


# Global instances
_latency_analyzer: Optional[LatencyAnalyzer] = None
_latency_compensator: Optional[LatencyCompensator] = None


def get_latency_analyzer(sample_rate: int = 48000) -> LatencyAnalyzer:
    """Get or create latency analyzer instance."""
    global _latency_analyzer
    if _latency_analyzer is None:
        _latency_analyzer = LatencyAnalyzer(sample_rate)
    return _latency_analyzer


def get_latency_compensator(sample_rate: int = 48000, max_latency: int = 8192) -> LatencyCompensator:
    """Get or create latency compensator instance."""
    global _latency_compensator
    if _latency_compensator is None:
        _latency_compensator = LatencyCompensator(sample_rate, max_latency)
    return _latency_compensator
