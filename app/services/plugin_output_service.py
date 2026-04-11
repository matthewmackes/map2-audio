"""
LV2 Plugin Output Service

Handles real-time plugin output data including:
- Peak meter data from audio ports
- Control output port values (meters, gain reduction, etc.)
- Tuner data from analyser plugins
- Spectrum data from FFT plugins

Based on LV2 UI extension (lv2plug.in/ns/extensions/ui) protocols:
- peakProtocol for audio level metering
- floatProtocol for control port values
- atomTransfer for structured data (tuner, spectrum)
"""

import asyncio
import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Callable, Any
from collections import defaultdict
import math

from app.utils.singleton import Singleton

logger = logging.getLogger(__name__)


class OutputDesignation(Enum):
    """Output port designation types for visualization."""
    METER = "meter"
    GAIN_REDUCTION = "gain_reduction"
    LATENCY = "latency"
    TUNER_FREQUENCY = "tuner_frequency"
    TUNER_NOTE = "tuner_note"
    SPECTRUM = "spectrum"
    ENVELOPE = "envelope"
    GENERIC = "generic"


class PortProtocol(Enum):
    """LV2 UI port protocols."""
    FLOAT = "floatProtocol"
    PEAK = "peakProtocol"
    ATOM_TRANSFER = "atomTransfer"
    EVENT_TRANSFER = "eventTransfer"


@dataclass
class OutputPort:
    """Output port metadata for visualization."""
    index: int
    symbol: str
    name: str
    min_value: float
    max_value: float
    designation: OutputDesignation = OutputDesignation.GENERIC
    unit: Optional[str] = None
    is_logarithmic: bool = False


@dataclass
class PluginUIInfo:
    """Plugin UI capabilities and metadata."""
    has_native_ui: bool = False
    ui_types: List[str] = field(default_factory=list)
    has_mod_gui: bool = False
    mod_gui_url: Optional[str] = None
    output_ports: List[OutputPort] = field(default_factory=list)
    has_tuner: bool = False
    has_spectrum: bool = False
    has_meters: bool = False
    port_notifications: List[Dict] = field(default_factory=list)


@dataclass
class PeakData:
    """Real-time peak meter data."""
    uri: str
    port_symbol: str
    instance_id: Optional[int] = None
    plugin_position: Optional[int] = None
    peak: float = 0.0
    rms: float = 0.0
    hold_peak: float = 0.0
    is_clipping: bool = False
    timestamp: float = field(default_factory=time.time)


@dataclass
class OutputPortValue:
    """Real-time output port value."""
    uri: str
    port_index: int
    symbol: str
    value: float
    instance_id: Optional[int] = None
    plugin_position: Optional[int] = None
    timestamp: float = field(default_factory=time.time)


@dataclass
class TunerData:
    """Tuner data from analyser plugins."""
    uri: str
    instance_id: Optional[int] = None
    plugin_position: Optional[int] = None
    frequency_hz: float = 0.0
    note_name: str = "A"
    octave: int = 4
    cents_deviation: float = 0.0
    confidence: float = 0.0
    timestamp: float = field(default_factory=time.time)


@dataclass
class SpectrumData:
    """Spectrum analyzer data."""
    uri: str
    instance_id: Optional[int] = None
    plugin_position: Optional[int] = None
    frequencies: List[float] = field(default_factory=list)
    magnitudes: List[float] = field(default_factory=list)
    bin_count: int = 0
    sample_rate: int = 48000
    timestamp: float = field(default_factory=time.time)


