
"""
Native Plugin Adapter

Adapts native MAP2 audio processors (NAM, IR Loader, ReevR) to work
as chain-compatible plugin effects with standard parameter interfaces.
Implements PluginBase for unified abstraction.
"""


import logging
from typing import Dict, Any, Optional, List
import numpy as np
from .plugin_base import PluginBase

logger = logging.getLogger(__name__)



class NativePluginAdapter(PluginBase):
    """
    Base adapter class for native audio processors.
    Implements PluginBase for chain integration.
    """

    def __init__(self, uri: str, name: str):
        super().__init__(uri)
        self.name = name
        self.parameters: Dict[str, Any] = {}

    def process_audio(self, input_buffer: np.ndarray) -> np.ndarray:
        if self.bypassed:
            return input_buffer
        return self._process_internal(input_buffer)

    def _process_internal(self, input_audio: np.ndarray) -> np.ndarray:
        return input_audio


    def set_parameter(self, name: str, value: Any) -> None:
        if name == "bypass":
            self.bypassed = bool(value)
            return
        self.parameters[name] = value
        self._apply_parameter(name, value)


    def _apply_parameter(self, name: str, value: Any) -> bool:
        return True


    def get_parameters(self) -> Dict[str, Any]:
        return dict(self.parameters)


    def serialize_state(self) -> Dict[str, Any]:
        return {
            "parameters": self.get_parameters(),
            "bypassed": self.bypassed
        }

    def deserialize_state(self, state: Dict[str, Any]) -> None:
        params = state.get("parameters", {})
        for k, v in params.items():
            self.set_parameter(k, v)
        self.bypassed = state.get("bypassed", False)


class NAMLoaderAdapter(NativePluginAdapter):
    """
    Adapter for NAM (Neural Amp Modeler) processor.
    """

    def __init__(self):
        super().__init__(
            uri="http://map2-audio.local/nam-loader",
            name="MAP2 NAM Loader"
        )
        self.nam_processor = None
        self.mix = 1.0
        self.current_model = None

        # Lazy import to avoid dependency errors
        try:
            from app.services.nam_processor import get_nam_processor
            self.nam_processor = get_nam_processor()
        except Exception as e:
            logger.warning(f"NAM processor unavailable: {e}")


    def _process_internal(self, input_audio: np.ndarray) -> np.ndarray:
        if self.nam_processor is None:
            return input_audio
        try:
            wet = self.nam_processor.process_audio(input_audio)
            if self.mix < 1.0:
                dry = input_audio
                output = (1.0 - self.mix) * dry + self.mix * wet
                return output
            else:
                return wet
        except Exception as e:
            logger.error(f"NAM processing error: {e}")
            return input_audio


    def _apply_parameter(self, name: str, value: Any) -> bool:
        if name == "model":
            return self._load_model(str(value))
        elif name == "mix":
            self.mix = float(np.clip(value, 0.0, 1.0))
            return True
        return False

    def _load_model(self, model_name: str) -> bool:
        """Load NAM model file."""
        if self.nam_processor is None:
            return False

        try:
            self.nam_processor.load_model(model_name)
            self.nam_processor.set_active_model(model_name)
            self.current_model = model_name
            logger.info(f"Loaded NAM model: {model_name}")
            return True
        except Exception as e:
            logger.error(f"Failed to load NAM model {model_name}: {e}")
            return False


class CabinetIRLoaderAdapter(NativePluginAdapter):
    """
    Adapter for Cabinet IR loader processor.
    """

    def __init__(self):
        super().__init__(
            uri="http://map2-audio.local/ir-cabinet-loader",
            name="MAP2 Cabinet IR Loader"
        )
        self.ir_processor = None
        self.mix = 1.0
        self.current_ir = None

        # Lazy import
        try:
            from app.services.ir_processor import get_ir_processor
            self.ir_processor = get_ir_processor()
        except Exception as e:
            logger.warning(f"IR processor unavailable: {e}")

    def _process_internal(self, input_audio: np.ndarray) -> np.ndarray:
        """Process audio through cabinet IR."""
        if self.ir_processor is None:
            return input_audio

        try:
            # Process through cabinet IR
            wet = self.ir_processor.process_cabinet(input_audio)

            # Apply mix
            if self.mix < 1.0:
                dry = input_audio
                output = (1.0 - self.mix) * dry + self.mix * wet
                return output
            else:
                return wet

        except Exception as e:
            logger.error(f"Cabinet IR processing error: {e}")
            return input_audio

    def _apply_parameter(self, symbol: str, value: Any) -> bool:
        """Apply parameter to cabinet IR."""
        if symbol == "ir_file":
            return self._load_ir(str(value))
        elif symbol == "mix":
            self.mix = float(np.clip(value, 0.0, 1.0))
            return True
        return False

    def _load_ir(self, ir_name: str) -> bool:
        """Load cabinet IR file."""
        if self.ir_processor is None:
            return False

        try:
            self.ir_processor.load_ir(ir_name, ir_type="cabinet")
            self.current_ir = ir_name
            logger.info(f"Loaded cabinet IR: {ir_name}")
            return True
        except Exception as e:
            logger.error(f"Failed to load cabinet IR {ir_name}: {e}")
            return False


