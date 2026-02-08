"""
JUCE Audio Engine Service
MAP2 Audio Engine - JUCE-based LV2 host

Provides Python wrapper for MAP2 Audio Engine
"""

import asyncio
import logging
import sys
from pathlib import Path
from typing import Optional, List, Dict, Any
from dataclasses import dataclass

from app.utils.singleton import Singleton
from app.utils.dependencies import DependencyChecker
from app.utils.logging_utils import get_logger

logger = get_logger(__name__)

# FIX #5: Use relative path instead of hardcoded absolute path
# This allows deployment to any location
juce_build_path = str(Path(__file__).parent.parent.parent / "juce-engine" / "build")
sys.path.insert(0, juce_build_path)

# Check JUCE availability using dependency checker
JUCE_AVAILABLE, juce_engine = DependencyChecker.check('map2_audio_engine')

if JUCE_AVAILABLE and juce_engine:
    logger.info(f"JUCE Audio Engine loaded: {juce_engine.get_version()}")
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
    buffer_size: int = EDIROL_UA1000["buffer_size"]
    audio_device: str = EDIROL_UA1000["alsa_device"]
    input_channels: int = EDIROL_UA1000["input_channels"]
    output_channels: int = EDIROL_UA1000["output_channels"]
    enable_midi: bool = True
    lv2_path: str = "/usr/lib64/lv2:/usr/lib/lv2:/usr/local/lib/lv2"
    config_file: str = ""