class PeakMeter:
    """
    Real-time peak meter with RMS calculation and peak hold.
    
    Implements the LV2 peakProtocol behavior with:
    - Instantaneous peak detection
    - RMS level calculation
    - Peak hold with configurable decay
    - Clip detection
    """
    
    def __init__(
        self,
        sample_rate: int = 48000,
        hold_time_ms: float = 1500.0,
        decay_rate_db_per_sec: float = 20.0,
        clip_threshold: float = 0.99
    ):
        self.sample_rate = sample_rate
        self.hold_time_ms = hold_time_ms
        self.decay_rate = decay_rate_db_per_sec
        self.clip_threshold = clip_threshold
        
        # State
        self._peak: float = 0.0
        self._rms: float = 0.0
        self._hold_peak: float = 0.0
        self._hold_timestamp: float = 0.0
        self._is_clipping: bool = False
        self._rms_sum: float = 0.0
        self._rms_count: int = 0
        
    def process_samples(self, samples: List[float]) -> None:
        """Process a block of audio samples."""
        if not samples:
            return
            
        # Find peak
        abs_samples = [abs(s) for s in samples]
        block_peak = max(abs_samples)
        
        if block_peak > self._peak:
            self._peak = block_peak
            
        # Check clipping
        if block_peak >= self.clip_threshold:
            self._is_clipping = True
            
        # Update peak hold
        current_time = time.time()
        if block_peak > self._hold_peak:
            self._hold_peak = block_peak
            self._hold_timestamp = current_time
        elif (current_time - self._hold_timestamp) * 1000 > self.hold_time_ms:
            # Decay hold peak
            decay_amount = self.decay_rate * (current_time - self._hold_timestamp) / 1000.0
            # Convert from dB decay to linear
            decay_linear = 10 ** (-decay_amount / 20)
            self._hold_peak *= decay_linear
            
        # Calculate RMS
        self._rms_sum += sum(s * s for s in samples)
        self._rms_count += len(samples)
        
    def get_levels(self) -> PeakData:
        """Get current meter levels."""
        rms = math.sqrt(self._rms_sum / max(1, self._rms_count)) if self._rms_count > 0 else 0.0
        
        data = PeakData(
            uri="",  # Set by caller
            port_symbol="",  # Set by caller
            peak=self._peak,
            rms=rms,
            hold_peak=self._hold_peak,
            is_clipping=self._is_clipping,
            timestamp=time.time()
        )
        
        # Reset for next measurement period
        self._peak = 0.0
        self._rms_sum = 0.0
        self._rms_count = 0
        # Don't reset clipping until explicitly cleared
        
        return data
    
    def clear_clip(self) -> None:
        """Clear the clipping indicator."""
        self._is_clipping = False
        
    def reset(self) -> None:
        """Reset all meter state."""
        self._peak = 0.0
        self._rms = 0.0
        self._hold_peak = 0.0
        self._hold_timestamp = 0.0
        self._is_clipping = False
        self._rms_sum = 0.0
        self._rms_count = 0