class ReverbIRLoaderAdapter(NativePluginAdapter):
    """
    Adapter for Reverb IR loader processor.
    """

    def __init__(self):
        super().__init__(
            uri="http://map2-audio.local/ir-reverb-loader",
            name="MAP2 Reverb IR Loader"
        )
        self.ir_processor = None
        self.mix = 0.3
        self.current_ir = None

        # Lazy import
        try:
            from app.services.ir_processor import get_ir_processor
            self.ir_processor = get_ir_processor()
        except Exception as e:
            logger.warning(f"IR processor unavailable: {e}")

    def _process_internal(self, input_audio: np.ndarray) -> np.ndarray:
        """Process audio through reverb IR."""
        if self.ir_processor is None:
            return input_audio

        try:
            # Process through reverb IR
            wet = self.ir_processor.process_reverb(input_audio)

            # Apply mix
            if self.mix < 1.0:
                dry = input_audio
                output = (1.0 - self.mix) * dry + self.mix * wet
                return output
            else:
                return wet

        except Exception as e:
            logger.error(f"Reverb IR processing error: {e}")
            return input_audio

    def _apply_parameter(self, symbol: str, value: Any) -> bool:
        """Apply parameter to reverb IR."""
        if symbol == "ir_file":
            return self._load_ir(str(value))
        elif symbol == "mix":
            self.mix = float(np.clip(value, 0.0, 1.0))
            return True
        return False

    def _load_ir(self, ir_name: str) -> bool:
        """Load reverb IR file."""
        if self.ir_processor is None:
            return False

        try:
            self.ir_processor.load_ir(ir_name, ir_type="reverb")
            self.current_ir = ir_name
            logger.info(f"Loaded reverb IR: {ir_name}")
            return True
        except Exception as e:
            logger.error(f"Failed to load reverb IR {ir_name}: {e}")
            return False


class CocoaDelayAdapter(NativePluginAdapter):
    """
    Adapter for Cocoa Delay processor.
    Features: delay time drift, wet level ducking, pan modes, drive section.
    Based on tesselode/cocoa-delay.
    """

    def __init__(self):
        super().__init__(
            uri="http://map2-audio.local/cocoa-delay",
            name="MAP2 Cocoa Delay"
        )
        self.delay_processor = None
        self.mix = 0.5
        self.delay_time = 375  # ms
        self.feedback = 0.4
        self.drift = 0.0
        self.ducking = 0.0
        self.pan_mode = 'static'
        self.pan = 0.0
        self.drive_enabled = False
        self.drive_amount = 0.0
        self.low_cut = 80  # Hz
        self.high_cut = 12000  # Hz
        self.tempo_sync = False
        self.sync_division = '1/4'

        # Lazy import
        try:
            from app.services.delay_processor import get_delay_processor
            self.delay_processor = get_delay_processor()
        except Exception as e:
            logger.warning(f"Delay processor unavailable: {e}")

    def _process_internal(self, input_audio: np.ndarray) -> np.ndarray:
        """Process audio through Cocoa Delay."""
        if self.delay_processor is None:
            return input_audio

        try:
            # Process through delay
            wet = self.delay_processor.process(input_audio)

            # Apply mix
            if self.mix < 1.0:
                dry = input_audio
                output = (1.0 - self.mix) * dry + self.mix * wet
                return output
            else:
                return wet

        except Exception as e:
            logger.error(f"Cocoa Delay processing error: {e}")
            return input_audio

    def _apply_parameter(self, symbol: str, value: Any) -> bool:
        """Apply parameter to Cocoa Delay processor."""
        try:
            if symbol == "mix":
                self.mix = float(np.clip(value, 0.0, 1.0))
                return True
            elif symbol == "delay_time":
                self.delay_time = float(np.clip(value, 1, 2000))
                if self.delay_processor:
                    self.delay_processor.set_delay_time(self.delay_time)
                return True
            elif symbol == "feedback":
                self.feedback = float(np.clip(value, 0.0, 1.0))
                if self.delay_processor:
                    self.delay_processor.set_feedback(self.feedback)
                return True
            elif symbol == "drift":
                self.drift = float(np.clip(value, 0.0, 1.0))
                if self.delay_processor:
                    self.delay_processor.set_drift(self.drift)
                return True
            elif symbol == "ducking":
                self.ducking = float(np.clip(value, 0.0, 1.0))
                if self.delay_processor:
                    self.delay_processor.set_ducking(self.ducking)
                return True
            elif symbol == "pan_mode":
                if value in ('static', 'pingpong', 'circular'):
                    self.pan_mode = value
                    if self.delay_processor:
                        self.delay_processor.set_pan_mode(value)
                    return True
            elif symbol == "pan":
                self.pan = float(np.clip(value, -1.0, 1.0))
                if self.delay_processor:
                    self.delay_processor.set_pan(self.pan)
                return True
            elif symbol == "drive_enabled":
                self.drive_enabled = bool(value)
                if self.delay_processor:
                    self.delay_processor.set_drive_enabled(self.drive_enabled)
                return True
            elif symbol == "drive_amount":
                self.drive_amount = float(np.clip(value, 0.0, 1.0))
                if self.delay_processor:
                    self.delay_processor.set_drive_amount(self.drive_amount)
                return True
            elif symbol == "low_cut":
                self.low_cut = float(np.clip(value, 20, 2000))
                if self.delay_processor:
                    self.delay_processor.set_low_cut(self.low_cut)
                return True
            elif symbol == "high_cut":
                self.high_cut = float(np.clip(value, 1000, 20000))
                if self.delay_processor:
                    self.delay_processor.set_high_cut(self.high_cut)
                return True
        except Exception as e:
            logger.error(f"Failed to set Cocoa Delay parameter {symbol}: {e}")
            return False

        return False

    def get_latency(self) -> int:
        """Get Cocoa Delay latency."""
        # Delay plugins typically have minimal processing latency
        return 0