class JuceEngineService(Singleton):
    """JUCE Audio Engine Service - MAP2 audio processing engine"""

    def __init__(self, config: Optional[AudioEngineConfig] = None) -> None:
        super().__init__()
        self.config = config or AudioEngineConfig()
        self._engine = None
        self._initialized = False

    async def initialize(self) -> bool:
        """Initialize engine with full configuration"""
        if not JUCE_AVAILABLE:
            logger.error("JUCE Audio Engine not available")
            return False

        try:
            # Create engine instance
            self._engine = juce_engine.create_engine()

            # Configure (sync, immediate)
            self._engine.set_sample_rate(self.config.sample_rate)
            self._engine.set_buffer_size(self.config.buffer_size)
            self._engine.set_audio_device(self.config.audio_device)
            self._engine.set_lv2_path(self.config.lv2_path)

            # Configure channel counts (for multi-channel interfaces like UA-1000)
            self._engine.set_num_input_channels(self.config.input_channels)
            self._engine.set_num_output_channels(self.config.output_channels)
            logger.info(f"Configuring audio: {self.config.input_channels} inputs, "
                       f"{self.config.output_channels} outputs")

            # FIX #7: Wrap blocking C++ initialization call in asyncio.to_thread()
            # This prevents the entire event loop from freezing during engine init
            result = await asyncio.to_thread(
                self._engine.initialize,
                self.config.config_file
            )
            
            if result:
                # Enable MIDI if configured
                if self.config.enable_midi:
                    self._engine.enable_midi(True)
                
                self._initialized = True
                logger.info(f"JUCE Audio Engine initialized: {self._engine.get_version()}")
                logger.info(f"Config: {self._engine.get_system_info()}")
            else:
                logger.error("JUCE Audio Engine initialization failed")
            
            return result
        except Exception as e:
            logger.error(f"Failed to initialize JUCE: {e}")
            import traceback
            traceback.print_exc()
            return False

    async def shutdown(self) -> None:
        """Shutdown engine"""
        if self._engine:
            try:
                self._engine.stop_audio()
                self._engine.shutdown()
            except Exception as e:
                logger.error(f"Error during shutdown: {e}")
        
        self._engine = None
        self._initialized = False
        logger.info("JUCE Audio Engine shutdown")

    # Audio Control
    
    async def start_audio(self) -> bool:
        """Start audio processing"""
        if not self._engine or not self._initialized:
            return False
        # FIX #7: Wrap blocking audio start in asyncio.to_thread()
        return await asyncio.to_thread(self._engine.start_audio)
    
    async def stop_audio(self) -> bool:
        """Stop audio processing"""
        if not self._engine:
            return False
        # FIX #7: Wrap blocking audio stop in asyncio.to_thread()
        return await asyncio.to_thread(self._engine.stop_audio)
    
    def is_audio_running(self) -> bool:
        """Check if audio is running"""
        if not self._engine:
            return False
        return self._engine.is_audio_running()

    # Plugin Management
    
    async def list_plugins(self) -> List[Dict[str, Any]]:
        """List available LV2 plugins"""
        if not self._engine:
            return []
        # FIX #7: Wrap blocking plugin listing in asyncio.to_thread()
        return await asyncio.to_thread(self._engine.list_plugins)
    
    async def load_plugin(self, uri: str) -> int:
        """Load a plugin by URI, returns instance ID"""
        if not self._engine:
            return -1
        # FIX #7: Wrap blocking plugin loading in asyncio.to_thread()
        # Plugin loading involves disk I/O and DSP initialization - can take hundreds of ms
        return await asyncio.to_thread(self._engine.load_plugin, uri)
    
    async def unload_plugin(self, instance_id: int) -> bool:
        """Unload a plugin by instance ID"""
        if not self._engine:
            return False
        # FIX #7: Wrap blocking plugin unloading in asyncio.to_thread()
        return await asyncio.to_thread(self._engine.unload_plugin, instance_id)
    
    # Pedalboard Management
    
    async def get_current_pedalboard(self) -> Dict[str, Any]:
        """Get current pedalboard configuration"""
        if not self._engine:
            return {"name": "none", "plugins": [], "items": []}
        return self._engine.get_current_pedalboard()
    
    # Chain Management
    
    async def get_chain_order(self) -> List[int]:
        """Get current plugin chain order"""
        if not self._engine:
            return []
        return self._engine.get_chain_order()
    
    async def reorder_chain(self, order: List[int]) -> bool:
        """Reorder plugin chain"""
        if not self._engine:
            return False
        return self._engine.reorder_chain(order)
    
    # Parameter Control

    def _get_instance_id_for_uri(self, plugin_uri: str) -> Optional[int]:
        """Look up instance_id for a plugin URI in the current chain."""
        if not self._engine:
            return None
        try:
            pedalboard = self._engine.get_current_pedalboard()
            for item in pedalboard.get("items", []):
                if item.get("uri") == plugin_uri:
                    return item.get("instance_id")
        except Exception as e:
            logger.error(f"Error looking up instance_id for {plugin_uri}: {e}")
        return None

    async def set_parameter(self, plugin_uri: str, param_name: str, value: float) -> bool:
        """Set a plugin parameter using plugin URI"""
        if not self._engine:
            logger.error("Cannot set parameter: engine not initialized")
            return False
        instance_id = self._get_instance_id_for_uri(plugin_uri)
        if instance_id is None:
            logger.error(f"Plugin not found in chain: {plugin_uri}")
            return False
        logger.debug(f"Setting parameter: instance_id={instance_id}, param={param_name}, value={value}")
        try:
            result = self._engine.set_parameter_by_name(instance_id, param_name, value)
            if not result:
                logger.error(f"Engine returned False for set_parameter({instance_id}, {param_name}, {value})")
            return result
        except Exception as e:
            logger.error(f"Exception in set_parameter: {e}")
            return False

    async def set_parameter_direct(self, instance_id: int, param_name: str, value: float) -> bool:
        """Set a plugin parameter directly by instance ID"""
        if not self._engine:
            return False
        return self._engine.set_parameter_by_name(instance_id, param_name, value)

    async def get_parameter(self, plugin_uri: str, param_name: str) -> float:
        """Get a plugin parameter value"""
        if not self._engine:
            return 0.0
        instance_id = self._get_instance_id_for_uri(plugin_uri)
        if instance_id is None:
            logger.error(f"Plugin not found in chain: {plugin_uri}")
            return 0.0
        return self._engine.get_parameter_by_name(instance_id, param_name)

    async def set_bypass(self, instance_id: int, bypass: bool) -> bool:
        """Set plugin bypass state"""
        if not self._engine:
            return False
        return self._engine.set_bypass(instance_id, bypass)
    
    # Snapshot Management
    
    async def get_current_snapshot(self) -> int:
        """Get current snapshot ID (0-5)"""
        if not self._engine:
            return 0
        return self._engine.get_current_snapshot()
    
    async def load_snapshot(self, snapshot_id: int) -> bool:
        """Load a snapshot (0-5)"""
        if not self._engine or snapshot_id < 0 or snapshot_id > 5:
            return False
        return self._engine.load_snapshot(snapshot_id)
    
    async def list_snapshots(self) -> List[Dict[str, Any]]:
        """List all available snapshots"""
        if not self._engine:
            return []
        return self._engine.list_snapshots()
    
    # MIDI Support

    async def enable_midi(self, enable: bool) -> bool:
        """Enable or disable MIDI"""
        if not self._engine:
            return False
        return self._engine.enable_midi(enable)

    async def get_midi_devices(self) -> List[str]:
        """List available MIDI devices"""
        if not self._engine:
            return []
        return self._engine.get_midi_devices()

    async def get_midi_input_devices(self) -> List[Dict[str, Any]]:
        """List MIDI input devices"""
        if not self._engine:
            return []
        try:
            return self._engine.get_midi_input_devices()
        except AttributeError:
            # Fallback if method doesn't exist
            devices = self._engine.get_midi_devices()
            return [{"index": i, "name": d, "type": "input"} for i, d in enumerate(devices)]

    async def get_midi_output_devices(self) -> List[Dict[str, Any]]:
        """List MIDI output devices"""
        if not self._engine:
            return []
        try:
            return self._engine.get_midi_output_devices()
        except AttributeError:
            return []

    async def open_midi_input(self, device_index: int) -> bool:
        """Open a MIDI input device"""
        if not self._engine:
            return False
        try:
            return self._engine.open_midi_input(device_index)
        except AttributeError:
            logger.warning("JUCE engine does not support open_midi_input")
            return False

    async def close_midi_input(self) -> bool:
        """Close the current MIDI input device"""
        if not self._engine:
            return False
        try:
            return self._engine.close_midi_input()
        except AttributeError:
            return False

    async def open_midi_output(self, device_index: int) -> bool:
        """Open a MIDI output device"""
        if not self._engine:
            return False
        try:
            return self._engine.open_midi_output(device_index)
        except AttributeError:
            logger.warning("JUCE engine does not support open_midi_output")
            return False

    async def close_midi_output(self) -> bool:
        """Close the current MIDI output device"""
        if not self._engine:
            return False
        try:
            return self._engine.close_midi_output()
        except AttributeError:
            return False

    async def get_midi_status(self) -> Dict[str, Any]:
        """Get comprehensive MIDI status"""
        if not self._engine:
            return {
                "enabled": False,
                "running": False,
                "input_device": None,
                "output_device": None,
                "mappings_count": 0,
                "learning": False,
            }
        try:
            return self._engine.get_midi_status()
        except AttributeError:
            return {
                "enabled": self._engine.is_midi_enabled() if hasattr(self._engine, 'is_midi_enabled') else False,
                "running": self._initialized,
                "input_device": None,
                "output_device": None,
                "mappings_count": 0,
                "learning": False,
            }

    # MIDI CC Mappings (JUCE)

    async def add_midi_cc_mapping(self, channel: int, cc_number: int,
                                   plugin_uri: str, param_index: int) -> bool:
        """Add MIDI CC to parameter mapping via JUCE"""
        if not self._engine:
            return False
        try:
            return self._engine.add_cc_mapping(channel, cc_number, plugin_uri, param_index)
        except AttributeError:
            logger.warning("JUCE engine does not support add_cc_mapping")
            return False

    async def remove_midi_cc_mapping(self, channel: int, cc_number: int) -> bool:
        """Remove MIDI CC mapping via JUCE"""
        if not self._engine:
            return False
        try:
            return self._engine.remove_cc_mapping(channel, cc_number)
        except AttributeError:
            logger.warning("JUCE engine does not support remove_cc_mapping")
            return False

    async def get_midi_cc_mappings(self) -> List[Dict[str, Any]]:
        """Get all MIDI CC mappings from JUCE"""
        if not self._engine:
            return []
        try:
            return self._engine.get_cc_mappings()
        except AttributeError:
            return []

    async def clear_midi_cc_mappings(self) -> bool:
        """Clear all MIDI CC mappings via JUCE"""
        if not self._engine:
            return False
        try:
            return self._engine.clear_cc_mappings()
        except AttributeError:
            return False

    # MIDI Learn (JUCE)

    async def start_midi_learn(self, plugin_uri: str, param_index: int) -> bool:
        """Start MIDI learn mode for a parameter via JUCE"""
        if not self._engine:
            return False
        try:
            return self._engine.start_midi_learn(plugin_uri, param_index)
        except AttributeError:
            logger.warning("JUCE engine does not support start_midi_learn")
            return False

    async def stop_midi_learn(self) -> bool:
        """Stop MIDI learn mode via JUCE"""
        if not self._engine:
            return False
        try:
            return self._engine.stop_midi_learn()
        except AttributeError:
            return False

    async def is_midi_learning(self) -> bool:
        """Check if MIDI learn is active via JUCE"""
        if not self._engine:
            return False
        try:
            return self._engine.is_midi_learning()
        except AttributeError:
            return False

    async def get_midi_learn_status(self) -> Dict[str, Any]:
        """Get MIDI learn status from JUCE"""
        if not self._engine:
            return {"active": False, "target_plugin": None, "target_param": None}
        try:
            return self._engine.get_midi_learn_status()
        except AttributeError:
            return {"active": False, "target_plugin": None, "target_param": None}
    
    # VU Meters

    async def get_vu_levels(self) -> Dict[str, float]:
        """Get master input/output VU levels"""
        if not self._engine:
            return {
                "input_left": 0.0,
                "input_right": 0.0,
                "output_left": 0.0,
                "output_right": 0.0
            }
        return self._engine.get_vu_levels()

    async def get_plugin_vu_levels(self) -> List[Dict[str, Any]]:
        """Get per-plugin VU levels"""
        if not self._engine:
            return []
        return self._engine.get_plugin_vu_levels()

    # ========================================
    # Spectrum Analysis (NEW)
    # ========================================

    async def get_spectrum(self) -> Dict[str, Any]:
        """Get FFT spectrum data"""
        if not self._engine:
            return {
                "magnitudes": [],
                "frequencies": [],
                "peak_frequency": 0.0,
                "peak_magnitude": -100.0,
                "spectral_centroid": 0.0
            }
        return self._engine.get_spectrum()

    async def get_spectrum_magnitudes(self) -> List[float]:
        """Get spectrum magnitude array"""
        if not self._engine:
            return []
        return self._engine.get_spectrum_magnitudes()

    async def get_spectrum_frequencies(self) -> List[float]:
        """Get spectrum frequency array"""
        if not self._engine:
            return []
        return self._engine.get_spectrum_frequencies()

    # ========================================
    # LUFS Loudness Metering (NEW)
    # ========================================

    async def get_lufs_levels(self) -> Dict[str, float]:
        """Get LUFS loudness levels"""
        if not self._engine:
            return {
                "momentary": -100.0,
                "short_term": -100.0,
                "integrated": -100.0,
                "range": 0.0,
                "true_peak": -100.0,
                "true_peak_left": -100.0,
                "true_peak_right": -100.0
            }
        return self._engine.get_lufs_levels()

    async def reset_integrated_loudness(self) -> None:
        """Reset integrated loudness measurement"""
        if self._engine:
            self._engine.reset_integrated_loudness()

    # ========================================
    # Phase Correlation (NEW)
    # ========================================

    async def get_phase_correlation(self) -> float:
        """Get stereo phase correlation (-1 to +1)"""
        if not self._engine:
            return 0.0
        return self._engine.get_phase_correlation()

    async def get_stereo_balance(self) -> float:
        """Get stereo balance (-1=left, 0=center, +1=right)"""
        if not self._engine:
            return 0.0
        return self._engine.get_stereo_balance()

    async def get_stereo_width(self) -> float:
        """Get stereo width (0=mono, 1=full stereo)"""
        if not self._engine:
            return 0.0
        return self._engine.get_stereo_width()

    async def get_stereo_info(self) -> Dict[str, float]:
        """Get combined stereo analysis info"""
        if not self._engine:
            return {
                "phase_correlation": 0.0,
                "balance": 0.0,
                "width": 0.0
            }
        return {
            "phase_correlation": self._engine.get_phase_correlation(),
            "balance": self._engine.get_stereo_balance(),
            "width": self._engine.get_stereo_width()
        }

    # ========================================
    # CPU Monitoring (NEW)
    # ========================================

    async def get_cpu_metrics(self) -> Dict[str, Any]:
        """Get detailed CPU metrics"""
        if not self._engine:
            return {
                "total_cpu_percent": 0.0,
                "audio_callback_percent": 0.0,
                "peak_cpu_percent": 0.0,
                "average_cpu_percent": 0.0,
                "xrun_count": 0,
                "budget_ms": 0.0,
                "current_callback_ms": 0.0,
                "headroom_percent": 100.0,
                "per_plugin_percent": {}
            }
        return self._engine.get_cpu_metrics()

    async def get_total_cpu(self) -> float:
        """Get total CPU usage percentage"""
        if not self._engine:
            return 0.0
        return self._engine.get_total_cpu()

    async def get_plugin_cpu(self, instance_id: int) -> float:
        """Get CPU usage for a specific plugin"""
        if not self._engine:
            return 0.0
        return self._engine.get_plugin_cpu(instance_id)

    async def get_xrun_count(self) -> int:
        """Get number of audio dropouts (xruns)"""
        if not self._engine:
            return 0
        return self._engine.get_xrun_count()

    # ========================================
    # Latency (NEW)
    # ========================================

    async def get_total_latency_samples(self) -> int:
        """Get total chain latency in samples"""
        if not self._engine:
            return 0
        return self._engine.get_total_latency_samples()

    async def get_total_latency_ms(self) -> float:
        """Get total chain latency in milliseconds"""
        if not self._engine:
            return 0.0
        return self._engine.get_total_latency_ms()

    async def get_latency_breakdown(self) -> List[Dict[str, Any]]:
        """Get per-plugin latency breakdown"""
        if not self._engine:
            return []
        return self._engine.get_latency_breakdown()

    # ========================================
    # Sidechain Routing (NEW)
    # ========================================

    async def connect_sidechain(self, source: int, dest: int, dest_bus: int = 1) -> bool:
        """Connect sidechain from source to dest plugin"""
        if not self._engine:
            return False
        return self._engine.connect_sidechain(source, dest, dest_bus)

    async def disconnect_sidechain(self, dest: int, dest_bus: int = 1) -> bool:
        """Disconnect sidechain from dest plugin"""
        if not self._engine:
            return False
        return self._engine.disconnect_sidechain(dest, dest_bus)

    async def get_sidechain_connections(self) -> List[Dict[str, Any]]:
        """Get all sidechain connections"""
        if not self._engine:
            return []
        return self._engine.get_sidechain_connections()

    # ========================================
    # Convolution / IR Processing (NEW)
    # ========================================

    async def load_cabinet_ir(self, path: str) -> bool:
        """Load cabinet impulse response"""
        if not self._engine:
            return False
        return self._engine.load_cabinet_ir(path)

    async def load_reverb_ir(self, path: str) -> bool:
        """Load reverb impulse response"""
        if not self._engine:
            return False
        return self._engine.load_reverb_ir(path)

    async def unload_cabinet_ir(self) -> None:
        """Unload cabinet IR"""
        if self._engine:
            self._engine.unload_cabinet_ir()

    async def unload_reverb_ir(self) -> None:
        """Unload reverb IR"""
        if self._engine:
            self._engine.unload_reverb_ir()

    async def set_cabinet_mix(self, mix: float) -> None:
        """Set cabinet dry/wet mix (0.0-1.0)"""
        if self._engine:
            self._engine.set_cabinet_mix(mix)

    async def set_reverb_mix(self, mix: float) -> None:
        """Set reverb dry/wet mix (0.0-1.0)"""
        if self._engine:
            self._engine.set_reverb_mix(mix)

    async def set_cabinet_bypass(self, bypass: bool) -> None:
        """Bypass cabinet IR"""
        if self._engine:
            self._engine.set_cabinet_bypass(bypass)

    async def set_reverb_bypass(self, bypass: bool) -> None:
        """Bypass reverb IR"""
        if self._engine:
            self._engine.set_reverb_bypass(bypass)

    async def get_cabinet_ir_info(self) -> Dict[str, Any]:
        """Get cabinet IR info"""
        if not self._engine:
            return {
                "name": "",
                "path": "",
                "channels": 0,
                "length_samples": 0,
                "length_ms": 0.0,
                "sample_rate": 0.0,
                "loaded": False
            }
        return self._engine.get_cabinet_ir_info()

    async def get_reverb_ir_info(self) -> Dict[str, Any]:
        """Get reverb IR info"""
        if not self._engine:
            return {
                "name": "",
                "path": "",
                "channels": 0,
                "length_samples": 0,
                "length_ms": 0.0,
                "sample_rate": 0.0,
                "loaded": False
            }
        return self._engine.get_reverb_ir_info()

    # ========================================
    # Dynamics - Compressor (NEW)
    # ========================================

    async def set_compressor_threshold(self, db: float) -> None:
        """Set compressor threshold in dB (-60 to 0)"""
        if self._engine:
            self._engine.set_compressor_threshold(db)

    async def set_compressor_ratio(self, ratio: float) -> None:
        """Set compressor ratio (1 to 20)"""
        if self._engine:
            self._engine.set_compressor_ratio(ratio)

    async def set_compressor_attack(self, ms: float) -> None:
        """Set compressor attack time in ms (0.1 to 500)"""
        if self._engine:
            self._engine.set_compressor_attack(ms)

    async def set_compressor_release(self, ms: float) -> None:
        """Set compressor release time in ms (10 to 5000)"""
        if self._engine:
            self._engine.set_compressor_release(ms)

    async def set_compressor_knee(self, db: float) -> None:
        """Set compressor knee width in dB (0 to 24)"""
        if self._engine:
            self._engine.set_compressor_knee(db)

    async def set_compressor_makeup_gain(self, db: float) -> None:
        """Set compressor makeup gain in dB (-12 to 24)"""
        if self._engine:
            self._engine.set_compressor_makeup_gain(db)

    async def set_compressor_auto_makeup(self, enabled: bool) -> None:
        """Enable/disable auto makeup gain"""
        if self._engine:
            self._engine.set_compressor_auto_makeup(enabled)

    async def set_compressor_bypass(self, bypass: bool) -> None:
        """Bypass compressor"""
        if self._engine:
            self._engine.set_compressor_bypass(bypass)

    async def get_compressor_parameters(self) -> Dict[str, Any]:
        """Get all compressor parameters"""
        if not self._engine:
            return {
                "threshold": -12.0,
                "ratio": 4.0,
                "attack": 10.0,
                "release": 100.0,
                "knee": 6.0,
                "makeup_gain": 0.0,
                "auto_makeup": False,
                "bypass": False
            }
        return self._engine.get_compressor_parameters()

    async def set_compressor_parameters(self, params: Dict[str, Any]) -> None:
        """Set all compressor parameters at once"""
        if self._engine:
            self._engine.set_compressor_parameters(params)

    async def get_compressor_metering(self) -> Dict[str, float]:
        """Get compressor metering (input, output, gain reduction)"""
        if not self._engine:
            return {
                "input_level": -100.0,
                "output_level": -100.0,
                "gain_reduction": 0.0,
                "input_rms": -100.0,
                "output_rms": -100.0
            }
        return self._engine.get_compressor_metering()

    # ========================================
    # Dynamics - Limiter (NEW)
    # ========================================

    async def set_limiter_threshold(self, db: float) -> None:
        """Set limiter ceiling/threshold in dB"""
        if self._engine:
            self._engine.set_limiter_threshold(db)

    async def set_limiter_release(self, ms: float) -> None:
        """Set limiter release time in ms"""
        if self._engine:
            self._engine.set_limiter_release(ms)

    async def set_limiter_bypass(self, bypass: bool) -> None:
        """Bypass limiter"""
        if self._engine:
            self._engine.set_limiter_bypass(bypass)

    async def get_limiter_parameters(self) -> Dict[str, Any]:
        """Get all limiter parameters"""
        if not self._engine:
            return {
                "threshold": -1.0,
                "release": 100.0,
                "bypass": False
            }
        return self._engine.get_limiter_parameters()

    async def get_limiter_metering(self) -> Dict[str, float]:
        """Get limiter metering (input, output, gain reduction)"""
        if not self._engine:
            return {
                "input_level": -100.0,
                "output_level": -100.0,
                "gain_reduction": 0.0,
                "input_rms": -100.0,
                "output_rms": -100.0
            }
        return self._engine.get_limiter_metering()

    # ========================================
    # Dynamics - Noise Gate (NEW)
    # ========================================

    async def set_gate_threshold(self, db: float) -> None:
        """Set noise gate threshold in dB"""
        if self._engine:
            self._engine.set_gate_threshold(db)

    async def set_gate_ratio(self, ratio: float) -> None:
        """Set noise gate ratio"""
        if self._engine:
            self._engine.set_gate_ratio(ratio)

    async def set_gate_attack(self, ms: float) -> None:
        """Set noise gate attack time in ms"""
        if self._engine:
            self._engine.set_gate_attack(ms)

    async def set_gate_release(self, ms: float) -> None:
        """Set noise gate release time in ms"""
        if self._engine:
            self._engine.set_gate_release(ms)

    async def set_gate_bypass(self, bypass: bool) -> None:
        """Bypass noise gate"""
        if self._engine:
            self._engine.set_gate_bypass(bypass)

    async def get_gate_parameters(self) -> Dict[str, Any]:
        """Get all noise gate parameters"""
        if not self._engine:
            return {
                "threshold": -40.0,
                "ratio": 10.0,
                "attack": 1.0,
                "release": 100.0,
                "bypass": False
            }
        return self._engine.get_gate_parameters()

    async def get_gate_metering(self) -> Dict[str, float]:
        """Get noise gate metering"""
        if not self._engine:
            return {
                "input_level": -100.0,
                "output_level": -100.0,
                "gain_reduction": 0.0,
                "input_rms": -100.0,
                "output_rms": -100.0
            }
        return self._engine.get_gate_metering()

    # ========================================
    # Dynamics - Combined Access (NEW)
    # ========================================

    async def get_dynamics_metering(self) -> Dict[str, Dict[str, float]]:
        """Get all dynamics processor metering"""
        if not self._engine:
            empty_metering = {
                "input_level": -100.0,
                "output_level": -100.0,
                "gain_reduction": 0.0,
                "input_rms": -100.0,
                "output_rms": -100.0
            }
            return {
                "compressor": empty_metering.copy(),
                "limiter": empty_metering.copy(),
                "gate": empty_metering.copy()
            }
        return self._engine.get_dynamics_metering()

    # ========================================
    # EQ / Filter Processing (NEW)
    # ========================================

    async def set_eq_band(self, index: int, params: Dict[str, Any]) -> None:
        """Set EQ band parameters"""
        if self._engine:
            self._engine.set_eq_band(index, params)

    async def set_eq_band_frequency(self, index: int, hz: float) -> None:
        """Set EQ band frequency"""
        if self._engine:
            self._engine.set_eq_band_frequency(index, hz)

    async def set_eq_band_gain(self, index: int, db: float) -> None:
        """Set EQ band gain"""
        if self._engine:
            self._engine.set_eq_band_gain(index, db)

    async def set_eq_band_q(self, index: int, q: float) -> None:
        """Set EQ band Q factor"""
        if self._engine:
            self._engine.set_eq_band_q(index, q)

    async def set_eq_band_type(self, index: int, filter_type: str) -> None:
        """Set EQ band filter type"""
        if self._engine:
            self._engine.set_eq_band_type(index, filter_type)

    async def set_eq_band_enabled(self, index: int, enabled: bool) -> None:
        """Enable/disable EQ band"""
        if self._engine:
            self._engine.set_eq_band_enabled(index, enabled)

    async def get_eq_band(self, index: int) -> Dict[str, Any]:
        """Get EQ band parameters"""
        if not self._engine:
            return {
                "type": "peak",
                "frequency": 1000.0,
                "gain": 0.0,
                "q": 1.0,
                "enabled": True
            }
        return self._engine.get_eq_band(index)

    async def set_eq_output_gain(self, db: float) -> None:
        """Set EQ output gain"""
        if self._engine:
            self._engine.set_eq_output_gain(db)

    async def get_eq_output_gain(self) -> float:
        """Get EQ output gain"""
        if not self._engine:
            return 0.0
        return self._engine.get_eq_output_gain()

    async def set_eq_bypass(self, bypass: bool) -> None:
        """Bypass EQ"""
        if self._engine:
            self._engine.set_eq_bypass(bypass)

    async def is_eq_bypassed(self) -> bool:
        """Check if EQ is bypassed"""
        if not self._engine:
            return False
        return self._engine.is_eq_bypassed()

    async def get_eq_parameters(self) -> Dict[str, Any]:
        """Get all EQ parameters"""
        if not self._engine:
            default_band = {
                "type": "peak",
                "frequency": 1000.0,
                "gain": 0.0,
                "q": 1.0,
                "enabled": True
            }
            return {
                "bands": [default_band.copy() for _ in range(8)],
                "output_gain": 0.0,
                "bypass": False
            }
        return self._engine.get_eq_parameters()

    async def set_eq_parameters(self, params: Dict[str, Any]) -> None:
        """Set all EQ parameters"""
        if self._engine:
            self._engine.set_eq_parameters(params)

    async def get_eq_frequency_response(self, frequencies: List[float]) -> List[float]:
        """Get EQ frequency response at given frequencies"""
        if not self._engine:
            return [0.0] * len(frequencies)
        return self._engine.get_eq_frequency_response(frequencies)

    # ========================================
    # Parallel Processing Chains (NEW)
    # ========================================

    async def create_parallel_group(self, position: int = -1, num_branches: int = 2) -> int:
        """Create a parallel processing group at given position"""
        if not self._engine:
            return -1
        return self._engine.create_parallel_group(position, num_branches)

    async def remove_parallel_group(self, group_id: int) -> bool:
        """Remove a parallel processing group"""
        if not self._engine:
            return False
        return self._engine.remove_parallel_group(group_id)

    async def add_to_parallel_branch(self, group_id: int, branch_index: int,
                                      plugin_id: int, position: int = -1) -> bool:
        """Add a plugin to a parallel branch"""
        if not self._engine:
            return False
        return self._engine.add_to_parallel_branch(group_id, branch_index, plugin_id, position)

    async def remove_from_parallel_branch(self, group_id: int, branch_index: int,
                                           plugin_id: int) -> bool:
        """Remove a plugin from a parallel branch"""
        if not self._engine:
            return False
        return self._engine.remove_from_parallel_branch(group_id, branch_index, plugin_id)

    async def set_parallel_ab_blend(self, group_id: int, blend: float) -> None:
        """Set A/B blend for a parallel group (0.0 = all A, 1.0 = all B)"""
        if self._engine:
            self._engine.set_parallel_ab_blend(group_id, blend)

    async def get_parallel_ab_blend(self, group_id: int) -> float:
        """Get A/B blend for a parallel group"""
        if not self._engine:
            return 0.5
        return self._engine.get_parallel_ab_blend(group_id)

    async def set_parallel_branch_level(self, group_id: int, branch_index: int,
                                         level: float) -> None:
        """Set individual branch level (0.0 to 2.0)"""
        if self._engine:
            self._engine.set_parallel_branch_level(group_id, branch_index, level)

    async def set_parallel_bypass(self, group_id: int, bypass: bool) -> None:
        """Set bypass for a parallel group"""
        if self._engine:
            self._engine.set_parallel_bypass(group_id, bypass)

    async def get_parallel_groups(self) -> List[Dict[str, Any]]:
        """Get all parallel processing groups"""
        if not self._engine:
            return []
        return self._engine.get_parallel_groups()

    # ========================================
    # Neural Amp Modeler (RT-safe via JUCE C++)
    # ========================================

    async def is_nam_available(self) -> bool:
        """Check if NAM support is compiled into the JUCE engine"""
        if not self._engine:
            return False
        try:
            return self._engine.is_nam_available()
        except AttributeError:
            return False

    async def load_nam_model(self, path: str) -> bool:
        """Load a NAM model (.nam file) via RT-safe JUCE engine

        This is the ONLY way to load NAM models for real-time audio.
        Loading happens on a background thread to avoid blocking audio.

        Args:
            path: Full path to .nam model file

        Returns:
            True if loading started successfully
        """
        if not self._engine:
            logger.error("Cannot load NAM model: engine not initialized")
            return False
        try:
            result = self._engine.load_nam_model(path)
            if result:
                logger.info(f"NAM model loading started: {path}")
            else:
                logger.error(f"NAM model load failed to start: {path}")
            return result
        except AttributeError:
            logger.error("JUCE engine does not have NAM support compiled in")
            return False
        except Exception as e:
            logger.error(f"Error loading NAM model: {e}")
            return False

    async def unload_nam_model(self) -> None:
        """Unload the current NAM model"""
        if self._engine:
            try:
                self._engine.unload_nam_model()
                logger.info("NAM model unloaded")
            except AttributeError:
                pass

    async def is_nam_model_loaded(self) -> bool:
        """Check if a NAM model is loaded and ready"""
        if not self._engine:
            return False
        try:
            return self._engine.is_nam_model_loaded()
        except AttributeError:
            return False

    async def is_nam_loading(self) -> bool:
        """Check if a NAM model is currently loading"""
        if not self._engine:
            return False
        try:
            return self._engine.is_nam_loading()
        except AttributeError:
            return False

    async def get_nam_model_info(self) -> Dict[str, Any]:
        """Get information about the currently loaded NAM model"""
        if not self._engine:
            return {
                "path": "",
                "name": "",
                "expected_sample_rate": 48000.0,
                "input_channels": 1,
                "output_channels": 1,
                "has_input_level": False,
                "has_output_level": False,
                "input_level": 0.0,
                "output_level": 0.0,
                "loaded": False
            }
        try:
            return self._engine.get_nam_model_info()
        except AttributeError:
            return {
                "path": "",
                "name": "",
                "expected_sample_rate": 48000.0,
                "input_channels": 1,
                "output_channels": 1,
                "has_input_level": False,
                "has_output_level": False,
                "input_level": 0.0,
                "output_level": 0.0,
                "loaded": False
            }

    async def set_nam_input_gain(self, db: float) -> None:
        """Set NAM input gain in dB"""
        if self._engine:
            try:
                self._engine.set_nam_input_gain(db)
            except AttributeError:
                pass

    async def get_nam_input_gain(self) -> float:
        """Get NAM input gain in dB"""
        if not self._engine:
            return 0.0
        try:
            return self._engine.get_nam_input_gain()
        except AttributeError:
            return 0.0

    async def set_nam_output_gain(self, db: float) -> None:
        """Set NAM output gain in dB"""
        if self._engine:
            try:
                self._engine.set_nam_output_gain(db)
            except AttributeError:
                pass

    async def get_nam_output_gain(self) -> float:
        """Get NAM output gain in dB"""
        if not self._engine:
            return 0.0
        try:
            return self._engine.get_nam_output_gain()
        except AttributeError:
            return 0.0

    async def set_nam_bypass(self, bypass: bool) -> None:
        """Set NAM bypass state"""
        if self._engine:
            try:
                self._engine.set_nam_bypass(bypass)
            except AttributeError:
                pass

    async def is_nam_bypassed(self) -> bool:
        """Check if NAM is bypassed"""
        if not self._engine:
            return False
        try:
            return self._engine.is_nam_bypassed()
        except AttributeError:
            return False

    async def set_nam_normalize(self, normalize: bool) -> None:
        """Enable/disable NAM output normalization"""
        if self._engine:
            try:
                self._engine.set_nam_normalize(normalize)
            except AttributeError:
                pass

    async def is_nam_normalized(self) -> bool:
        """Check if NAM normalization is enabled"""
        if not self._engine:
            return True
        try:
            return self._engine.is_nam_normalized()
        except AttributeError:
            return True

    async def get_nam_input_level(self) -> float:
        """Get NAM input metering level in dB"""
        if not self._engine:
            return -100.0
        try:
            return self._engine.get_nam_input_level()
        except AttributeError:
            return -100.0

    async def get_nam_output_level(self) -> float:
        """Get NAM output metering level in dB"""
        if not self._engine:
            return -100.0
        try:
            return self._engine.get_nam_output_level()
        except AttributeError:
            return -100.0

    async def get_nam_status(self) -> Dict[str, Any]:
        """Get comprehensive NAM status"""
        return {
            "available": await self.is_nam_available(),
            "model_loaded": await self.is_nam_model_loaded(),
            "loading": await self.is_nam_loading(),
            "bypassed": await self.is_nam_bypassed(),
            "normalized": await self.is_nam_normalized(),
            "input_gain": await self.get_nam_input_gain(),
            "output_gain": await self.get_nam_output_gain(),
            "input_level": await self.get_nam_input_level(),
            "output_level": await self.get_nam_output_level(),
            "model_info": await self.get_nam_model_info()
        }

    # ========================================
    # Multi-Format Plugin Support (NEW)
    # ========================================

    async def list_vst3_plugins(self) -> List[Dict[str, Any]]:
        """List VST3 plugins"""
        if not self._engine:
            return []
        return self._engine.list_vst3_plugins()

    async def list_au_plugins(self) -> List[Dict[str, Any]]:
        """List AudioUnit plugins"""
        if not self._engine:
            return []
        return self._engine.list_au_plugins()

    async def list_lv2_plugins(self) -> List[Dict[str, Any]]:
        """List LV2 plugins"""
        if not self._engine:
            return []
        return self._engine.list_lv2_plugins()

    async def scan_for_plugins(self, rescan_all: bool = False) -> None:
        """Scan for available plugins"""
        if self._engine:
            self._engine.scan_for_plugins(rescan_all)

    # System Info

    def get_system_info(self) -> Dict[str, Any]:
        """Get comprehensive system information"""
        if not self._engine:
            return {
                "version": "unavailable",
                "running": False,
                "available": False
            }

        info = self._engine.get_system_info()
        info["available"] = JUCE_AVAILABLE
        info["initialized"] = self._initialized
        return info
    
    # Properties
    
    @property
    def is_running(self) -> bool:
        return self._initialized and self._engine is not None
    
    @property
    def is_available(self) -> bool:
        return JUCE_AVAILABLE
    
    def get_version(self) -> str:
        """Get engine version"""
        if self._engine:
            return self._engine.get_version()
        elif JUCE_AVAILABLE:
            return juce_engine.get_version()
        return "unavailable"


    # ========================================
    # Boss XS-1 Polyphonic Pitch Shifter (NEW)
    # ========================================

    async def set_boss_xs1_shift_amount(self, semitones: float) -> None:
        """Set Boss XS-1 pitch shift amount in semitones (-7 to +7)"""
        if self._engine:
            self._engine.set_boss_xs1_shift_amount(semitones)

    async def get_boss_xs1_shift_amount(self) -> float:
        """Get Boss XS-1 pitch shift amount"""
        if not self._engine:
            return 0.0
        return self._engine.get_boss_xs1_shift_amount()

    async def set_boss_xs1_balance(self, percent: float) -> None:
        """Set Boss XS-1 wet/dry balance (0-100%)"""
        if self._engine:
            self._engine.set_boss_xs1_balance(percent)

    async def get_boss_xs1_balance(self) -> float:
        """Get Boss XS-1 balance"""
        if not self._engine:
            return 50.0
        return self._engine.get_boss_xs1_balance()

    async def set_boss_xs1_detune_mode(self, enabled: bool) -> None:
        """Enable Boss XS-1 detune mode"""
        if self._engine:
            self._engine.set_boss_xs1_detune_mode(enabled)

    async def is_boss_xs1_detune_mode(self) -> bool:
        """Check if Boss XS-1 is in detune mode"""
        if not self._engine:
            return False
        return self._engine.is_boss_xs1_detune_mode()

    async def set_boss_xs1_detune_amount(self, cents: float) -> None:
        """Set Boss XS-1 detune amount in cents"""
        if self._engine:
            self._engine.set_boss_xs1_detune_amount(cents)

    async def get_boss_xs1_detune_amount(self) -> float:
        """Get Boss XS-1 detune amount"""
        if not self._engine:
            return 20.0
        return self._engine.get_boss_xs1_detune_amount()

    async def set_boss_xs1_glide(self, ms: float) -> None:
        """Set Boss XS-1 glide time in ms"""
        if self._engine:
            self._engine.set_boss_xs1_glide(ms)

    async def get_boss_xs1_glide(self) -> float:
        """Get Boss XS-1 glide time"""
        if not self._engine:
            return 0.0
        return self._engine.get_boss_xs1_glide()

    async def set_boss_xs1_feedback(self, feedback: float) -> None:
        """Set Boss XS-1 feedback (0 to 0.7)"""
        if self._engine:
            self._engine.set_boss_xs1_feedback(feedback)

    async def get_boss_xs1_feedback(self) -> float:
        """Get Boss XS-1 feedback"""
        if not self._engine:
            return 0.0
        return self._engine.get_boss_xs1_feedback()

    async def set_boss_xs1_pedal_enabled(self, enabled: bool) -> None:
        """Enable Boss XS-1 expression pedal"""
        if self._engine:
            self._engine.set_boss_xs1_pedal_enabled(enabled)

    async def is_boss_xs1_pedal_enabled(self) -> bool:
        """Check if Boss XS-1 pedal is enabled"""
        if not self._engine:
            return False
        return self._engine.is_boss_xs1_pedal_enabled()

    async def set_boss_xs1_pedal_position(self, position: float) -> None:
        """Set Boss XS-1 pedal position (0-100%)"""
        if self._engine:
            self._engine.set_boss_xs1_pedal_position(position)

    async def get_boss_xs1_pedal_position(self) -> float:
        """Get Boss XS-1 pedal position"""
        if not self._engine:
            return 0.0
        return self._engine.get_boss_xs1_pedal_position()

    async def set_boss_xs1_pedal_range(self, min_st: float, max_st: float) -> None:
        """Set Boss XS-1 pedal range in semitones"""
        if self._engine:
            self._engine.set_boss_xs1_pedal_range(min_st, max_st)

    async def get_boss_xs1_pedal_min(self) -> float:
        """Get Boss XS-1 pedal min"""
        if not self._engine:
            return -7.0
        return self._engine.get_boss_xs1_pedal_min()

    async def get_boss_xs1_pedal_max(self) -> float:
        """Get Boss XS-1 pedal max"""
        if not self._engine:
            return 7.0
        return self._engine.get_boss_xs1_pedal_max()

    async def set_boss_xs1_preset(self, preset_index: int) -> None:
        """Set Boss XS-1 preset by index"""
        if self._engine:
            presets = [
                "manual", "drop_d", "drop_d_sharp", "half_step_down",
                "capo_2nd_fret", "capo_3rd_fret", "capo_5th_fret",
                "octave_up", "octave_down", "octave_up_down",
                "micro_pitch_wide", "micro_pitch_narrow", "voice_doubling",
                "string_doubling", "pianist_octaves", "sub_bass",
                "sonic_screamer", "unique_intervals", "minor_third",
                "chord_shift", "detune_chorus", "spacey_vibrato", "robotic_mod"
            ]
            if 0 <= preset_index < len(presets):
                self._engine.set_boss_xs1_preset(presets[preset_index])

    async def get_boss_xs1_preset(self) -> str:
        """Get Boss XS-1 current preset name"""
        if not self._engine:
            return "manual"
        return self._engine.get_boss_xs1_preset()

    async def set_boss_xs1_bypass(self, bypass: bool) -> None:
        """Bypass Boss XS-1"""
        if self._engine:
            self._engine.set_boss_xs1_bypass(bypass)

    async def is_boss_xs1_bypassed(self) -> bool:
        """Check if Boss XS-1 is bypassed"""
        if not self._engine:
            return False
        return self._engine.is_boss_xs1_bypassed()

    def _preset_name_to_index(self, preset_name: str) -> int:
        """Convert Boss XS-1 preset name to index"""
        presets = [
            "manual", "drop_d", "drop_d_sharp", "half_step_down",
            "capo_2nd_fret", "capo_3rd_fret", "capo_5th_fret",
            "octave_up", "octave_down", "octave_up_down",
            "micro_pitch_wide", "micro_pitch_narrow", "voice_doubling",
            "string_doubling", "pianist_octaves", "sub_bass",
            "sonic_screamer", "unique_intervals", "minor_third",
            "chord_shift", "detune_chorus", "spacey_vibrato", "robotic_mod"
        ]
        try:
            return presets.index(preset_name)
        except ValueError:
            return 0

    async def get_boss_xs1_parameters(self) -> Dict[str, Any]:
        """Get all Boss XS-1 parameters"""
        if not self._engine:
            return {
                "shift_amount": 0.0,
                "balance": 50.0,
                "detune_mode": False,
                "detune_amount": 20.0,
                "glide": 0.0,
                "feedback": 0.0,
                "pedal_enabled": False,
                "pedal_position": 0.0,
                "pedal_min": -7.0,
                "pedal_max": 7.0,
                "preset": 0,
                "bypass": False
            }
        params = self._engine.get_boss_xs1_parameters()
        # Convert preset name to index for frontend compatibility
        if isinstance(params.get("preset"), str):
            params["preset"] = self._preset_name_to_index(params["preset"])
        return params

    async def set_boss_xs1_parameters(self, params: Dict[str, Any]) -> None:
        """Set all Boss XS-1 parameters at once"""
        if self._engine:
            self._engine.set_boss_xs1_parameters(params)

    async def get_boss_xs1_input_level(self) -> float:
        """Get Boss XS-1 input level in dB"""
        if not self._engine:
            return -100.0
        return self._engine.get_boss_xs1_input_level()

    async def get_boss_xs1_output_level(self) -> float:
        """Get Boss XS-1 output level in dB"""
        if not self._engine:
            return -100.0
        return self._engine.get_boss_xs1_output_level()

    async def get_boss_xs1_metering(self) -> Dict[str, float]:
        """Get Boss XS-1 metering"""
        if not self._engine:
            return {
                "input_level": -100.0,
                "output_level": -100.0
            }
        return {
            "input_level": self._engine.get_boss_xs1_input_level(),
            "output_level": self._engine.get_boss_xs1_output_level()
        }

    async def get_boss_xs1_presets(self) -> List[Dict[str, Any]]:
        """Get all Boss XS-1 presets"""
        if not self._engine:
            return []
        return self._engine.get_boss_xs1_presets()

    # ========================================
    # ShoeGaze Multi-Effect Processor
    # ========================================

    async def set_shoegaze_atmosphere(self, percent: float) -> None:
        """Set ShoeGaze atmosphere (master dreamy control)"""
        if self._engine:
            self._engine.set_shoegaze_atmosphere(percent)

    async def set_shoegaze_decay(self, seconds: float) -> None:
        """Set ShoeGaze reverb decay time"""
        if self._engine:
            self._engine.set_shoegaze_decay(seconds)

    async def set_shoegaze_shimmer(self, percent: float) -> None:
        """Set ShoeGaze shimmer amount"""
        if self._engine:
            self._engine.set_shoegaze_shimmer(percent)

    async def set_shoegaze_shimmer_pitch(self, semitones: float) -> None:
        """Set ShoeGaze shimmer pitch in semitones"""
        if self._engine:
            self._engine.set_shoegaze_shimmer_pitch(semitones)

    async def set_shoegaze_modulation(self, percent: float) -> None:
        """Set ShoeGaze chorus modulation depth"""
        if self._engine:
            self._engine.set_shoegaze_modulation(percent)

    async def set_shoegaze_mod_rate(self, hz: float) -> None:
        """Set ShoeGaze modulation rate in Hz"""
        if self._engine:
            self._engine.set_shoegaze_mod_rate(hz)

    async def set_shoegaze_drive(self, percent: float) -> None:
        """Set ShoeGaze saturation drive"""
        if self._engine:
            self._engine.set_shoegaze_drive(percent)

    async def set_shoegaze_delay_time(self, ms: float) -> None:
        """Set ShoeGaze delay time in ms"""
        if self._engine:
            self._engine.set_shoegaze_delay_time(ms)

    async def set_shoegaze_delay_feedback(self, percent: float) -> None:
        """Set ShoeGaze delay feedback"""
        if self._engine:
            self._engine.set_shoegaze_delay_feedback(percent)

    async def set_shoegaze_delay_mod(self, percent: float) -> None:
        """Set ShoeGaze delay modulation/BBD wobble"""
        if self._engine:
            self._engine.set_shoegaze_delay_mod(percent)

    async def set_shoegaze_low_cut(self, hz: float) -> None:
        """Set ShoeGaze low cut frequency"""
        if self._engine:
            self._engine.set_shoegaze_low_cut(hz)

    async def set_shoegaze_high_cut(self, hz: float) -> None:
        """Set ShoeGaze high cut frequency"""
        if self._engine:
            self._engine.set_shoegaze_high_cut(hz)

    async def set_shoegaze_mix(self, percent: float) -> None:
        """Set ShoeGaze wet/dry mix"""
        if self._engine:
            self._engine.set_shoegaze_mix(percent)

    async def set_shoegaze_stereo_width(self, percent: float) -> None:
        """Set ShoeGaze stereo width"""
        if self._engine:
            self._engine.set_shoegaze_stereo_width(percent)

    async def set_shoegaze_reverb_diffusion(self, percent: float) -> None:
        """Set ShoeGaze reverb diffusion"""
        if self._engine:
            self._engine.set_shoegaze_reverb_diffusion(percent)

    async def set_shoegaze_reverb_damping(self, percent: float) -> None:
        """Set ShoeGaze reverb damping"""
        if self._engine:
            self._engine.set_shoegaze_reverb_damping(percent)

    async def set_shoegaze_shimmer_feedback(self, percent: float) -> None:
        """Set ShoeGaze shimmer feedback"""
        if self._engine:
            self._engine.set_shoegaze_shimmer_feedback(percent)

    async def set_shoegaze_chorus_voices(self, voices: int) -> None:
        """Set ShoeGaze chorus voices (1-6)"""
        if self._engine:
            self._engine.set_shoegaze_chorus_voices(voices)

    async def set_shoegaze_ducking(self, percent: float) -> None:
        """Set ShoeGaze ducking amount"""
        if self._engine:
            self._engine.set_shoegaze_ducking(percent)

    async def set_shoegaze_preset(self, preset_name: str) -> None:
        """Set ShoeGaze preset by name"""
        if self._engine:
            self._engine.set_shoegaze_preset(preset_name.lower())

    async def set_shoegaze_bypass(self, bypass: bool) -> None:
        """Set ShoeGaze bypass state"""
        if self._engine:
            self._engine.set_shoegaze_bypass(bypass)

    async def set_shoegaze_spillover(self, enabled: bool) -> None:
        """Set ShoeGaze spillover (reverb tails when bypassed)"""
        if self._engine:
            self._engine.set_shoegaze_spillover(enabled)

    async def get_shoegaze_parameters(self) -> Dict[str, Any]:
        """Get all ShoeGaze parameters"""
        if not self._engine:
            return {
                "atmosphere": 50.0, "decay": 4.0, "shimmer": 25.0,
                "shimmer_pitch": 12.0, "modulation": 35.0, "mod_rate": 0.7,
                "drive": 15.0, "delay_time": 200.0, "delay_feedback": 30.0,
                "delay_mod": 20.0, "low_cut": 80.0, "high_cut": 8000.0,
                "mix": 50.0, "stereo_width": 150.0, "ducking_amount": 20.0,
                "preset": 0, "bypass": False
            }
        params = self._engine.get_shoegaze_parameters()
        return {
            "atmosphere": params.get("atmosphere", 50.0),
            "decay": params.get("decay", 4.0),
            "shimmer": params.get("shimmer", 25.0),
            "shimmer_pitch": params.get("shimmer_pitch", 12.0),
            "modulation": params.get("modulation", 35.0),
            "mod_rate": params.get("mod_rate", 0.7),
            "drive": params.get("drive", 15.0),
            "delay_time": params.get("delay_time", 200.0),
            "delay_feedback": params.get("delay_feedback", 30.0),
            "delay_mod": params.get("delay_mod", 20.0),
            "low_cut": params.get("low_cut", 80.0),
            "high_cut": params.get("high_cut", 8000.0),
            "mix": params.get("mix", 50.0),
            "stereo_width": params.get("stereo_width", 150.0),
            "ducking_amount": params.get("ducking_amount", 20.0),
            "preset": params.get("preset", 0),
            "bypass": params.get("bypass", False)
        }

    async def get_shoegaze_metering(self) -> Dict[str, float]:
        """Get ShoeGaze metering data"""
        if not self._engine:
            return {
                "input_level": -100.0, "output_level": -100.0,
                "reverb_level": -100.0, "shimmer_level": -100.0,
                "lfo_phase": 0.0, "grain_activity": 0.0,
                "ducking_reduction": 0.0, "feedback_level": -100.0,
                "saturation_level": 0.0, "stereo_correlation": 1.0,
                "cpu_load": 0.0
            }
        metering = self._engine.get_shoegaze_metering()
        return {
            "input_level": metering.get("input_level", -100.0),
            "output_level": metering.get("output_level", -100.0),
            "reverb_level": metering.get("reverb_level", -100.0),
            "shimmer_level": metering.get("shimmer_level", -100.0),
            "lfo_phase": metering.get("lfo_phase", 0.0),
            "grain_activity": metering.get("grain_activity", 0.0),
            "ducking_reduction": metering.get("ducking_reduction", 0.0),
            "feedback_level": metering.get("feedback_level", -100.0),
            "saturation_level": metering.get("saturation_level", 0.0),
            "stereo_correlation": metering.get("stereo_correlation", 1.0),
            "cpu_load": metering.get("cpu_load", 0.0)
        }

    async def get_shoegaze_presets(self) -> List[Dict[str, str]]:
        """Get all ShoeGaze presets"""
        return [
            {"id": "manual", "name": "Manual", "description": "User-defined settings"},
            {"id": "loveless", "name": "Loveless", "artist": "My Bloody Valentine", "description": "Dense, gliding walls of sound"},
            {"id": "souvlaki", "name": "Souvlaki", "artist": "Slowdive", "description": "Ethereal, washy dream-pop"},
            {"id": "treasure", "name": "Treasure", "artist": "Cocteau Twins", "description": "Shimmering crystal highs"},
            {"id": "spaceage", "name": "Space Age", "artist": "Spiritualized", "description": "Expansive, evolving soundscapes"},
            {"id": "psychocandy", "name": "Psychocandy", "artist": "Jesus and Mary Chain", "description": "Feedback-drenched noise-pop"},
            {"id": "nowhere", "name": "Nowhere", "artist": "Ride", "description": "Swirling, propulsive textures"}
        ]

    # ============================================================
    # EVH Pitch Shifter / Interval Shifter
    # ============================================================

    async def set_pitch_shifter_pitch_l(self, cents: float) -> None:
        """Set pitch shifter left pitch in cents"""
        if self._engine:
            self._engine.set_pitch_shifter_pitch_l(cents)

    async def set_pitch_shifter_pitch_r(self, cents: float) -> None:
        """Set pitch shifter right pitch in cents"""
        if self._engine:
            self._engine.set_pitch_shifter_pitch_r(cents)

    async def set_pitch_shifter_delay_l(self, ms: float) -> None:
        """Set pitch shifter left delay in ms"""
        if self._engine:
            self._engine.set_pitch_shifter_delay_l(ms)

    async def set_pitch_shifter_delay_r(self, ms: float) -> None:
        """Set pitch shifter right delay in ms"""
        if self._engine:
            self._engine.set_pitch_shifter_delay_r(ms)

    async def set_pitch_shifter_feedback(self, amount: float) -> None:
        """Set pitch shifter feedback (0-0.9)"""
        if self._engine:
            self._engine.set_pitch_shifter_feedback(amount)

    async def set_pitch_shifter_mix(self, percent: float) -> None:
        """Set pitch shifter mix (0-100)"""
        if self._engine:
            self._engine.set_pitch_shifter_mix(percent)

    async def set_pitch_shifter_spread(self, percent: float) -> None:
        """Set pitch shifter stereo spread (0-100)"""
        if self._engine:
            self._engine.set_pitch_shifter_spread(percent)

    async def set_pitch_shifter_preset(self, preset_index: int) -> None:
        """Set pitch shifter preset by index"""
        if self._engine:
            # Map index to preset name
            presets = [
                "manual", "eruption", "unchained", "little_guitars", "mean_street",
                "drop_dead_legs", "panama", "cathedral", "hot_for_teacher",
                "why_cant_this_be_love", "dreams", "finish_what_ya_started",
                "right_now", "cant_stop_lovin_you", "humans_being_outtro"
            ]
            if 0 <= preset_index < len(presets):
                self._engine.set_pitch_shifter_preset(presets[preset_index])

    async def set_pitch_shifter_bypass(self, bypass: bool) -> None:
        """Set pitch shifter bypass state"""
        if self._engine:
            self._engine.set_pitch_shifter_bypass(bypass)

    async def get_pitch_shifter_parameters(self) -> Dict[str, Any]:
        """Get pitch shifter parameters"""
        if not self._engine:
            return {
                "pitch_l": 0.0, "pitch_r": 0.0,
                "delay_l": 0.0, "delay_r": 0.0,
                "feedback": 0.0, "mix": 50.0, "spread": 50.0,
                "preset": "manual", "bypass": False
            }
        params = self._engine.get_pitch_shifter_parameters()
        return {
            "pitch_l": params.get("pitch_l", 0.0),
            "pitch_r": params.get("pitch_r", 0.0),
            "delay_l": params.get("delay_l", 0.0),
            "delay_r": params.get("delay_r", 0.0),
            "feedback": params.get("feedback", 0.0),
            "mix": params.get("mix", 50.0),
            "spread": params.get("spread", 50.0),
            "preset": params.get("preset", "manual"),
            "bypass": params.get("bypass", False)
        }

    async def get_pitch_shifter_metering(self) -> Dict[str, float]:
        """Get pitch shifter metering data"""
        if not self._engine:
            return {
                "input_level_l": -100.0, "input_level_r": -100.0,
                "output_level_l": -100.0, "output_level_r": -100.0,
                "pitch_l_actual": 0.0, "pitch_r_actual": 0.0
            }
        metering = self._engine.get_pitch_shifter_metering()
        return {
            "input_level_l": metering.get("input_level_l", -100.0),
            "input_level_r": metering.get("input_level_r", -100.0),
            "output_level_l": metering.get("output_level_l", -100.0),
            "output_level_r": metering.get("output_level_r", -100.0),
            "pitch_l_actual": metering.get("pitch_l_actual", 0.0),
            "pitch_r_actual": metering.get("pitch_r_actual", 0.0)
        }

    async def get_pitch_shifter_presets(self) -> List[Dict[str, Any]]:
        """Get pitch shifter presets"""
        if self._engine:
            return self._engine.get_pitch_shifter_presets()
        return []

    # ============================================================
    # H3000 Ultra-Harmonizer
    # ============================================================

    async def set_h3000_bypass(self, bypass: bool) -> None:
        """Set H3000 bypass state"""
        if self._engine:
            self._engine.set_h3000_bypass(bypass)

    async def set_h3000_algorithm(self, algorithm_index: int) -> None:
        """Set H3000 algorithm by index (0-9)"""
        if self._engine:
            self._engine.set_h3000_algorithm(algorithm_index)

    async def set_h3000_algorithm_by_name(self, name: str) -> None:
        """Set H3000 algorithm by name"""
        if self._engine:
            # Convert name to algorithm index
            algorithms = {
                "micropitch": 0, "dual_shift": 1, "crystal_echoes": 2,
                "stereo_shift": 3, "layered_shift": 4, "swept_combs": 5,
                "stutter_shift": 6, "reverse_pitch": 7, "band_delays": 8,
                "patch_factory": 9
            }
            if name in algorithms:
                self._engine.set_h3000_algorithm(algorithms[name])

    async def set_h3000_pitch_l(self, cents: float) -> None:
        """Set H3000 left pitch shift in cents (-2400 to +2400)"""
        if self._engine:
            self._engine.set_h3000_pitch_l(cents)

    async def set_h3000_pitch_r(self, cents: float) -> None:
        """Set H3000 right pitch shift in cents (-2400 to +2400)"""
        if self._engine:
            self._engine.set_h3000_pitch_r(cents)

    async def set_h3000_delay_l(self, ms: float) -> None:
        """Set H3000 left delay in milliseconds (0-1000)"""
        if self._engine:
            self._engine.set_h3000_delay_l(ms)

    async def set_h3000_delay_r(self, ms: float) -> None:
        """Set H3000 right delay in milliseconds (0-1000)"""
        if self._engine:
            self._engine.set_h3000_delay_r(ms)

    async def set_h3000_feedback(self, percent: float) -> None:
        """Set H3000 feedback amount (0-100)"""
        if self._engine:
            self._engine.set_h3000_feedback(percent)

    async def set_h3000_cross_feedback(self, percent: float) -> None:
        """Set H3000 cross-channel feedback (0-100)"""
        if self._engine:
            self._engine.set_h3000_cross_feedback(percent)

    async def set_h3000_mod_depth(self, percent: float) -> None:
        """Set H3000 modulation depth (0-100)"""
        if self._engine:
            self._engine.set_h3000_mod_depth(percent)

    async def set_h3000_mod_rate(self, hz: float) -> None:
        """Set H3000 modulation rate in Hz (0.1-10)"""
        if self._engine:
            self._engine.set_h3000_mod_rate(hz)

    async def set_h3000_low_cut(self, hz: float) -> None:
        """Set H3000 low cut frequency (20-500 Hz)"""
        if self._engine:
            self._engine.set_h3000_low_cut(hz)

    async def set_h3000_high_cut(self, hz: float) -> None:
        """Set H3000 high cut frequency (2000-20000 Hz)"""
        if self._engine:
            self._engine.set_h3000_high_cut(hz)

    async def set_h3000_mix(self, percent: float) -> None:
        """Set H3000 wet/dry mix (0-100)"""
        if self._engine:
            self._engine.set_h3000_mix(percent)

    async def set_h3000_level_l(self, percent: float) -> None:
        """Set H3000 left output level (0-100)"""
        if self._engine:
            self._engine.set_h3000_level_l(percent)

    async def set_h3000_level_r(self, percent: float) -> None:
        """Set H3000 right output level (0-100)"""
        if self._engine:
            self._engine.set_h3000_level_r(percent)

    async def set_h3000_glide(self, ms: float) -> None:
        """Set H3000 pitch glide time in ms (0-1000)"""
        if self._engine:
            self._engine.set_h3000_glide(ms)

    async def get_h3000_parameters(self) -> Dict[str, Any]:
        """Get all H3000 parameters"""
        if not self._engine:
            return {
                "algorithm": "micropitch", "algorithm_index": 0,
                "pitch_l": 0.0, "pitch_r": 0.0,
                "delay_l": 15.0, "delay_r": 20.0,
                "feedback": 0.0, "cross_feedback": 0.0,
                "mod_depth": 0.0, "mod_rate": 0.5,
                "low_cut": 80.0, "high_cut": 12000.0,
                "mix": 50.0, "level_l": 100.0, "level_r": 100.0,
                "glide": 0.0, "bypass": False
            }
        params = self._engine.get_h3000_parameters()
        return {
            "algorithm": params.get("algorithm", "micropitch"),
            "algorithm_index": params.get("algorithm_index", 0),
            "pitch_l": params.get("pitch_l", 0.0),
            "pitch_r": params.get("pitch_r", 0.0),
            "delay_l": params.get("delay_l", 15.0),
            "delay_r": params.get("delay_r", 20.0),
            "feedback": params.get("feedback", 0.0),
            "cross_feedback": params.get("cross_feedback", 0.0),
            "mod_depth": params.get("mod_depth", 0.0),
            "mod_rate": params.get("mod_rate", 0.5),
            "low_cut": params.get("low_cut", 80.0),
            "high_cut": params.get("high_cut", 12000.0),
            "mix": params.get("mix", 50.0),
            "level_l": params.get("level_l", 100.0),
            "level_r": params.get("level_r", 100.0),
            "glide": params.get("glide", 0.0),
            "bypass": params.get("bypass", False)
        }

    async def get_h3000_metering(self) -> Dict[str, float]:
        """Get H3000 metering data"""
        if not self._engine:
            return {
                "input_level_l": -100.0, "input_level_r": -100.0,
                "output_level_l": -100.0, "output_level_r": -100.0,
                "pitch_l_actual": 0.0, "pitch_r_actual": 0.0,
                "delay_l_actual": 0.0, "delay_r_actual": 0.0,
                "mod_phase": 0.0
            }
        metering = self._engine.get_h3000_metering()
        return {
            "input_level_l": metering.get("input_level_l", -100.0),
            "input_level_r": metering.get("input_level_r", -100.0),
            "output_level_l": metering.get("output_level_l", -100.0),
            "output_level_r": metering.get("output_level_r", -100.0),
            "pitch_l_actual": metering.get("pitch_l_actual", 0.0),
            "pitch_r_actual": metering.get("pitch_r_actual", 0.0),
            "delay_l_actual": metering.get("delay_l_actual", 0.0),
            "delay_r_actual": metering.get("delay_r_actual", 0.0),
            "mod_phase": metering.get("mod_phase", 0.0)
        }

    async def get_h3000_algorithms(self) -> List[Dict[str, Any]]:
        """Get all H3000 algorithm presets"""
        return [
            {"index": 0, "id": "micropitch", "name": "MicroPitch", "short_name": "MICRO", "description": "Subtle pitch detune for stereo widening and ADT effects"},
            {"index": 1, "id": "dual_shift", "name": "Dual Shift", "short_name": "DUAL", "description": "Independent left/right pitch shifters with modulation"},
            {"index": 2, "id": "crystal_echoes", "name": "Crystal Echoes", "short_name": "CRYST", "description": "Shimmering delays with pitch-shifted feedback"},
            {"index": 3, "id": "stereo_shift", "name": "Stereo Shift", "short_name": "STERE", "description": "Wide stereo field with complementary pitch offsets"},
            {"index": 4, "id": "layered_shift", "name": "Layered Shift", "short_name": "LAYER", "description": "Multiple harmonized voices stacked in unison"},
            {"index": 5, "id": "swept_combs", "name": "Swept Combs", "short_name": "COMB", "description": "Modulated comb filters for flanging and metallic effects"},
            {"index": 6, "id": "stutter_shift", "name": "Stutter Shift", "short_name": "STUTT", "description": "Glitch-style retriggering with pitch bending"},
            {"index": 7, "id": "reverse_pitch", "name": "Reverse Pitch", "short_name": "REVRS", "description": "Reversed grains with pitch manipulation"},
            {"index": 8, "id": "band_delays", "name": "Band Delays", "short_name": "BAND", "description": "Multi-band delay with per-band pitch shifting"},
            {"index": 9, "id": "patch_factory", "name": "Patch Factory", "short_name": "PATCH", "description": "Complex multi-effect combinations"}
        ]

    # ============================================================
    # Lexi Love PCM 70 Reverb
    # ============================================================

    async def set_lexilove_algorithm(self, algorithm_index: int) -> None:
        """Set Lexi Love algorithm by index (0-8)"""
        if self._engine:
            self._engine.set_lexilove_algorithm(algorithm_index)

    async def set_lexilove_algorithm_by_name(self, name: str) -> None:
        """Set Lexi Love algorithm by name"""
        if self._engine:
            self._engine.set_lexilove_algorithm_by_name(name)

    async def set_lexilove_pre_delay(self, ms: float) -> None:
        """Set Lexi Love pre-delay in milliseconds"""
        if self._engine:
            self._engine.set_lexilove_pre_delay(ms)

    async def set_lexilove_decay_time(self, seconds: float) -> None:
        """Set Lexi Love decay time (RT60) in seconds"""
        if self._engine:
            self._engine.set_lexilove_decay_time(seconds)

    async def set_lexilove_diffusion(self, percent: float) -> None:
        """Set Lexi Love diffusion amount"""
        if self._engine:
            self._engine.set_lexilove_diffusion(percent)

    async def set_lexilove_mix(self, percent: float) -> None:
        """Set Lexi Love wet/dry mix"""
        if self._engine:
            self._engine.set_lexilove_mix(percent)

    async def set_lexilove_high_cut(self, hz: float) -> None:
        """Set Lexi Love high cut frequency"""
        if self._engine:
            self._engine.set_lexilove_high_cut(hz)

    async def set_lexilove_low_cut(self, hz: float) -> None:
        """Set Lexi Love low cut frequency"""
        if self._engine:
            self._engine.set_lexilove_low_cut(hz)

    async def set_lexilove_low_decay_mult(self, mult: float) -> None:
        """Set Lexi Love low frequency decay multiplier"""
        if self._engine:
            self._engine.set_lexilove_low_decay_mult(mult)

    async def set_lexilove_high_decay_mult(self, mult: float) -> None:
        """Set Lexi Love high frequency decay multiplier"""
        if self._engine:
            self._engine.set_lexilove_high_decay_mult(mult)

    async def set_lexilove_low_crossover(self, hz: float) -> None:
        """Set Lexi Love low crossover frequency"""
        if self._engine:
            self._engine.set_lexilove_low_crossover(hz)

    async def set_lexilove_high_crossover(self, hz: float) -> None:
        """Set Lexi Love high crossover frequency"""
        if self._engine:
            self._engine.set_lexilove_high_crossover(hz)

    async def set_lexilove_early_level(self, percent: float) -> None:
        """Set Lexi Love early reflections level"""
        if self._engine:
            self._engine.set_lexilove_early_level(percent)

    async def set_lexilove_early_pattern(self, percent: float) -> None:
        """Set Lexi Love early reflections pattern density"""
        if self._engine:
            self._engine.set_lexilove_early_pattern(percent)

    async def set_lexilove_mod_depth(self, percent: float) -> None:
        """Set Lexi Love modulation depth (sparkle)"""
        if self._engine:
            self._engine.set_lexilove_mod_depth(percent)

    async def set_lexilove_mod_rate(self, hz: float) -> None:
        """Set Lexi Love modulation rate"""
        if self._engine:
            self._engine.set_lexilove_mod_rate(hz)

    async def set_lexilove_bypass(self, bypass: bool) -> None:
        """Set Lexi Love bypass state"""
        if self._engine:
            self._engine.set_lexilove_bypass(bypass)

    async def set_lexilove_spillover(self, enabled: bool) -> None:
        """Set Lexi Love spillover (tail continues on bypass)"""
        if self._engine:
            self._engine.set_lexilove_spillover(enabled)

    async def get_lexilove_parameters(self) -> Dict[str, Any]:
        """Get all Lexi Love parameters"""
        if not self._engine:
            return {
                "algorithm": 1, "algorithm_name": "rich_plate",
                "pre_delay": 40.0, "decay_time": 2.5, "diffusion": 85.0,
                "low_decay_mult": 1.0, "high_decay_mult": 0.8,
                "low_crossover": 500.0, "high_crossover": 9000.0,
                "early_level": 70.0, "early_pattern": 50.0,
                "mod_depth": 15.0, "mod_rate": 0.8,
                "mix": 35.0, "high_cut": 12000.0, "low_cut": 40.0,
                "bypass": False, "spillover": True
            }
        params = self._engine.get_lexilove_parameters()
        return {
            "algorithm_index": params.get("algorithm_index", 1),
            "algorithm": params.get("algorithm", "rich_plate"),
            "pre_delay": params.get("pre_delay", 40.0),
            "decay_time": params.get("decay_time", 2.5),
            "diffusion": params.get("diffusion", 85.0),
            "low_decay_mult": params.get("low_decay_mult", 1.0),
            "high_decay_mult": params.get("high_decay_mult", 0.8),
            "low_crossover": params.get("low_crossover", 500.0),
            "high_crossover": params.get("high_crossover", 9000.0),
            "early_level": params.get("early_level", 70.0),
            "early_pattern": params.get("early_pattern", 50.0),
            "mod_depth": params.get("mod_depth", 15.0),
            "mod_rate": params.get("mod_rate", 0.8),
            "mix": params.get("mix", 35.0),
            "high_cut": params.get("high_cut", 12000.0),
            "low_cut": params.get("low_cut", 40.0),
            "bypass": params.get("bypass", False),
            "spillover": params.get("spillover", True)
        }

    async def get_lexilove_metering(self) -> Dict[str, float]:
        """Get Lexi Love metering data"""
        if not self._engine:
            return {
                "input_level_l": -100.0, "input_level_r": -100.0,
                "output_level_l": -100.0, "output_level_r": -100.0,
                "reverb_level_l": -100.0, "reverb_level_r": -100.0,
                "early_level": -100.0, "late_level": -100.0,
                "mod_lfo_phase": 0.0, "current_decay": 2.5
            }
        metering = self._engine.get_lexilove_metering()
        return {
            "input_level_l": metering.get("input_level_l", -100.0),
            "input_level_r": metering.get("input_level_r", -100.0),
            "output_level_l": metering.get("output_level_l", -100.0),
            "output_level_r": metering.get("output_level_r", -100.0),
            "reverb_level_l": metering.get("reverb_level_l", -100.0),
            "reverb_level_r": metering.get("reverb_level_r", -100.0),
            "early_level": metering.get("early_level", -100.0),
            "late_level": metering.get("late_level", -100.0),
            "mod_lfo_phase": metering.get("mod_lfo_phase", 0.0),
            "current_decay": metering.get("current_decay", 2.5)
        }

    async def get_lexilove_algorithms(self) -> List[Dict[str, Any]]:
        """Get all Lexi Love algorithm presets"""
        return [
            {"index": 0, "id": "tiled_room", "name": "Tiled Room V2.0", "short_name": "TILED", "description": "Legendary preset with 'spitty' early reflections - lively on drums"},
            {"index": 1, "id": "rich_plate", "name": "Rich Plate", "short_name": "PLATE", "description": "Warm vocals - the studio standard for countless recordings"},
            {"index": 2, "id": "concert_hall", "name": "Concert Hall", "short_name": "HALL", "description": "Classic 80s reverb with time variation and sparkle"},
            {"index": 3, "id": "small_room", "name": "Small Room", "short_name": "SMALL", "description": "Tight, customizable space for close-mic sounds"},
            {"index": 4, "id": "rich_chamber", "name": "Rich Chamber", "short_name": "CHAMB", "description": "Warm thick chamber with prominent early reflections"},
            {"index": 5, "id": "gymnasium", "name": "Gymnasium", "short_name": "GYM", "description": "Large acoustic space simulation with long decay"},
            {"index": 6, "id": "long_hall", "name": "Long Hall", "short_name": "LONG", "description": "Extended decay concert hall for ambient textures"},
            {"index": 7, "id": "gated_plate", "name": "Gated Plate", "short_name": "GATED", "description": "Compressed/gated reverb for drums and dramatic effects"},
            {"index": 8, "id": "infinite", "name": "Infinite", "short_name": "INF", "description": "Special effects and atmospheric textures - near-infinite decay"}
        ]

    # ============================================================
    # Peavey 5150 Block Letter Amp Simulator
    # ============================================================

    async def set_peavey5150_bypass(self, bypass: bool) -> None:
        """Set Peavey 5150 bypass state"""
        if self._engine:
            self._engine.set_peavey5150_bypass(bypass)

    async def set_peavey5150_pre_gain(self, value: float) -> None:
        """Set Peavey 5150 preamp gain (0-10)"""
        if self._engine:
            self._engine.set_peavey5150_pre_gain(value)

    async def set_peavey5150_post_gain(self, value: float) -> None:
        """Set Peavey 5150 master volume (0-10)"""
        if self._engine:
            self._engine.set_peavey5150_post_gain(value)

    async def set_peavey5150_low(self, value: float) -> None:
        """Set Peavey 5150 bass tone (0-10)"""
        if self._engine:
            self._engine.set_peavey5150_low(value)

    async def set_peavey5150_mid(self, value: float) -> None:
        """Set Peavey 5150 mid tone (0-10)"""
        if self._engine:
            self._engine.set_peavey5150_mid(value)

    async def set_peavey5150_high(self, value: float) -> None:
        """Set Peavey 5150 treble tone (0-10)"""
        if self._engine:
            self._engine.set_peavey5150_high(value)

    async def set_peavey5150_presence(self, value: float) -> None:
        """Set Peavey 5150 presence (0-10)"""
        if self._engine:
            self._engine.set_peavey5150_presence(value)

    async def set_peavey5150_resonance(self, value: float) -> None:
        """Set Peavey 5150 resonance (0-10)"""
        if self._engine:
            self._engine.set_peavey5150_resonance(value)

    async def set_peavey5150_bright(self, on: bool) -> None:
        """Set Peavey 5150 bright switch"""
        if self._engine:
            self._engine.set_peavey5150_bright(on)

    async def set_peavey5150_bias(self, value: float) -> None:
        """Set Peavey 5150 power tube bias (0-10, 0=cold stock)"""
        if self._engine:
            self._engine.set_peavey5150_bias(value)

    async def set_peavey5150_preset(self, preset_name: str) -> None:
        """Set Peavey 5150 preset by name"""
        if self._engine:
            self._engine.set_peavey5150_preset(preset_name)

    async def get_peavey5150_parameters(self) -> Dict[str, Any]:
        """Get all Peavey 5150 parameters"""
        if not self._engine:
            return {
                "pre_gain": 5.0, "post_gain": 3.0,
                "low": 5.0, "mid": 5.0, "high": 5.0,
                "presence": 5.0, "resonance": 5.0,
                "bright": False, "bias": 3.0,
                "preset": 0, "preset_name": "manual",
                "bypass": False
            }
        params = self._engine.get_peavey5150_parameters()
        return {
            "pre_gain": params.get("pre_gain", 5.0),
            "post_gain": params.get("post_gain", 3.0),
            "low": params.get("low", 5.0),
            "mid": params.get("mid", 5.0),
            "high": params.get("high", 5.0),
            "presence": params.get("presence", 5.0),
            "resonance": params.get("resonance", 5.0),
            "bright": params.get("bright", False),
            "bias": params.get("bias", 3.0),
            "preset": params.get("preset", 0),
            "preset_name": params.get("preset_name", "manual"),
            "bypass": params.get("bypass", False)
        }

    async def get_peavey5150_metering(self) -> Dict[str, float]:
        """Get Peavey 5150 metering data"""
        if not self._engine:
            return {
                "input_level": -100.0, "output_level": -100.0,
                "preamp_level": -100.0, "power_level": -100.0,
                "supply_sag": 1.0, "cpu_load": 0.0
            }
        metering = self._engine.get_peavey5150_metering()
        return {
            "input_level": metering.get("input_level", -100.0),
            "output_level": metering.get("output_level", -100.0),
            "preamp_level": metering.get("preamp_level", -100.0),
            "power_level": metering.get("power_level", -100.0),
            "supply_sag": metering.get("supply_sag", 1.0),
            "cpu_load": metering.get("cpu_load", 0.0)
        }

    async def get_peavey5150_presets(self) -> List[Dict[str, str]]:
        """Get all available Peavey 5150 presets"""
        return [
            {"id": "manual", "name": "Manual", "description": "User-defined settings"},
            {"id": "brown_sound", "name": "Brown Sound", "description": "Classic Van Halen studio tone"},
            {"id": "pantera_scoop", "name": "Pantera Scoop", "description": "Scooped mids, high gain, cold bias"},
            {"id": "modern_metal", "name": "Modern Metal", "description": "Maximum gain, cold bias, high presence"},
            {"id": "hard_rock", "name": "Hard Rock", "description": "Medium gain, bumped mids, warm power"},
            {"id": "crunch", "name": "Crunch", "description": "Low gain, bright switch, touch sensitive"}
        ]

    # ============================================================
    # Tweed Bassman 5F6-A Amplifier Simulator
    # ============================================================

    async def set_tweedbassman_bypass(self, bypass: bool) -> None:
        if self._engine:
            self._engine.set_tweedbassman_bypass(bypass)

    async def set_tweedbassman_channel_mode(self, mode: int) -> None:
        if self._engine:
            self._engine.set_tweedbassman_channel_mode(mode)

    async def set_tweedbassman_normal_volume(self, value: float) -> None:
        if self._engine:
            self._engine.set_tweedbassman_normal_volume(value)

    async def set_tweedbassman_bright_volume(self, value: float) -> None:
        if self._engine:
            self._engine.set_tweedbassman_bright_volume(value)

    async def set_tweedbassman_bright_cap(self, on: bool) -> None:
        if self._engine:
            self._engine.set_tweedbassman_bright_cap(on)

    async def set_tweedbassman_v1_tube_type(self, type: int) -> None:
        if self._engine:
            self._engine.set_tweedbassman_v1_tube_type(type)

    async def set_tweedbassman_cathode_bypass(self, on: bool) -> None:
        if self._engine:
            self._engine.set_tweedbassman_cathode_bypass(on)

    async def set_tweedbassman_cathode_bias(self, mode: int) -> None:
        if self._engine:
            self._engine.set_tweedbassman_cathode_bias(mode)

    async def set_tweedbassman_treble(self, value: float) -> None:
        if self._engine:
            self._engine.set_tweedbassman_treble(value)

    async def set_tweedbassman_mid(self, value: float) -> None:
        if self._engine:
            self._engine.set_tweedbassman_mid(value)

    async def set_tweedbassman_bass(self, value: float) -> None:
        if self._engine:
            self._engine.set_tweedbassman_bass(value)

    async def set_tweedbassman_raw_switch(self, on: bool) -> None:
        if self._engine:
            self._engine.set_tweedbassman_raw_switch(on)

    async def set_tweedbassman_master_volume(self, value: float) -> None:
        if self._engine:
            self._engine.set_tweedbassman_master_volume(value)

    async def set_tweedbassman_presence(self, value: float) -> None:
        if self._engine:
            self._engine.set_tweedbassman_presence(value)

    async def set_tweedbassman_nfb_mode(self, mode: int) -> None:
        if self._engine:
            self._engine.set_tweedbassman_nfb_mode(mode)

    async def set_tweedbassman_power_tube_type(self, type: int) -> None:
        if self._engine:
            self._engine.set_tweedbassman_power_tube_type(type)

    async def set_tweedbassman_bias_mode(self, mode: int) -> None:
        if self._engine:
            self._engine.set_tweedbassman_bias_mode(mode)

    async def set_tweedbassman_rectifier_type(self, type: int) -> None:
        if self._engine:
            self._engine.set_tweedbassman_rectifier_type(type)

    async def set_tweedbassman_output_level(self, dB: float) -> None:
        if self._engine:
            self._engine.set_tweedbassman_output_level(dB)

    async def set_tweedbassman_cabinet_enabled(self, on: bool) -> None:
        if self._engine:
            self._engine.set_tweedbassman_cabinet_enabled(on)

    async def set_tweedbassman_cabinet_ir(self, index: int) -> None:
        if self._engine:
            self._engine.set_tweedbassman_cabinet_ir(index)

    async def set_tweedbassman_preset(self, preset_name: str) -> None:
        if self._engine:
            self._engine.set_tweedbassman_preset(preset_name)

    async def get_tweedbassman_parameters(self) -> Dict[str, Any]:
        if not self._engine:
            return {
                "channel_mode": 0, "normal_volume": 5.0, "bright_volume": 5.0, "bright_cap": True,
                "v1_tube_type": 0, "cathode_bypass": False, "cathode_bias": 0,
                "treble": 5.0, "mid": 5.0, "bass": 5.0, "raw_switch": False,
                "master_volume": 5.0, "presence": 5.0, "nfb_mode": 0,
                "power_tube_type": 0, "bias_mode": 0, "rectifier_type": 0,
                "output_level": 0.0, "cabinet_enabled": True, "cabinet_ir": 0,
                "preset": 0, "preset_name": "manual", "bypass": False
            }
        params = self._engine.get_tweedbassman_parameters()
        return {
            "channel_mode": params.get("channel_mode", 0),
            "normal_volume": params.get("normal_volume", 5.0),
            "bright_volume": params.get("bright_volume", 5.0),
            "bright_cap": params.get("bright_cap", True),
            "v1_tube_type": params.get("v1_tube_type", 0),
            "cathode_bypass": params.get("cathode_bypass", False),
            "cathode_bias": params.get("cathode_bias", 0),
            "treble": params.get("treble", 5.0),
            "mid": params.get("mid", 5.0),
            "bass": params.get("bass", 5.0),
            "raw_switch": params.get("raw_switch", False),
            "master_volume": params.get("master_volume", 5.0),
            "presence": params.get("presence", 5.0),
            "nfb_mode": params.get("nfb_mode", 0),
            "power_tube_type": params.get("power_tube_type", 0),
            "bias_mode": params.get("bias_mode", 0),
            "rectifier_type": params.get("rectifier_type", 0),
            "output_level": params.get("output_level", 0.0),
            "cabinet_enabled": params.get("cabinet_enabled", True),
            "cabinet_ir": params.get("cabinet_ir", 0),
            "preset": params.get("preset", 0),
            "preset_name": params.get("preset_name", "manual"),
            "bypass": params.get("bypass", False)
        }

    async def get_tweedbassman_metering(self) -> Dict[str, float]:
        if not self._engine:
            return {
                "input_level": -100.0, "output_level": -100.0,
                "preamp_level": -100.0, "power_level": -100.0,
                "supply_sag": 1.0, "cpu_load": 0.0
            }
        metering = self._engine.get_tweedbassman_metering()
        return {
            "input_level": metering.get("input_level", -100.0),
            "output_level": metering.get("output_level", -100.0),
            "preamp_level": metering.get("preamp_level", -100.0),
            "power_level": metering.get("power_level", -100.0),
            "supply_sag": metering.get("supply_sag", 1.0),
            "cpu_load": metering.get("cpu_load", 0.0)
        }

    async def get_tweedbassman_presets(self) -> List[Dict[str, str]]:
        return [
            {"id": "manual", "name": "Manual", "description": "User-defined settings"},
            {"id": "stock_5f6a", "name": "Stock 5F6-A", "description": "All stock, clean to edge of breakup"},
            {"id": "cranked_tweed", "name": "Cranked Tweed", "description": "Classic pushed Bassman"},
            {"id": "blues_breakup", "name": "Blues Breakup", "description": "Warm, touch-sensitive"},
            {"id": "country_clean", "name": "Country Clean", "description": "Sparkly headroom"},
            {"id": "jumped_dirty", "name": "Jumped & Dirty", "description": "Fat overdriven tone"},
            {"id": "high_gain_mod", "name": "High Gain Mod", "description": "Hot-rodded preamp"},
            {"id": "neil_young", "name": "Neil Young", "description": "Ragged, searing leads"},
            {"id": "tweed_deluxe", "name": "Tweed Deluxe", "description": "Simulates 5E3 character"},
            {"id": "jtm45_flavor", "name": "JTM45 Flavor", "description": "Marshall-esque"},
            {"id": "sag_monster", "name": "Sag Monster", "description": "Maximum compression/bloom"},
            {"id": "pedal_platform", "name": "Pedal Platform", "description": "Maximum clean headroom"},
            {"id": "bright_chimey", "name": "Bright & Chimey", "description": "Fender sparkle"},
            {"id": "srv_tone", "name": "SRV Tone", "description": "Thick Texas blues"},
            {"id": "recording_di", "name": "Recording DI", "description": "Balanced, mix-ready"},
        ]

    # ============================================================
    # PassionFX Multi-Effect (Steve Vai Passion & Warfare)
    # ============================================================

    async def set_passionfx_bypass(self, bypass: bool) -> None:
        if self._engine:
            self._engine.set_passionfx_bypass(bypass)

    async def set_passionfx_gate_enabled(self, enabled: bool) -> None:
        if self._engine:
            self._engine.set_passionfx_gate_enabled(enabled)

    async def set_passionfx_gate_threshold(self, dB: float) -> None:
        if self._engine:
            self._engine.set_passionfx_gate_threshold(dB)

    async def set_passionfx_gate_release(self, ms: float) -> None:
        if self._engine:
            self._engine.set_passionfx_gate_release(ms)

    async def set_passionfx_comp_enabled(self, enabled: bool) -> None:
        if self._engine:
            self._engine.set_passionfx_comp_enabled(enabled)

    async def set_passionfx_comp_threshold(self, dB: float) -> None:
        if self._engine:
            self._engine.set_passionfx_comp_threshold(dB)

    async def set_passionfx_comp_ratio(self, ratio: float) -> None:
        if self._engine:
            self._engine.set_passionfx_comp_ratio(ratio)

    async def set_passionfx_comp_attack(self, ms: float) -> None:
        if self._engine:
            self._engine.set_passionfx_comp_attack(ms)

    async def set_passionfx_comp_release(self, ms: float) -> None:
        if self._engine:
            self._engine.set_passionfx_comp_release(ms)

    async def set_passionfx_comp_glassy(self, glassy: bool) -> None:
        if self._engine:
            self._engine.set_passionfx_comp_glassy(glassy)

    async def set_passionfx_wah_enabled(self, enabled: bool) -> None:
        if self._engine:
            self._engine.set_passionfx_wah_enabled(enabled)

    async def set_passionfx_wah_mode(self, mode: int) -> None:
        if self._engine:
            self._engine.set_passionfx_wah_mode(mode)

    async def set_passionfx_wah_position(self, position: float) -> None:
        if self._engine:
            self._engine.set_passionfx_wah_position(position)

    async def set_passionfx_wah_q(self, q: float) -> None:
        if self._engine:
            self._engine.set_passionfx_wah_q(q)

    async def set_passionfx_phaser_enabled(self, enabled: bool) -> None:
        if self._engine:
            self._engine.set_passionfx_phaser_enabled(enabled)

    async def set_passionfx_phaser_rate(self, hz: float) -> None:
        if self._engine:
            self._engine.set_passionfx_phaser_rate(hz)

    async def set_passionfx_phaser_depth(self, depth: float) -> None:
        if self._engine:
            self._engine.set_passionfx_phaser_depth(depth)

    async def set_passionfx_phaser_stages(self, stages: int) -> None:
        if self._engine:
            self._engine.set_passionfx_phaser_stages(stages)

    async def set_passionfx_phaser_feedback(self, feedback: float) -> None:
        if self._engine:
            self._engine.set_passionfx_phaser_feedback(feedback)

    async def set_passionfx_chorus_enabled(self, enabled: bool) -> None:
        if self._engine:
            self._engine.set_passionfx_chorus_enabled(enabled)

    async def set_passionfx_chorus_rate(self, hz: float) -> None:
        if self._engine:
            self._engine.set_passionfx_chorus_rate(hz)

    async def set_passionfx_chorus_depth(self, depth: float) -> None:
        if self._engine:
            self._engine.set_passionfx_chorus_depth(depth)

    async def set_passionfx_chorus_voices(self, voices: int) -> None:
        if self._engine:
            self._engine.set_passionfx_chorus_voices(voices)

    async def set_passionfx_chorus_mix(self, mix: float) -> None:
        if self._engine:
            self._engine.set_passionfx_chorus_mix(mix)

    async def set_passionfx_pitch_enabled(self, enabled: bool) -> None:
        if self._engine:
            self._engine.set_passionfx_pitch_enabled(enabled)

    async def set_passionfx_pitch_semitones(self, semitones: float) -> None:
        if self._engine:
            self._engine.set_passionfx_pitch_semitones(semitones)

    async def set_passionfx_pitch_mix(self, mix: float) -> None:
        if self._engine:
            self._engine.set_passionfx_pitch_mix(mix)

    async def set_passionfx_harm_enabled(self, enabled: bool) -> None:
        if self._engine:
            self._engine.set_passionfx_harm_enabled(enabled)

    async def set_passionfx_harm_voice1_interval(self, semitones: float) -> None:
        if self._engine:
            self._engine.set_passionfx_harm_voice1_interval(semitones)

    async def set_passionfx_harm_voice2_interval(self, semitones: float) -> None:
        if self._engine:
            self._engine.set_passionfx_harm_voice2_interval(semitones)

    async def set_passionfx_harm_detune_cents(self, cents: float) -> None:
        if self._engine:
            self._engine.set_passionfx_harm_detune_cents(cents)

    async def set_passionfx_harm_mix(self, mix: float) -> None:
        if self._engine:
            self._engine.set_passionfx_harm_mix(mix)

    async def set_passionfx_delay_enabled(self, enabled: bool) -> None:
        if self._engine:
            self._engine.set_passionfx_delay_enabled(enabled)

    async def set_passionfx_delay_time_l(self, ms: float) -> None:
        if self._engine:
            self._engine.set_passionfx_delay_time_l(ms)

    async def set_passionfx_delay_time_r(self, ms: float) -> None:
        if self._engine:
            self._engine.set_passionfx_delay_time_r(ms)

    async def set_passionfx_delay_feedback(self, feedback: float) -> None:
        if self._engine:
            self._engine.set_passionfx_delay_feedback(feedback)

    async def set_passionfx_delay_mix(self, mix: float) -> None:
        if self._engine:
            self._engine.set_passionfx_delay_mix(mix)

    async def set_passionfx_delay_freeze(self, freeze: bool) -> None:
        if self._engine:
            self._engine.set_passionfx_delay_freeze(freeze)

    async def set_passionfx_delay_pitch_shift_l(self, semitones: float) -> None:
        if self._engine:
            self._engine.set_passionfx_delay_pitch_shift_l(semitones)

    async def set_passionfx_delay_pitch_shift_r(self, semitones: float) -> None:
        if self._engine:
            self._engine.set_passionfx_delay_pitch_shift_r(semitones)

    async def set_passionfx_reverb_enabled(self, enabled: bool) -> None:
        if self._engine:
            self._engine.set_passionfx_reverb_enabled(enabled)

    async def set_passionfx_reverb_type(self, rtype: int) -> None:
        if self._engine:
            self._engine.set_passionfx_reverb_type(rtype)

    async def set_passionfx_reverb_decay(self, seconds: float) -> None:
        if self._engine:
            self._engine.set_passionfx_reverb_decay(seconds)

    async def set_passionfx_reverb_shimmer_amount(self, amount: float) -> None:
        if self._engine:
            self._engine.set_passionfx_reverb_shimmer_amount(amount)

    async def set_passionfx_reverb_shimmer_interval(self, semitones: float) -> None:
        if self._engine:
            self._engine.set_passionfx_reverb_shimmer_interval(semitones)

    async def set_passionfx_reverb_mix(self, mix: float) -> None:
        if self._engine:
            self._engine.set_passionfx_reverb_mix(mix)

    async def set_passionfx_reverb_freeze(self, freeze: bool) -> None:
        if self._engine:
            self._engine.set_passionfx_reverb_freeze(freeze)

    async def set_passionfx_eq_enabled(self, enabled: bool) -> None:
        if self._engine:
            self._engine.set_passionfx_eq_enabled(enabled)

    async def set_passionfx_eq_low_gain(self, dB: float) -> None:
        if self._engine:
            self._engine.set_passionfx_eq_low_gain(dB)

    async def set_passionfx_eq_mid_gain(self, dB: float) -> None:
        if self._engine:
            self._engine.set_passionfx_eq_mid_gain(dB)

    async def set_passionfx_eq_high_gain(self, dB: float) -> None:
        if self._engine:
            self._engine.set_passionfx_eq_high_gain(dB)

    async def set_passionfx_eq_tilt(self, tilt: float) -> None:
        if self._engine:
            self._engine.set_passionfx_eq_tilt(tilt)

    async def set_passionfx_exciter_enabled(self, enabled: bool) -> None:
        if self._engine:
            self._engine.set_passionfx_exciter_enabled(enabled)

    async def set_passionfx_exciter_warmth(self, warmth: float) -> None:
        if self._engine:
            self._engine.set_passionfx_exciter_warmth(warmth)

    async def set_passionfx_exciter_presence(self, presence: float) -> None:
        if self._engine:
            self._engine.set_passionfx_exciter_presence(presence)

    async def set_passionfx_exciter_air(self, air: float) -> None:
        if self._engine:
            self._engine.set_passionfx_exciter_air(air)

    async def set_passionfx_trem_enabled(self, enabled: bool) -> None:
        if self._engine:
            self._engine.set_passionfx_trem_enabled(enabled)

    async def set_passionfx_trem_rate(self, hz: float) -> None:
        if self._engine:
            self._engine.set_passionfx_trem_rate(hz)

    async def set_passionfx_trem_depth(self, depth: float) -> None:
        if self._engine:
            self._engine.set_passionfx_trem_depth(depth)

    async def set_passionfx_trem_waveform(self, waveform: int) -> None:
        if self._engine:
            self._engine.set_passionfx_trem_waveform(waveform)

    async def set_passionfx_mix(self, mix: float) -> None:
        if self._engine:
            self._engine.set_passionfx_mix(mix)

    async def set_passionfx_output_level(self, dB: float) -> None:
        if self._engine:
            self._engine.set_passionfx_output_level(dB)

    async def set_passionfx_preset(self, preset_name: str) -> None:
        if self._engine:
            self._engine.set_passionfx_preset(preset_name)

    async def get_passionfx_parameters(self) -> Dict[str, Any]:
        if not self._engine:
            return {
                "gate_enabled": False, "gate_threshold": -40.0, "gate_release": 100.0,
                "comp_enabled": False, "comp_threshold": -20.0, "comp_ratio": 4.0,
                "comp_attack": 10.0, "comp_release": 100.0, "comp_glassy": False,
                "wah_enabled": False, "wah_mode": 0, "wah_position": 0.5, "wah_q": 5.0,
                "phaser_enabled": False, "phaser_rate": 0.5, "phaser_depth": 0.5,
                "phaser_stages": 4, "phaser_feedback": 0.3,
                "chorus_enabled": False, "chorus_rate": 0.8, "chorus_depth": 0.5,
                "chorus_voices": 3, "chorus_mix": 0.5,
                "pitch_enabled": False, "pitch_semitones": 0.0, "pitch_mix": 0.5,
                "harm_enabled": False, "harm_voice1_interval": 4.0, "harm_voice2_interval": 7.0,
                "harm_detune_cents": 5.0, "harm_mix": 0.5,
                "delay_enabled": False, "delay_time_l": 375.0, "delay_time_r": 500.0,
                "delay_feedback": 0.35, "delay_mix": 0.4, "delay_freeze": False,
                "delay_pitch_shift_l": 0.0, "delay_pitch_shift_r": 0.0,
                "reverb_enabled": False, "reverb_type": 0, "reverb_decay": 2.5,
                "reverb_shimmer_amount": 0.0, "reverb_shimmer_interval": 12.0,
                "reverb_mix": 0.3, "reverb_freeze": False,
                "eq_enabled": False, "eq_low_gain": 0.0, "eq_mid_gain": 0.0,
                "eq_high_gain": 0.0, "eq_tilt": 0.0,
                "exciter_enabled": False, "exciter_warmth": 0.0,
                "exciter_presence": 0.0, "exciter_air": 0.0,
                "trem_enabled": False, "trem_rate": 5.0, "trem_depth": 0.5, "trem_waveform": 0,
                "mix": 1.0, "output_level": 0.0,
                "preset": 0, "preset_name": "manual", "bypass": False
            }
        return dict(self._engine.get_passionfx_parameters())

    async def get_passionfx_metering(self) -> Dict[str, float]:
        if not self._engine:
            return {
                "input_level_l": -100.0, "input_level_r": -100.0,
                "output_level_l": -100.0, "output_level_r": -100.0,
                "gate_gain": 1.0, "comp_gain_reduction": 0.0,
                "reverb_level_l": -100.0, "reverb_level_r": -100.0,
                "delay_level_l": -100.0, "delay_level_r": -100.0,
                "phaser_lfo_phase": 0.0, "tremolo_lfo_phase": 0.0,
                "wah_position": 0.5
            }
        return dict(self._engine.get_passionfx_metering())

    async def get_passionfx_presets(self) -> List[Dict[str, str]]:
        if self._engine:
            return [dict(p) for p in self._engine.get_passionfx_presets()]
        return [
            {"id": "manual", "name": "Manual", "track": "", "description": "User-defined settings"},
            {"id": "liberty", "name": "Liberty", "track": "Track 1", "description": "Soaring clean lead"},
            {"id": "erotic_nightmares", "name": "Erotic Nightmares", "track": "Track 2", "description": "Aggressive dark"},
            {"id": "the_animal", "name": "The Animal", "track": "Track 3", "description": "Raw primal overdrive"},
            {"id": "answers", "name": "Answers", "track": "Track 4", "description": "Emotional ballad shimmer"},
            {"id": "the_riddle", "name": "The Riddle", "track": "Track 5", "description": "Mysterious phased"},
            {"id": "ballerina_12_24", "name": "Ballerina 12/24", "track": "Track 6", "description": "Delicate harmonics"},
            {"id": "for_the_love_of_god", "name": "For the Love of God", "track": "Track 7", "description": "Epic sustain & reverb"},
            {"id": "the_audience_is_listening", "name": "The Audience Is Listening", "track": "Track 8", "description": "Wah-heavy funk"},
            {"id": "i_would_love_to", "name": "I Would Love To", "track": "Track 9", "description": "Lush chorus & delay"},
            {"id": "blue_powder", "name": "Blue Powder", "track": "Track 10", "description": "Jazzy clean warm"},
            {"id": "greasy_kids_stuff", "name": "Greasy Kid's Stuff", "track": "Track 11", "description": "Funky wah tremolo"},
            {"id": "alien_water_kiss", "name": "Alien Water Kiss", "track": "Track 12", "description": "Pitch-shifted ambient"},
            {"id": "sisters", "name": "Sisters", "track": "Track 13", "description": "Harmonized lead"},
            {"id": "love_secrets", "name": "Love Secrets", "track": "Track 14", "description": "Shredding with tight delay"}
        ]


# Singleton accessor using base class
def get_audio_engine() -> JuceEngineService:
    """Get or create JUCE audio engine service instance."""
    return JuceEngineService.get_instance()
