"""
JUCE Audio Engine Service
MAP2 Audio Engine - JUCE-based LV2 host

Provides Python wrapper for MAP2 Audio Engine
"""

import logging
import sys
from typing import Optional, List, Dict, Any
from dataclasses import dataclass

from app.utils.singleton import Singleton
from app.utils.dependencies import DependencyChecker
from app.utils.logging_utils import get_logger

logger = get_logger(__name__)

# Check JUCE availability using dependency checker
sys.path.insert(0, '/home/mm/map2-audio/juce-engine/build')
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
    "buffer_size": 256,
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
    "buffer_size": 256,
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

            # Configure
            self._engine.set_sample_rate(self.config.sample_rate)
            self._engine.set_buffer_size(self.config.buffer_size)
            self._engine.set_audio_device(self.config.audio_device)
            self._engine.set_lv2_path(self.config.lv2_path)

            # Configure channel counts (for multi-channel interfaces like UA-1000)
            self._engine.set_num_input_channels(self.config.input_channels)
            self._engine.set_num_output_channels(self.config.output_channels)
            logger.info(f"Configuring audio: {self.config.input_channels} inputs, "
                       f"{self.config.output_channels} outputs")

            # Initialize
            result = self._engine.initialize(self.config.config_file)
            
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
        return self._engine.start_audio()
    
    async def stop_audio(self) -> bool:
        """Stop audio processing"""
        if not self._engine:
            return False
        return self._engine.stop_audio()
    
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
        return self._engine.list_plugins()
    
    async def load_plugin(self, uri: str) -> int:
        """Load a plugin by URI, returns instance ID"""
        if not self._engine:
            return -1
        return self._engine.load_plugin(uri)
    
    async def unload_plugin(self, instance_id: int) -> bool:
        """Unload a plugin by instance ID"""
        if not self._engine:
            return False
        return self._engine.unload_plugin(instance_id)
    
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


# Singleton accessor using base class
def get_audio_engine() -> JuceEngineService:
    """Get or create JUCE audio engine service instance."""
    return JuceEngineService.get_instance()