class ReevREngineAdapter(NativePluginAdapter):
    """
    Adapter for ReevR convolution reverb engine.
    """

    def __init__(self):
        super().__init__(
            uri="http://map2-audio.local/reevr-engine",
            name="MAP2 ReevR Convolution Reverb"
        )
        self.reevr = None
        self.current_ir = None

        # Lazy import
        try:
            from app.services.reevr_engine import get_reevr_engine
            self.reevr = get_reevr_engine()
        except Exception as e:
            logger.warning(f"ReevR engine unavailable: {e}")

    def _process_internal(self, input_audio: np.ndarray) -> np.ndarray:
        """Process audio through ReevR engine."""
        if self.reevr is None:
            return input_audio

        try:
            return self.reevr.process(input_audio)
        except Exception as e:
            logger.error(f"ReevR processing error: {e}")
            return input_audio

    def _apply_parameter(self, symbol: str, value: Any) -> bool:
        """Apply parameter to ReevR engine."""
        if self.reevr is None:
            return False

        try:
            if symbol == "ir_file":
                return self._load_ir(str(value))
            elif symbol == "dry_wet_mix":
                self.reevr.set_dry_wet_mix(float(value))
                return True
            elif symbol == "predelay_ms":
                self.reevr.set_predelay(float(value))
                return True
        except Exception as e:
            logger.error(f"Failed to set ReevR parameter {symbol}: {e}")
            return False

        return False

    def _load_ir(self, ir_path: str) -> bool:
        """Load IR file into ReevR engine."""
        if self.reevr is None:
            return False

        try:
            self.reevr.load_ir(ir_path)
            self.current_ir = ir_path
            logger.info(f"Loaded IR into ReevR: {ir_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to load IR {ir_path} into ReevR: {e}")
            return False

    def get_latency(self) -> int:
        """Get ReevR latency."""
        if self.reevr is None:
            return 0

        try:
            return self.reevr.get_latency()
        except:
            return 0


class ZitaAT1Adapter(NativePluginAdapter):
    """
    Adapter for Zita AT1 auto-tuner processor.
    Features: pitch correction, note selection, MIDI control, low latency mode.
    Based on Fons Adriaensen's zita-at1.
    """

    def __init__(self):
        super().__init__(
            uri="http://map2-audio.local/zita-at1",
            name="MAP2 Zita AT1 Auto-Tune"
        )
        self.autotune_processor = None
        # Reference tuning
        self.tuning = 440.0  # Hz
        # Correction parameters
        self.bias = 0.5      # Preference for current note (0-1)
        self.filter = 0.5    # Smoothing amount (0-1)
        self.correction = 1.0  # How much pitch error gets corrected (0-1)
        self.offset = 0      # Pitch offset in cents (-200 to 200)
        # Note selection (C, C#, D, D#, E, F, F#, G, G#, A, A#, B)
        self.enabled_notes = [True] * 12
        # MIDI control
        self.midi_enabled = False
        self.midi_channel = 0  # 0 = Omni
        # Mode
        self.low_latency_mode = False

        # Lazy import
        try:
            from app.services.autotune_processor import get_autotune_processor
            self.autotune_processor = get_autotune_processor()
        except Exception as e:
            logger.warning(f"Auto-tune processor unavailable: {e}")

    def _process_internal(self, input_audio: np.ndarray) -> np.ndarray:
        """Process audio through Zita AT1."""
        if self.autotune_processor is None:
            return input_audio

        try:
            return self.autotune_processor.process(input_audio)
        except Exception as e:
            logger.error(f"Zita AT1 processing error: {e}")
            return input_audio

    def _apply_parameter(self, symbol: str, value: Any) -> bool:
        """Apply parameter to Zita AT1 processor."""
        try:
            if symbol == "tuning":
                self.tuning = float(np.clip(value, 430.0, 450.0))
                if self.autotune_processor:
                    self.autotune_processor.set_tuning(self.tuning)
                return True
            elif symbol == "bias":
                self.bias = float(np.clip(value, 0.0, 1.0))
                if self.autotune_processor:
                    self.autotune_processor.set_bias(self.bias)
                return True
            elif symbol == "filter":
                self.filter = float(np.clip(value, 0.0, 1.0))
                if self.autotune_processor:
                    self.autotune_processor.set_filter(self.filter)
                return True
            elif symbol == "correction":
                self.correction = float(np.clip(value, 0.0, 1.0))
                if self.autotune_processor:
                    self.autotune_processor.set_correction(self.correction)
                return True
            elif symbol == "offset":
                self.offset = int(np.clip(value, -200, 200))
                if self.autotune_processor:
                    self.autotune_processor.set_offset(self.offset)
                return True
            elif symbol == "enabled_notes":
                if isinstance(value, list) and len(value) == 12:
                    self.enabled_notes = [bool(v) for v in value]
                    if self.autotune_processor:
                        self.autotune_processor.set_enabled_notes(self.enabled_notes)
                    return True
            elif symbol == "midi_enabled":
                self.midi_enabled = bool(value)
                if self.autotune_processor:
                    self.autotune_processor.set_midi_enabled(self.midi_enabled)
                return True
            elif symbol == "midi_channel":
                self.midi_channel = int(np.clip(value, 0, 16))
                if self.autotune_processor:
                    self.autotune_processor.set_midi_channel(self.midi_channel)
                return True
            elif symbol == "low_latency_mode":
                self.low_latency_mode = bool(value)
                if self.autotune_processor:
                    self.autotune_processor.set_low_latency_mode(self.low_latency_mode)
                return True
        except Exception as e:
            logger.error(f"Failed to set Zita AT1 parameter {symbol}: {e}")
            return False

        return False

    def get_latency(self) -> int:
        """Get Zita AT1 latency in samples."""
        # ~21ms at 48kHz normal mode, ~10.5ms in low latency mode
        if self.low_latency_mode:
            return 504  # ~10.5ms at 48kHz
        return 1008  # ~21ms at 48kHz