class PluginOutputService(Singleton):
    """
    Service for managing plugin output data streams.
    
    Handles collection and distribution of:
    - Peak meter data
    - Output port values
    - Tuner data
    - Spectrum data
    """
    
    def __init__(self, update_rate_hz: float = 30.0):
        self.update_rate = update_rate_hz
        self.update_interval = 1.0 / update_rate_hz
        
        # Peak meters per plugin/port
        self._peak_meters: Dict[str, Dict[str, PeakMeter]] = defaultdict(dict)
        
        # Output port values per plugin
        self._output_values: Dict[str, Dict[int, float]] = defaultdict(dict)
        
        # Tuner data per plugin
        self._tuner_data: Dict[str, TunerData] = {}
        
        # Spectrum data per plugin
        self._spectrum_data: Dict[str, SpectrumData] = {}

        # Runtime identity metadata per tracked plugin
        self._plugin_identity: Dict[str, Dict[str, Optional[int] | str]] = {}
        
        # Subscribers
        self._subscribers: List[Callable] = []
        
        # Running state
        self._running = False
        self._task: Optional[asyncio.Task] = None

    @staticmethod
    def _normalize_instance_id(instance_id: Optional[int]) -> Optional[int]:
        return instance_id if isinstance(instance_id, int) and instance_id > 0 else None

    @staticmethod
    def _normalize_plugin_position(plugin_position: Optional[int]) -> Optional[int]:
        return plugin_position if isinstance(plugin_position, int) and plugin_position >= 0 else None

    def _plugin_key(
        self,
        uri: str,
        instance_id: Optional[int] = None,
        plugin_position: Optional[int] = None,
    ) -> str:
        normalized_instance_id = self._normalize_instance_id(instance_id)
        if normalized_instance_id is not None:
            return f"instance:{normalized_instance_id}"

        normalized_plugin_position = self._normalize_plugin_position(plugin_position)
        if normalized_plugin_position is not None:
            return f"position:{uri}:{normalized_plugin_position}"

        return uri

    def _remember_plugin_identity(
        self,
        uri: str,
        instance_id: Optional[int] = None,
        plugin_position: Optional[int] = None,
    ) -> str:
        plugin_key = self._plugin_key(uri, instance_id, plugin_position)
        self._plugin_identity[plugin_key] = {
            "uri": uri,
            "instance_id": self._normalize_instance_id(instance_id),
            "plugin_position": self._normalize_plugin_position(plugin_position),
        }
        return plugin_key
        
    async def start(self) -> None:
        """Start the output service update loop."""
        if self._running:
            return
            
        self._running = True
        self._task = asyncio.create_task(self._update_loop())
        logger.info(f"Plugin output service started at {self.update_rate}Hz")
        
    async def stop(self) -> None:
        """Stop the output service."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Plugin output service stopped")
        
    def subscribe(self, callback: Callable) -> None:
        """Subscribe to output data updates."""
        self._subscribers.append(callback)
        
    def unsubscribe(self, callback: Callable) -> None:
        """Unsubscribe from output data updates."""
        if callback in self._subscribers:
            self._subscribers.remove(callback)
            
    def register_plugin(
        self,
        uri: str,
        output_ports: List[OutputPort],
        instance_id: Optional[int] = None,
        plugin_position: Optional[int] = None,
    ) -> None:
        """Register a plugin and its output ports."""
        plugin_key = self._remember_plugin_identity(uri, instance_id, plugin_position)
        for port in output_ports:
            if port.designation in (OutputDesignation.METER, OutputDesignation.GAIN_REDUCTION):
                self._peak_meters[plugin_key][port.symbol] = PeakMeter()
            self._output_values[plugin_key][port.index] = port.min_value

    def unregister_plugin(
        self,
        uri: str,
        instance_id: Optional[int] = None,
        plugin_position: Optional[int] = None,
    ) -> None:
        """Unregister a plugin."""
        plugin_key = self._plugin_key(uri, instance_id, plugin_position)
        if (
            self._normalize_instance_id(instance_id) is None
            and self._normalize_plugin_position(plugin_position) is None
        ):
            matching_keys = [
                key for key, identity in self._plugin_identity.items()
                if identity.get("uri") == uri
            ]
        else:
            matching_keys = [plugin_key]

        for key in matching_keys:
            self._peak_meters.pop(key, None)
            self._output_values.pop(key, None)
            self._tuner_data.pop(key, None)
            self._spectrum_data.pop(key, None)
            self._plugin_identity.pop(key, None)

    def update_output_port(
        self,
        uri: str,
        port_index: int,
        value: float,
        instance_id: Optional[int] = None,
        plugin_position: Optional[int] = None,
    ) -> None:
        """Update an output port value."""
        plugin_key = self._remember_plugin_identity(uri, instance_id, plugin_position)
        self._output_values[plugin_key][port_index] = value

    def update_peak_meter(
        self,
        uri: str,
        port_symbol: str,
        samples: List[float],
        instance_id: Optional[int] = None,
        plugin_position: Optional[int] = None,
    ) -> None:
        """Update peak meter with audio samples."""
        plugin_key = self._remember_plugin_identity(uri, instance_id, plugin_position)
        if plugin_key in self._peak_meters and port_symbol in self._peak_meters[plugin_key]:
            self._peak_meters[plugin_key][port_symbol].process_samples(samples)

    def update_tuner_data(
        self,
        uri: str,
        data: TunerData,
        instance_id: Optional[int] = None,
        plugin_position: Optional[int] = None,
    ) -> None:
        """Update tuner data."""
        plugin_key = self._remember_plugin_identity(uri, instance_id, plugin_position)
        data.uri = uri
        data.instance_id = self._normalize_instance_id(instance_id)
        data.plugin_position = self._normalize_plugin_position(plugin_position)
        self._tuner_data[plugin_key] = data

    def update_spectrum_data(
        self,
        uri: str,
        data: SpectrumData,
        instance_id: Optional[int] = None,
        plugin_position: Optional[int] = None,
    ) -> None:
        """Update spectrum data."""
        plugin_key = self._remember_plugin_identity(uri, instance_id, plugin_position)
        data.uri = uri
        data.instance_id = self._normalize_instance_id(instance_id)
        data.plugin_position = self._normalize_plugin_position(plugin_position)
        self._spectrum_data[plugin_key] = data
        
    async def _update_loop(self) -> None:
        """Main update loop for collecting and distributing data."""
        while self._running:
            try:
                await asyncio.sleep(self.update_interval)
                await self._broadcast_updates()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in output service update loop: {e}")
                
    async def _broadcast_updates(self) -> None:
        """Broadcast all current data to subscribers."""
        if not self._subscribers:
            return
            
        updates = []
        
        # Collect peak data
        for plugin_key, meters in self._peak_meters.items():
            identity = self._plugin_identity.get(plugin_key, {"uri": plugin_key, "instance_id": None, "plugin_position": None})
            for symbol, meter in meters.items():
                peak_data = meter.get_levels()
                peak_data.uri = str(identity["uri"])
                peak_data.instance_id = self._normalize_instance_id(identity.get("instance_id"))  # type: ignore[arg-type]
                peak_data.plugin_position = self._normalize_plugin_position(identity.get("plugin_position"))  # type: ignore[arg-type]
                peak_data.port_symbol = symbol
                updates.append({
                    "type": "peak_update",
                    "data": {
                        "uri": peak_data.uri,
                        "instance_id": peak_data.instance_id,
                        "plugin_position": peak_data.plugin_position,
                        "port_symbol": peak_data.port_symbol,
                        "peak": peak_data.peak,
                        "rms": peak_data.rms,
                        "hold_peak": peak_data.hold_peak,
                        "is_clipping": peak_data.is_clipping,
                        "timestamp": peak_data.timestamp
                    }
                })
                
        # Collect output port values
        for plugin_key, ports in self._output_values.items():
            identity = self._plugin_identity.get(plugin_key, {"uri": plugin_key, "instance_id": None, "plugin_position": None})
            for port_index, value in ports.items():
                updates.append({
                    "type": "output_port_update",
                    "data": {
                        "uri": identity["uri"],
                        "instance_id": self._normalize_instance_id(identity.get("instance_id")),  # type: ignore[arg-type]
                        "plugin_position": self._normalize_plugin_position(identity.get("plugin_position")),  # type: ignore[arg-type]
                        "port_index": port_index,
                        "value": value,
                        "timestamp": time.time()
                    }
                })
                
        # Collect tuner data
        for plugin_key, data in self._tuner_data.items():
            identity = self._plugin_identity.get(plugin_key, {"uri": data.uri, "instance_id": data.instance_id, "plugin_position": data.plugin_position})
            updates.append({
                "type": "tuner_update",
                "data": {
                    "uri": identity["uri"],
                    "instance_id": self._normalize_instance_id(identity.get("instance_id")),  # type: ignore[arg-type]
                    "plugin_position": self._normalize_plugin_position(identity.get("plugin_position")),  # type: ignore[arg-type]
                    "frequency_hz": data.frequency_hz,
                    "note_name": data.note_name,
                    "octave": data.octave,
                    "cents_deviation": data.cents_deviation,
                    "confidence": data.confidence,
                    "timestamp": data.timestamp
                }
            })
            
        # Collect spectrum data
        for plugin_key, data in self._spectrum_data.items():
            identity = self._plugin_identity.get(plugin_key, {"uri": data.uri, "instance_id": data.instance_id, "plugin_position": data.plugin_position})
            updates.append({
                "type": "spectrum_update",
                "data": {
                    "uri": identity["uri"],
                    "instance_id": self._normalize_instance_id(identity.get("instance_id")),  # type: ignore[arg-type]
                    "plugin_position": self._normalize_plugin_position(identity.get("plugin_position")),  # type: ignore[arg-type]
                    "frequencies": data.frequencies,
                    "magnitudes": data.magnitudes,
                    "bin_count": data.bin_count,
                    "sample_rate": data.sample_rate,
                    "timestamp": data.timestamp
                }
            })
            
        # Broadcast to all subscribers
        for callback in self._subscribers:
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(updates)
                else:
                    callback(updates)
            except Exception as e:
                logger.error(f"Error in output service subscriber: {e}")


def get_output_service() -> PluginOutputService:
    """Get the global plugin output service instance."""
    return PluginOutputService.get_instance()


def reset_output_service() -> None:
    PluginOutputService.reset_instance()


def detect_output_designation(name: str, symbol: str) -> OutputDesignation:
    """
    Detect output port designation from name/symbol patterns.
    
    Common patterns in LV2 plugins:
    - *meter*, *level*, *vu* -> METER
    - *gain_reduction*, *gr*, *reduction* -> GAIN_REDUCTION
    - *latency* -> LATENCY
    - *freq*, *frequency*, *pitch* -> TUNER_FREQUENCY
    - *note* -> TUNER_NOTE
    - *spectrum*, *fft*, *bin* -> SPECTRUM
    - *envelope*, *env*, *follower* -> ENVELOPE
    """
    name_lower = name.lower()
    symbol_lower = symbol.lower()
    combined = f"{name_lower} {symbol_lower}"
    
    # Meter patterns
    meter_patterns = ['meter', 'level', 'vu', 'peak', 'rms', 'db']
    if any(p in combined for p in meter_patterns):
        return OutputDesignation.METER
        
    # Gain reduction patterns
    gr_patterns = ['gain_reduction', 'gainreduction', 'gr', 'reduction', 'compress']
    if any(p in combined for p in gr_patterns):
        return OutputDesignation.GAIN_REDUCTION
        
    # Latency
    if 'latency' in combined or 'delay_samples' in combined:
        return OutputDesignation.LATENCY
        
    # Tuner frequency
    if any(p in combined for p in ['freq', 'frequency', 'pitch', 'hz']):
        return OutputDesignation.TUNER_FREQUENCY
        
    # Tuner note
    if 'note' in combined:
        return OutputDesignation.TUNER_NOTE
        
    # Spectrum
    if any(p in combined for p in ['spectrum', 'fft', 'bin', 'magnitud']):
        return OutputDesignation.SPECTRUM
        
    # Envelope
    if any(p in combined for p in ['envelope', 'env', 'follower', 'detect']):
        return OutputDesignation.ENVELOPE
        
    return OutputDesignation.GENERIC
