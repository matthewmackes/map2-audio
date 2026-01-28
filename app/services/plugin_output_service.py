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
    timestamp: float = field(default_factory=time.time)


@dataclass
class TunerData:
    """Tuner data from analyser plugins."""
    uri: str
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


class PluginOutputService:
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
        
        # Subscribers
        self._subscribers: List[Callable] = []
        
        # Running state
        self._running = False
        self._task: Optional[asyncio.Task] = None
        
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
            
    def register_plugin(self, uri: str, output_ports: List[OutputPort]) -> None:
        """Register a plugin and its output ports."""
        for port in output_ports:
            if port.designation in (OutputDesignation.METER, OutputDesignation.GAIN_REDUCTION):
                self._peak_meters[uri][port.symbol] = PeakMeter()
            self._output_values[uri][port.index] = port.min_value
            
    def unregister_plugin(self, uri: str) -> None:
        """Unregister a plugin."""
        self._peak_meters.pop(uri, None)
        self._output_values.pop(uri, None)
        self._tuner_data.pop(uri, None)
        self._spectrum_data.pop(uri, None)
        
    def update_output_port(self, uri: str, port_index: int, value: float) -> None:
        """Update an output port value."""
        self._output_values[uri][port_index] = value
        
    def update_peak_meter(self, uri: str, port_symbol: str, samples: List[float]) -> None:
        """Update peak meter with audio samples."""
        if uri in self._peak_meters and port_symbol in self._peak_meters[uri]:
            self._peak_meters[uri][port_symbol].process_samples(samples)
            
    def update_tuner_data(self, uri: str, data: TunerData) -> None:
        """Update tuner data."""
        self._tuner_data[uri] = data
        
    def update_spectrum_data(self, uri: str, data: SpectrumData) -> None:
        """Update spectrum data."""
        self._spectrum_data[uri] = data
        
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
        for uri, meters in self._peak_meters.items():
            for symbol, meter in meters.items():
                peak_data = meter.get_levels()
                peak_data.uri = uri
                peak_data.port_symbol = symbol
                updates.append({
                    "type": "peak_update",
                    "data": {
                        "uri": peak_data.uri,
                        "port_symbol": peak_data.port_symbol,
                        "peak": peak_data.peak,
                        "rms": peak_data.rms,
                        "hold_peak": peak_data.hold_peak,
                        "is_clipping": peak_data.is_clipping,
                        "timestamp": peak_data.timestamp
                    }
                })
                
        # Collect output port values
        for uri, ports in self._output_values.items():
            for port_index, value in ports.items():
                updates.append({
                    "type": "output_port_update",
                    "data": {
                        "uri": uri,
                        "port_index": port_index,
                        "value": value,
                        "timestamp": time.time()
                    }
                })
                
        # Collect tuner data
        for uri, data in self._tuner_data.items():
            updates.append({
                "type": "tuner_update",
                "data": {
                    "uri": data.uri,
                    "frequency_hz": data.frequency_hz,
                    "note_name": data.note_name,
                    "octave": data.octave,
                    "cents_deviation": data.cents_deviation,
                    "confidence": data.confidence,
                    "timestamp": data.timestamp
                }
            })
            
        # Collect spectrum data
        for uri, data in self._spectrum_data.items():
            updates.append({
                "type": "spectrum_update",
                "data": {
                    "uri": data.uri,
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


# Singleton instance
_output_service: Optional[PluginOutputService] = None


def get_output_service() -> PluginOutputService:
    """Get the global plugin output service instance."""
    global _output_service
    if _output_service is None:
        _output_service = PluginOutputService()
    return _output_service


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