class TripleSpreadAdapter(NativePluginAdapter):
    """
    Adapter for Airwindows TripleSpread stereo width effect.
    Spreads frequencies across the stereo field in three bands.
    Based on airwindows/airwindows TripleSpread.
    """

    def __init__(self):
        super().__init__(
            uri="http://map2-audio.local/triplespread",
            name="MAP2 TripleSpread"
        )
        self.triplespread_processor = None
        # TripleSpread parameters
        self.spread = 0.5  # Stereo spread amount (0-1)
        self.mix = 1.0     # Wet/dry mix (0-1)

        # Lazy import
        try:
            from app.services.triplespread_processor import get_triplespread_processor
            self.triplespread_processor = get_triplespread_processor()
        except Exception as e:
            logger.warning(f"TripleSpread processor unavailable: {e}")

    def _process_internal(self, input_audio: np.ndarray) -> np.ndarray:
        """Process audio through TripleSpread."""
        if self.triplespread_processor is None:
            return input_audio

        try:
            # Process through TripleSpread
            wet = self.triplespread_processor.process(input_audio)

            # Apply mix
            if self.mix < 1.0:
                dry = input_audio
                output = (1.0 - self.mix) * dry + self.mix * wet
                return output
            else:
                return wet

        except Exception as e:
            logger.error(f"TripleSpread processing error: {e}")
            return input_audio

    def _apply_parameter(self, symbol: str, value: Any) -> bool:
        """Apply parameter to TripleSpread processor."""
        try:
            if symbol == "spread":
                self.spread = float(np.clip(value, 0.0, 1.0))
                if self.triplespread_processor:
                    self.triplespread_processor.set_spread(self.spread)
                return True
            elif symbol == "mix":
                self.mix = float(np.clip(value, 0.0, 1.0))
                return True
        except Exception as e:
            logger.error(f"Failed to set TripleSpread parameter {symbol}: {e}")
            return False

        return False

    def get_latency(self) -> int:
        """Get TripleSpread latency in samples."""
        # TripleSpread has minimal latency
        return 0


class ZLEqualizerAdapter(NativePluginAdapter):
    """
    Adapter for ZLEqualizer dynamic parametric equalizer.
    24-band dynamic EQ with multiple filter types and stereo modes.
    Based on ZL-Audio/ZLEqualizer.
    """

    # Filter type constants
    FILTER_TYPES = ['peak', 'low_shelf', 'low_pass', 'high_shelf', 'high_pass', 'notch', 'band_pass', 'tilt_shelf']
    SLOPE_OPTIONS = [6, 12, 24, 36, 48, 72, 96]  # dB/oct
    STEREO_MODES = ['stereo', 'left', 'right', 'mid', 'side']
    SIDECHAIN_FILTER_TYPES = ['bp', 'lp', 'hp']

    def __init__(self):
        super().__init__(
            uri="http://map2-audio.local/zlequalizer",
            name="MAP2 ZL Equalizer"
        )
        self.eq_processor = None
        self.num_bands = 24
        self.mix = 1.0

        # Global parameters
        self.output_gain = 0.0  # dB
        self.scale = 1.0  # 0-2, multiplier for all gains
        self.lookahead = 0.0  # ms
        self.phase_flip = False
        self.auto_gain = False  # AGC
        self.static_gain_comp = False  # SGC

        # Per-band parameters (stored as lists)
        self.band_enabled = [False] * self.num_bands
        self.band_freq = [1000.0] * self.num_bands  # Hz
        self.band_gain = [0.0] * self.num_bands  # dB
        self.band_q = [0.707] * self.num_bands  # Q factor
        self.band_filter_type = ['peak'] * self.num_bands
        self.band_slope = [12] * self.num_bands  # dB/oct
        self.band_stereo_mode = ['stereo'] * self.num_bands

        # Dynamic EQ parameters (per band)
        self.band_dynamic_enabled = [False] * self.num_bands
        self.band_target_gain = [0.0] * self.num_bands  # dB
        self.band_threshold = [-20.0] * self.num_bands  # dB
        self.band_knee = [6.0] * self.num_bands  # dB
        self.band_attack = [20.0] * self.num_bands  # ms
        self.band_release = [200.0] * self.num_bands  # ms
        self.band_dynamic_relative = [False] * self.num_bands

        # Side-chain parameters (per band)
        self.band_sidechain_external = [False] * self.num_bands
        self.band_sidechain_filter_type = ['bp'] * self.num_bands
        self.band_sidechain_freq = [1000.0] * self.num_bands
        self.band_sidechain_q = [0.707] * self.num_bands

        # Lazy import
        try:
            from app.services.zlequalizer_processor import get_zlequalizer_processor
            self.eq_processor = get_zlequalizer_processor()
        except Exception as e:
            logger.warning(f"ZLEqualizer processor unavailable: {e}")

    def _process_internal(self, input_audio: np.ndarray) -> np.ndarray:
        """Process audio through ZLEqualizer."""
        if self.eq_processor is None:
            return input_audio

        try:
            # Process through EQ
            wet = self.eq_processor.process(input_audio)

            # Apply mix
            if self.mix < 1.0:
                dry = input_audio
                output = (1.0 - self.mix) * dry + self.mix * wet
                return output
            else:
                return wet

        except Exception as e:
            logger.error(f"ZLEqualizer processing error: {e}")
            return input_audio

    def _apply_parameter(self, symbol: str, value: Any) -> bool:
        """Apply parameter to ZLEqualizer processor."""
        try:
            # Global parameters
            if symbol == "mix":
                self.mix = float(np.clip(value, 0.0, 1.0))
                return True
            elif symbol == "output_gain":
                self.output_gain = float(np.clip(value, -24.0, 24.0))
                if self.eq_processor:
                    self.eq_processor.set_output_gain(self.output_gain)
                return True
            elif symbol == "scale":
                self.scale = float(np.clip(value, 0.0, 2.0))
                if self.eq_processor:
                    self.eq_processor.set_scale(self.scale)
                return True
            elif symbol == "lookahead":
                self.lookahead = float(np.clip(value, 0.0, 20.0))
                if self.eq_processor:
                    self.eq_processor.set_lookahead(self.lookahead)
                return True
            elif symbol == "phase_flip":
                self.phase_flip = bool(value)
                if self.eq_processor:
                    self.eq_processor.set_phase_flip(self.phase_flip)
                return True
            elif symbol == "auto_gain":
                self.auto_gain = bool(value)
                if self.eq_processor:
                    self.eq_processor.set_auto_gain(self.auto_gain)
                return True
            elif symbol == "static_gain_comp":
                self.static_gain_comp = bool(value)
                if self.eq_processor:
                    self.eq_processor.set_static_gain_comp(self.static_gain_comp)
                return True

            # Per-band parameters (format: band_N_param)
            if symbol.startswith("band_"):
                return self._apply_band_parameter(symbol, value)

        except Exception as e:
            logger.error(f"Failed to set ZLEqualizer parameter {symbol}: {e}")
            return False

        return False

    def _apply_band_parameter(self, symbol: str, value: Any) -> bool:
        """Apply per-band parameter."""
        parts = symbol.split("_")
        if len(parts) < 3:
            return False

        try:
            band_idx = int(parts[1])
            if band_idx < 0 or band_idx >= self.num_bands:
                return False

            param_name = "_".join(parts[2:])

            if param_name == "enabled":
                self.band_enabled[band_idx] = bool(value)
                if self.eq_processor:
                    self.eq_processor.set_band_enabled(band_idx, self.band_enabled[band_idx])
                return True
            elif param_name == "freq":
                self.band_freq[band_idx] = float(np.clip(value, 20.0, 20000.0))
                if self.eq_processor:
                    self.eq_processor.set_band_freq(band_idx, self.band_freq[band_idx])
                return True
            elif param_name == "gain":
                self.band_gain[band_idx] = float(np.clip(value, -30.0, 30.0))
                if self.eq_processor:
                    self.eq_processor.set_band_gain(band_idx, self.band_gain[band_idx])
                return True
            elif param_name == "q":
                self.band_q[band_idx] = float(np.clip(value, 0.1, 20.0))
                if self.eq_processor:
                    self.eq_processor.set_band_q(band_idx, self.band_q[band_idx])
                return True
            elif param_name == "filter_type":
                if value in self.FILTER_TYPES:
                    self.band_filter_type[band_idx] = value
                    if self.eq_processor:
                        self.eq_processor.set_band_filter_type(band_idx, value)
                    return True
            elif param_name == "slope":
                if int(value) in self.SLOPE_OPTIONS:
                    self.band_slope[band_idx] = int(value)
                    if self.eq_processor:
                        self.eq_processor.set_band_slope(band_idx, self.band_slope[band_idx])
                    return True
            elif param_name == "stereo_mode":
                if value in self.STEREO_MODES:
                    self.band_stereo_mode[band_idx] = value
                    if self.eq_processor:
                        self.eq_processor.set_band_stereo_mode(band_idx, value)
                    return True
            # Dynamic parameters
            elif param_name == "dynamic_enabled":
                self.band_dynamic_enabled[band_idx] = bool(value)
                if self.eq_processor:
                    self.eq_processor.set_band_dynamic_enabled(band_idx, self.band_dynamic_enabled[band_idx])
                return True
            elif param_name == "target_gain":
                self.band_target_gain[band_idx] = float(np.clip(value, -30.0, 30.0))
                if self.eq_processor:
                    self.eq_processor.set_band_target_gain(band_idx, self.band_target_gain[band_idx])
                return True
            elif param_name == "threshold":
                self.band_threshold[band_idx] = float(np.clip(value, -60.0, 0.0))
                if self.eq_processor:
                    self.eq_processor.set_band_threshold(band_idx, self.band_threshold[band_idx])
                return True
            elif param_name == "knee":
                self.band_knee[band_idx] = float(np.clip(value, 0.0, 30.0))
                if self.eq_processor:
                    self.eq_processor.set_band_knee(band_idx, self.band_knee[band_idx])
                return True
            elif param_name == "attack":
                self.band_attack[band_idx] = float(np.clip(value, 0.0, 500.0))
                if self.eq_processor:
                    self.eq_processor.set_band_attack(band_idx, self.band_attack[band_idx])
                return True
            elif param_name == "release":
                self.band_release[band_idx] = float(np.clip(value, 0.0, 5000.0))
                if self.eq_processor:
                    self.eq_processor.set_band_release(band_idx, self.band_release[band_idx])
                return True
            elif param_name == "dynamic_relative":
                self.band_dynamic_relative[band_idx] = bool(value)
                if self.eq_processor:
                    self.eq_processor.set_band_dynamic_relative(band_idx, self.band_dynamic_relative[band_idx])
                return True
            # Side-chain parameters
            elif param_name == "sidechain_external":
                self.band_sidechain_external[band_idx] = bool(value)
                if self.eq_processor:
                    self.eq_processor.set_band_sidechain_external(band_idx, self.band_sidechain_external[band_idx])
                return True
            elif param_name == "sidechain_filter_type":
                if value in self.SIDECHAIN_FILTER_TYPES:
                    self.band_sidechain_filter_type[band_idx] = value
                    if self.eq_processor:
                        self.eq_processor.set_band_sidechain_filter_type(band_idx, value)
                    return True
            elif param_name == "sidechain_freq":
                self.band_sidechain_freq[band_idx] = float(np.clip(value, 20.0, 20000.0))
                if self.eq_processor:
                    self.eq_processor.set_band_sidechain_freq(band_idx, self.band_sidechain_freq[band_idx])
                return True
            elif param_name == "sidechain_q":
                self.band_sidechain_q[band_idx] = float(np.clip(value, 0.1, 20.0))
                if self.eq_processor:
                    self.eq_processor.set_band_sidechain_q(band_idx, self.band_sidechain_q[band_idx])
                return True

        except (ValueError, IndexError) as e:
            logger.error(f"Failed to parse band parameter {symbol}: {e}")
            return False

        return False

    def get_latency(self) -> int:
        """Get ZLEqualizer latency in samples."""
        # Latency depends on lookahead setting
        # At 48kHz, 1ms lookahead = 48 samples
        return int(self.lookahead * 48)  # Approximate for 48kHz

    def serialize_state(self) -> Dict[str, Any]:
        """Serialize ZLEqualizer state including all band parameters."""
        state = super().serialize_state()
        state.update({
            "num_bands": self.num_bands,
            "output_gain": self.output_gain,
            "scale": self.scale,
            "lookahead": self.lookahead,
            "phase_flip": self.phase_flip,
            "auto_gain": self.auto_gain,
            "static_gain_comp": self.static_gain_comp,
            "band_enabled": self.band_enabled.copy(),
            "band_freq": self.band_freq.copy(),
            "band_gain": self.band_gain.copy(),
            "band_q": self.band_q.copy(),
            "band_filter_type": self.band_filter_type.copy(),
            "band_slope": self.band_slope.copy(),
            "band_stereo_mode": self.band_stereo_mode.copy(),
            "band_dynamic_enabled": self.band_dynamic_enabled.copy(),
            "band_target_gain": self.band_target_gain.copy(),
            "band_threshold": self.band_threshold.copy(),
            "band_knee": self.band_knee.copy(),
            "band_attack": self.band_attack.copy(),
            "band_release": self.band_release.copy(),
            "band_dynamic_relative": self.band_dynamic_relative.copy(),
            "band_sidechain_external": self.band_sidechain_external.copy(),
            "band_sidechain_filter_type": self.band_sidechain_filter_type.copy(),
            "band_sidechain_freq": self.band_sidechain_freq.copy(),
            "band_sidechain_q": self.band_sidechain_q.copy(),
        })
        return state

    def deserialize_state(self, state: Dict[str, Any]) -> None:
        """Deserialize ZLEqualizer state including all band parameters."""
        super().deserialize_state(state)

        # Restore global parameters
        self.output_gain = state.get("output_gain", 0.0)
        self.scale = state.get("scale", 1.0)
        self.lookahead = state.get("lookahead", 0.0)
        self.phase_flip = state.get("phase_flip", False)
        self.auto_gain = state.get("auto_gain", False)
        self.static_gain_comp = state.get("static_gain_comp", False)

        # Restore band parameters
        for attr in ["band_enabled", "band_freq", "band_gain", "band_q",
                     "band_filter_type", "band_slope", "band_stereo_mode",
                     "band_dynamic_enabled", "band_target_gain", "band_threshold",
                     "band_knee", "band_attack", "band_release", "band_dynamic_relative",
                     "band_sidechain_external", "band_sidechain_filter_type",
                     "band_sidechain_freq", "band_sidechain_q"]:
            if attr in state:
                setattr(self, attr, state[attr][:self.num_bands])


class ValentineAdapter(NativePluginAdapter):
    """
    Adapter for Valentine compressor/saturator processor.
    Aggressive compression and saturation inspired by the Justice sound.
    Based on Tote Bag Labs Valentine.
    """

    def __init__(self):
        super().__init__(
            uri="http://map2-audio.local/valentine",
            name="MAP2 Valentine"
        )
        self.valentine_processor = None
        # Valentine parameters
        self.crush = False          # Bit crushing/downsampling
        self.compress = 0.5         # Gain before compression (0-1)
        self.saturate = 0.3         # Pre-waveshaper gain (0-1)
        self.ratio = 4.0            # Compression ratio
        self.attack = 0.2           # Attack time (0-1)
        self.release = 0.5          # Release time (0-1)
        self.output = 0.7           # Output gain (0-1)
        self.mix = 1.0              # Wet/dry mix (0-1)
        self.clip_output = False    # Enable output clipping

        # Lazy import
        try:
            from app.services.valentine_processor import get_valentine_processor
            self.valentine_processor = get_valentine_processor()
        except Exception as e:
            logger.warning(f"Valentine processor unavailable: {e}")

    def _process_internal(self, input_audio: np.ndarray) -> np.ndarray:
        """Process audio through Valentine."""
        if self.valentine_processor is None:
            return input_audio

        try:
            # Process through Valentine
            wet = self.valentine_processor.process(input_audio)

            # Apply mix
            if self.mix < 1.0:
                dry = input_audio
                output = (1.0 - self.mix) * dry + self.mix * wet
                return output
            else:
                return wet

        except Exception as e:
            logger.error(f"Valentine processing error: {e}")
            return input_audio

    def _apply_parameter(self, symbol: str, value: Any) -> bool:
        """Apply parameter to Valentine processor."""
        try:
            if symbol == "crush":
                self.crush = bool(value)
                if self.valentine_processor:
                    self.valentine_processor.set_crush(self.crush)
                return True
            elif symbol == "compress":
                self.compress = float(np.clip(value, 0.0, 1.0))
                if self.valentine_processor:
                    self.valentine_processor.set_compress(self.compress)
                return True
            elif symbol == "saturate":
                self.saturate = float(np.clip(value, 0.0, 1.0))
                if self.valentine_processor:
                    self.valentine_processor.set_saturate(self.saturate)
                return True
            elif symbol == "ratio":
                self.ratio = float(np.clip(value, 1.0, 1000.0))
                if self.valentine_processor:
                    self.valentine_processor.set_ratio(self.ratio)
                return True
            elif symbol == "attack":
                self.attack = float(np.clip(value, 0.0, 1.0))
                if self.valentine_processor:
                    self.valentine_processor.set_attack(self.attack)
                return True
            elif symbol == "release":
                self.release = float(np.clip(value, 0.0, 1.0))
                if self.valentine_processor:
                    self.valentine_processor.set_release(self.release)
                return True
            elif symbol == "output":
                self.output = float(np.clip(value, 0.0, 1.0))
                if self.valentine_processor:
                    self.valentine_processor.set_output(self.output)
                return True
            elif symbol == "mix":
                self.mix = float(np.clip(value, 0.0, 1.0))
                return True
            elif symbol == "clip_output":
                self.clip_output = bool(value)
                if self.valentine_processor:
                    self.valentine_processor.set_clip_output(self.clip_output)
                return True
        except Exception as e:
            logger.error(f"Failed to set Valentine parameter {symbol}: {e}")
            return False

        return False

    def get_latency(self) -> int:
        """Get Valentine latency in samples."""
        # Valentine has minimal latency
        return 0


class Freeverb3Adapter(NativePluginAdapter):
    """
    Adapter for Freeverb3 algorithmic reverb processor.
    High-quality reverb algorithms with SIMD optimization.
    Based on GNU Freeverb3 library by Teru Kamogashira.
    """

    # Available reverb types
    REVERB_TYPES = ['freeverb', 'strev', 'nrev', 'progenitor', 'zrev', 'earlyref']

    def __init__(self):
        super().__init__(
            uri="http://map2-audio.local/freeverb3",
            name="MAP2 Freeverb3"
        )
        self.freeverb3_processor = None
        # Reverb type selection
        self.reverb_type = 'freeverb'
        # Common reverb parameters
        self.room_size = 0.5       # 0-1
        self.damping = 0.5         # 0-1
        self.width = 1.0           # 0-1
        self.predelay = 0.0        # ms
        self.decay = 0.5           # 0-1
        # Tone controls
        self.low_cut = 20.0        # Hz
        self.high_cut = 20000.0    # Hz
        # Modulation
        self.modulation = 0.0      # 0-1
        self.mod_freq = 1.0        # Hz
        # Early reflections
        self.early_mix = 0.3       # 0-1
        self.early_size = 0.5      # 0-1
        # Output
        self.mix = 0.3             # 0-1
        self.output_gain = 0.0     # dB
        # Diffusion
        self.diffusion = 0.7       # 0-1
        # Spin/wander
        self.spin = 0.5            # 0-1
        self.wander = 0.5          # 0-1

        # Lazy import
        try:
            from app.services.freeverb3_processor import get_freeverb3_processor
            self.freeverb3_processor = get_freeverb3_processor()
        except Exception as e:
            logger.warning(f"Freeverb3 processor unavailable: {e}")

    def _process_internal(self, input_audio: np.ndarray) -> np.ndarray:
        """Process audio through Freeverb3."""
        if self.freeverb3_processor is None:
            return input_audio

        try:
            # Process through reverb
            wet = self.freeverb3_processor.process(input_audio)

            # Apply mix
            if self.mix < 1.0:
                dry = input_audio
                output = (1.0 - self.mix) * dry + self.mix * wet
                return output
            else:
                return wet

        except Exception as e:
            logger.error(f"Freeverb3 processing error: {e}")
            return input_audio

    def _apply_parameter(self, symbol: str, value: Any) -> bool:
        """Apply parameter to Freeverb3 processor."""
        try:
            if symbol == "reverb_type":
                if value in self.REVERB_TYPES:
                    self.reverb_type = value
                    if self.freeverb3_processor:
                        self.freeverb3_processor.set_reverb_type(value)
                    return True
            elif symbol == "room_size":
                self.room_size = float(np.clip(value, 0.0, 1.0))
                if self.freeverb3_processor:
                    self.freeverb3_processor.set_room_size(self.room_size)
                return True
            elif symbol == "damping":
                self.damping = float(np.clip(value, 0.0, 1.0))
                if self.freeverb3_processor:
                    self.freeverb3_processor.set_damping(self.damping)
                return True
            elif symbol == "width":
                self.width = float(np.clip(value, 0.0, 1.0))
                if self.freeverb3_processor:
                    self.freeverb3_processor.set_width(self.width)
                return True
            elif symbol == "predelay":
                self.predelay = float(np.clip(value, 0.0, 200.0))
                if self.freeverb3_processor:
                    self.freeverb3_processor.set_predelay(self.predelay)
                return True
            elif symbol == "decay":
                self.decay = float(np.clip(value, 0.0, 1.0))
                if self.freeverb3_processor:
                    self.freeverb3_processor.set_decay(self.decay)
                return True
            elif symbol == "low_cut":
                self.low_cut = float(np.clip(value, 20.0, 500.0))
                if self.freeverb3_processor:
                    self.freeverb3_processor.set_low_cut(self.low_cut)
                return True
            elif symbol == "high_cut":
                self.high_cut = float(np.clip(value, 1000.0, 20000.0))
                if self.freeverb3_processor:
                    self.freeverb3_processor.set_high_cut(self.high_cut)
                return True
            elif symbol == "modulation":
                self.modulation = float(np.clip(value, 0.0, 1.0))
                if self.freeverb3_processor:
                    self.freeverb3_processor.set_modulation(self.modulation)
                return True
            elif symbol == "mod_freq":
                self.mod_freq = float(np.clip(value, 0.1, 10.0))
                if self.freeverb3_processor:
                    self.freeverb3_processor.set_mod_freq(self.mod_freq)
                return True
            elif symbol == "early_mix":
                self.early_mix = float(np.clip(value, 0.0, 1.0))
                if self.freeverb3_processor:
                    self.freeverb3_processor.set_early_mix(self.early_mix)
                return True
            elif symbol == "early_size":
                self.early_size = float(np.clip(value, 0.0, 1.0))
                if self.freeverb3_processor:
                    self.freeverb3_processor.set_early_size(self.early_size)
                return True
            elif symbol == "mix":
                self.mix = float(np.clip(value, 0.0, 1.0))
                return True
            elif symbol == "output_gain":
                self.output_gain = float(np.clip(value, -24.0, 24.0))
                if self.freeverb3_processor:
                    self.freeverb3_processor.set_output_gain(self.output_gain)
                return True
            elif symbol == "diffusion":
                self.diffusion = float(np.clip(value, 0.0, 1.0))
                if self.freeverb3_processor:
                    self.freeverb3_processor.set_diffusion(self.diffusion)
                return True
            elif symbol == "spin":
                self.spin = float(np.clip(value, 0.0, 1.0))
                if self.freeverb3_processor:
                    self.freeverb3_processor.set_spin(self.spin)
                return True
            elif symbol == "wander":
                self.wander = float(np.clip(value, 0.0, 1.0))
                if self.freeverb3_processor:
                    self.freeverb3_processor.set_wander(self.wander)
                return True
        except Exception as e:
            logger.error(f"Failed to set Freeverb3 parameter {symbol}: {e}")
            return False

        return False

    def get_latency(self) -> int:
        """Get Freeverb3 latency in samples."""
        # Freeverb3 has minimal latency for algorithmic reverb
        return 0

    def serialize_state(self) -> Dict[str, Any]:
        """Serialize Freeverb3 state."""
        state = super().serialize_state()
        state.update({
            "reverb_type": self.reverb_type,
            "room_size": self.room_size,
            "damping": self.damping,
            "width": self.width,
            "predelay": self.predelay,
            "decay": self.decay,
            "low_cut": self.low_cut,
            "high_cut": self.high_cut,
            "modulation": self.modulation,
            "mod_freq": self.mod_freq,
            "early_mix": self.early_mix,
            "early_size": self.early_size,
            "mix": self.mix,
            "output_gain": self.output_gain,
            "diffusion": self.diffusion,
            "spin": self.spin,
            "wander": self.wander,
        })
        return state

    def deserialize_state(self, state: Dict[str, Any]) -> None:
        """Deserialize Freeverb3 state."""
        super().deserialize_state(state)

        # Restore parameters
        self.reverb_type = state.get("reverb_type", "freeverb")
        self.room_size = state.get("room_size", 0.5)
        self.damping = state.get("damping", 0.5)
        self.width = state.get("width", 1.0)
        self.predelay = state.get("predelay", 0.0)
        self.decay = state.get("decay", 0.5)
        self.low_cut = state.get("low_cut", 20.0)
        self.high_cut = state.get("high_cut", 20000.0)
        self.modulation = state.get("modulation", 0.0)
        self.mod_freq = state.get("mod_freq", 1.0)
        self.early_mix = state.get("early_mix", 0.3)
        self.early_size = state.get("early_size", 0.5)
        self.mix = state.get("mix", 0.3)
        self.output_gain = state.get("output_gain", 0.0)
        self.diffusion = state.get("diffusion", 0.7)
        self.spin = state.get("spin", 0.5)
        self.wander = state.get("wander", 0.5)


# Registry of native plugin adapters
NATIVE_PLUGIN_ADAPTERS: Dict[str, type] = {
    "http://map2-audio.local/nam-loader": NAMLoaderAdapter,
    "http://map2-audio.local/ir-cabinet-loader": CabinetIRLoaderAdapter,
    "http://map2-audio.local/ir-reverb-loader": ReverbIRLoaderAdapter,
    "http://map2-audio.local/reevr-engine": ReevREngineAdapter,
    "http://map2-audio.local/cocoa-delay": CocoaDelayAdapter,
    "http://map2-audio.local/zita-at1": ZitaAT1Adapter,
    "http://map2-audio.local/triplespread": TripleSpreadAdapter,
    "http://map2-audio.local/valentine": ValentineAdapter,
    "http://map2-audio.local/zlequalizer": ZLEqualizerAdapter,
    "http://map2-audio.local/freeverb3": Freeverb3Adapter,
}


def create_native_plugin(uri: str) -> Optional[NativePluginAdapter]:
    """
    Create a native plugin adapter instance by URI.

    Args:
        uri: Plugin URI

    Returns:
        Plugin adapter instance or None if URI not recognized
    """
    adapter_class = NATIVE_PLUGIN_ADAPTERS.get(uri)
    if adapter_class is None:
        return None

    try:
        return adapter_class()
    except Exception as e:
        logger.error(f"Failed to create native plugin {uri}: {e}")
        return None


def is_native_plugin(uri: str) -> bool:
    """
    Check if URI corresponds to a native plugin.

    Args:
        uri: Plugin URI

    Returns:
        True if this is a native plugin URI
    """
    return uri in NATIVE_PLUGIN_ADAPTERS


def get_native_plugin_uris() -> List[str]:
    """
    Get list of all native plugin URIs.

    Returns:
        List of native plugin URIs
    """
    return list(NATIVE_PLUGIN_ADAPTERS.keys())
