"""
Parameter Automation Engine - Full Implementation

Features:
- Timeline-based automation curves with multiple interpolation types
- LFO modulation with waveforms: sine, triangle, square, saw, random, sample & hold
- Tempo-synced LFO with beat divisions
- Envelope follower with attack/release/threshold control
- Audio sidechain input support
- Persistent automation storage
- Real-time processing loop
"""

import numpy as np
import logging
import asyncio
import time
import random
from typing import Dict, List, Optional, Tuple, Any, Callable, Awaitable
from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime
from threading import Lock
import json
import math

logger = logging.getLogger(__name__)


class CurveType(Enum):
    """Automation curve interpolation types."""
    LINEAR = "linear"
    EXPONENTIAL = "exponential"
    LOGARITHMIC = "logarithmic"
    S_CURVE = "s_curve"
    STEP = "step"
    BEZIER = "bezier"


class ModulationSource(Enum):
    """Available modulation sources."""
    TIMELINE = "timeline"  # Time-based automation points
    LFO = "lfo"  # Low-frequency oscillator
    ENVELOPE = "envelope"  # Envelope follower
    MIDI = "midi"  # MIDI CC input
    AUDIO = "audio"  # Audio level follower


class LFOWaveform(Enum):
    """LFO waveform shapes."""
    SINE = "sine"
    TRIANGLE = "triangle"
    SQUARE = "square"
    SAW_UP = "saw_up"
    SAW_DOWN = "saw_down"
    RANDOM = "random"
    SAMPLE_HOLD = "sample_hold"
    PULSE = "pulse"  # Variable duty cycle


class TempoDivision(Enum):
    """Musical tempo divisions for synced LFO."""
    WHOLE = "1/1"      # 1 bar
    HALF = "1/2"       # Half note
    QUARTER = "1/4"    # Quarter note
    EIGHTH = "1/8"     # Eighth note
    SIXTEENTH = "1/16" # Sixteenth note
    THIRTYSECOND = "1/32"
    DOTTED_QUARTER = "1/4D"
    DOTTED_EIGHTH = "1/8D"
    TRIPLET_QUARTER = "1/4T"
    TRIPLET_EIGHTH = "1/8T"


# Division to beats mapping
DIVISION_BEATS = {
    TempoDivision.WHOLE: 4.0,
    TempoDivision.HALF: 2.0,
    TempoDivision.QUARTER: 1.0,
    TempoDivision.EIGHTH: 0.5,
    TempoDivision.SIXTEENTH: 0.25,
    TempoDivision.THIRTYSECOND: 0.125,
    TempoDivision.DOTTED_QUARTER: 1.5,
    TempoDivision.DOTTED_EIGHTH: 0.75,
    TempoDivision.TRIPLET_QUARTER: 2/3,
    TempoDivision.TRIPLET_EIGHTH: 1/3,
}


@dataclass
class AutomationPoint:
    """Single point in an automation curve."""
    time: float  # Time in seconds
    value: float  # Normalized value (0.0 to 1.0)
    curve: CurveType = CurveType.LINEAR
    tension: float = 0.0  # For bezier curves (-1.0 to 1.0)


@dataclass
class LFOState:
    """LFO configuration and runtime state."""
    # Configuration
    rate_hz: float = 1.0
    depth: float = 0.5  # 0.0 to 1.0, how much modulation
    phase_offset: float = 0.0  # 0.0 to 1.0 (normalized phase)
    waveform: LFOWaveform = LFOWaveform.SINE
    bipolar: bool = True  # True: -1 to 1, False: 0 to 1
    pulse_width: float = 0.5  # For pulse waveform (duty cycle)

    # Tempo sync
    sync_to_tempo: bool = False
    tempo_division: TempoDivision = TempoDivision.QUARTER
    tempo_bpm: float = 120.0

    # Smoothing
    smoothing: float = 0.0  # 0.0 = none, 1.0 = maximum smoothing

    # Runtime state
    current_phase: float = 0.0
    last_sample_hold_value: float = 0.5
    last_random_value: float = 0.5
    smoothed_value: float = 0.5


@dataclass
class EnvelopeFollowerState:
    """Envelope follower configuration and state."""
    # Configuration
    input_source: str = "main_input"  # main_input, sidechain, plugin_output
    attack_ms: float = 10.0  # Attack time in milliseconds
    release_ms: float = 100.0  # Release time in milliseconds
    threshold_db: float = -60.0  # Gate threshold in dB
    sensitivity: float = 1.0  # Amplitude multiplier
    invert: bool = False  # Invert output

    # Runtime state
    envelope_value: float = 0.0
    peak_value: float = 0.0


@dataclass
class AutomationLaneState:
    """Full automation lane with modulation configuration."""
    parameter_id: str  # plugin_uri:param_index
    plugin_uri: str = ""
    plugin_position: Optional[int] = None
    param_index: int = 0
    param_name: str = ""

    # Automation points (for TIMELINE mode)
    points: List[AutomationPoint] = field(default_factory=list)

    # Lane settings
    enabled: bool = True
    modulation_source: ModulationSource = ModulationSource.TIMELINE

    # LFO state (for LFO mode)
    lfo: LFOState = field(default_factory=LFOState)

    # Envelope follower state (for ENVELOPE mode)
    envelope: EnvelopeFollowerState = field(default_factory=EnvelopeFollowerState)

    # Loop settings
    loop_enabled: bool = False
    loop_start: float = 0.0
    loop_end: float = 4.0

    # Output
    current_value: float = 0.5
    last_update_time: float = 0.0

    def add_point(self, time: float, value: float, curve: CurveType = CurveType.LINEAR) -> None:
        """Add automation point, maintaining time-sorted order."""
        point = AutomationPoint(time, max(0.0, min(1.0, value)), curve)

        # Insert in sorted position
        insert_idx = 0
        for i, p in enumerate(self.points):
            if p.time > time:
                break
            insert_idx = i + 1

        self.points.insert(insert_idx, point)

    def remove_point(self, time: float, tolerance: float = 0.01) -> bool:
        """Remove point at given time."""
        for i, point in enumerate(self.points):
            if abs(point.time - time) < tolerance:
                self.points.pop(i)
                return True
        return False


class AutomationEngine:
    """
    Full automation engine with LFO, envelope follower, and timeline support.

    Features:
    - Multiple modulation sources per parameter
    - Real-time processing with callback
    - Persistent storage via database
    - Tempo-synced LFO
    - Audio envelope following
    """

    def __init__(self, sample_rate: int = 48000, buffer_size: int = 256):
        """Initialize automation engine."""
        self.sample_rate = sample_rate
        self.buffer_size = buffer_size
        self.lanes: Dict[str, AutomationLaneState] = {}

        # Playback state
        self.is_playing = False
        self.is_recording = False
        self.current_time = 0.0
        self.tempo_bpm = 120.0
        self.time_signature = (4, 4)

        # Audio input for envelope follower
        self._audio_buffer: Optional[np.ndarray] = None
        self._sidechain_buffer: Optional[np.ndarray] = None

        # Parameter callback
        self._parameter_callback: Optional[Callable[..., Awaitable[None]]] = None

        # Processing task
        self._process_task: Optional[asyncio.Task] = None
        self._running = False

        # Thread safety
        self._lock = Lock()

        logger.info(f"Automation engine initialized (SR: {sample_rate}, buffer: {buffer_size})")

    @staticmethod
    def build_parameter_id(plugin_uri: str, param_index: int, plugin_position: Optional[int] = None) -> str:
        """Build a duplicate-safe automation target identifier."""
        base_id = f"{plugin_uri}:{param_index}"
        if isinstance(plugin_position, int) and plugin_position >= 0:
            return f"{base_id}@{plugin_position}"
        return base_id

    @staticmethod
    def parse_parameter_id(parameter_id: str) -> Tuple[str, int, Optional[int]]:
        """Parse a duplicate-safe automation target identifier."""
        raw = str(parameter_id or "")
        plugin_position: Optional[int] = None
        base = raw
        if "@" in raw:
            candidate_base, _, candidate_position = raw.rpartition("@")
            try:
                parsed_position = int(candidate_position)
            except (TypeError, ValueError):
                parsed_position = None
            if parsed_position is not None and parsed_position >= 0:
                base = candidate_base
                plugin_position = parsed_position

        plugin_uri, separator, raw_index = base.rpartition(":")
        if not separator:
            raise ValueError(f"Invalid automation parameter_id: {parameter_id}")
        return plugin_uri, int(raw_index), plugin_position

    async def _dispatch_parameter_callback(
        self,
        plugin_uri: str,
        param_index: int,
        value: float,
        plugin_position: Optional[int] = None,
        instance_id: Optional[int] = None,
    ) -> None:
        """Call the configured parameter callback with duplicate-safe identity when supported."""
        if not self._parameter_callback:
            return
        try:
            await self._parameter_callback(
                plugin_uri,
                param_index,
                value,
                plugin_position,
                instance_id,
            )
        except TypeError:
            await self._parameter_callback(plugin_uri, param_index, value)

    def set_parameter_callback(self, callback: Callable[..., Awaitable[None]]) -> None:
        """Set callback for parameter value changes."""
        self._parameter_callback = callback

    async def start(self) -> None:
        """Start automation processing loop."""
        if self._running:
            return

        self._running = True
        self._process_task = asyncio.create_task(self._process_loop())
        logger.info("Automation engine started")

    async def stop(self) -> None:
        """Stop automation processing loop."""
        self._running = False
        if self._process_task:
            self._process_task.cancel()
            try:
                await self._process_task
            except asyncio.CancelledError:
                pass
            self._process_task = None
        logger.info("Automation engine stopped")

    async def _process_loop(self) -> None:
        """Main processing loop for automation."""
        process_interval = self.buffer_size / self.sample_rate  # ~5.3ms at 48kHz/256

        while self._running:
            try:
                loop_start = time.time()

                # Process all active lanes
                if self.is_playing:
                    await self._process_all_lanes()

                    # Update time
                    self.current_time += process_interval

                # Sleep for remainder of interval
                elapsed = time.time() - loop_start
                sleep_time = max(0.001, process_interval - elapsed)
                await asyncio.sleep(sleep_time)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in automation process loop: {e}")
                await asyncio.sleep(0.1)

    async def _process_all_lanes(self) -> None:
        """Process all automation lanes."""
        with self._lock:
            lanes_to_process = list(self.lanes.values())

        for lane in lanes_to_process:
            if not lane.enabled:
                continue

            try:
                new_value = self._calculate_lane_value(lane, self.current_time)

                if new_value is not None and abs(new_value - lane.current_value) > 0.0001:
                    lane.current_value = new_value
                    lane.last_update_time = self.current_time

                    # Send parameter update
                    await self._dispatch_parameter_callback(
                        lane.plugin_uri,
                        lane.param_index,
                        new_value,
                        plugin_position=lane.plugin_position,
                    )

            except Exception as e:
                logger.error(f"Error processing lane {lane.parameter_id}: {e}")

    def _calculate_lane_value(self, lane: AutomationLaneState, time: float) -> Optional[float]:
        """Calculate current value for a lane based on its modulation source."""
        if lane.modulation_source == ModulationSource.TIMELINE:
            return self._calculate_timeline_value(lane, time)
        elif lane.modulation_source == ModulationSource.LFO:
            return self._calculate_lfo_value(lane, time)
        elif lane.modulation_source == ModulationSource.ENVELOPE:
            return self._calculate_envelope_value(lane)
        return None

    def _calculate_timeline_value(self, lane: AutomationLaneState, time: float) -> Optional[float]:
        """Calculate interpolated timeline value."""
        if len(lane.points) == 0:
            return None

        # Handle looping
        if lane.loop_enabled and time > lane.loop_end:
            loop_duration = lane.loop_end - lane.loop_start
            if loop_duration > 0:
                time = lane.loop_start + ((time - lane.loop_start) % loop_duration)

        # Before first point
        if time <= lane.points[0].time:
            return lane.points[0].value

        # After last point
        if time >= lane.points[-1].time:
            return lane.points[-1].value

        # Find interpolation segment
        for i in range(len(lane.points) - 1):
            p1 = lane.points[i]
            p2 = lane.points[i + 1]

            if p1.time <= time <= p2.time:
                return self._interpolate(p1, p2, time)

        return None

    def _interpolate(self, p1: AutomationPoint, p2: AutomationPoint, time: float) -> float:
        """Interpolate between two automation points."""
        if p2.time == p1.time:
            return p1.value

        t = (time - p1.time) / (p2.time - p1.time)

        if p1.curve == CurveType.LINEAR:
            return p1.value + (p2.value - p1.value) * t

        elif p1.curve == CurveType.EXPONENTIAL:
            return p1.value + (p2.value - p1.value) * (t ** 2)

        elif p1.curve == CurveType.LOGARITHMIC:
            return p1.value + (p2.value - p1.value) * (1 - (1 - t) ** 2)

        elif p1.curve == CurveType.S_CURVE:
            s = 3 * t ** 2 - 2 * t ** 3
            return p1.value + (p2.value - p1.value) * s

        elif p1.curve == CurveType.STEP:
            return p1.value if t < 1.0 else p2.value

        elif p1.curve == CurveType.BEZIER:
            # Bezier with tension control
            tension = p1.tension
            t2 = t * t
            t3 = t2 * t
            h1 = 2*t3 - 3*t2 + 1
            h2 = -2*t3 + 3*t2
            h3 = t3 - 2*t2 + t
            h4 = t3 - t2
            return h1 * p1.value + h2 * p2.value + (h3 + h4) * tension * (p2.value - p1.value)

        return p1.value

    def _calculate_lfo_value(self, lane: AutomationLaneState, time: float) -> float:
        """Calculate LFO modulation value."""
        lfo = lane.lfo

        # Calculate rate (tempo-synced or free)
        if lfo.sync_to_tempo:
            beats_per_cycle = DIVISION_BEATS.get(lfo.tempo_division, 1.0)
            rate_hz = lfo.tempo_bpm / 60.0 / beats_per_cycle
        else:
            rate_hz = lfo.rate_hz

        # Update phase
        delta_time = time - lane.last_update_time if lane.last_update_time > 0 else 0
        lfo.current_phase += rate_hz * delta_time
        lfo.current_phase = lfo.current_phase % 1.0  # Normalize to 0-1

        phase = (lfo.current_phase + lfo.phase_offset) % 1.0

        # Calculate waveform value
        raw = self._calculate_waveform(lfo.waveform, phase, lfo)

        # Apply depth and convert to output range
        if lfo.bipolar:
            # raw is -1 to 1, convert to 0 to 1
            modulated = 0.5 + raw * lfo.depth * 0.5
        else:
            # raw is 0 to 1
            modulated = raw * lfo.depth

        # Apply smoothing
        if lfo.smoothing > 0:
            smooth_factor = 1.0 - lfo.smoothing * 0.99
            lfo.smoothed_value = lfo.smoothed_value * (1 - smooth_factor) + modulated * smooth_factor
            return max(0.0, min(1.0, lfo.smoothed_value))

        return max(0.0, min(1.0, modulated))

    def _calculate_waveform(self, waveform: LFOWaveform, phase: float, lfo: LFOState) -> float:
        """Calculate waveform value at given phase (0-1)."""
        tau = 2 * math.pi

        if waveform == LFOWaveform.SINE:
            return math.sin(phase * tau)

        elif waveform == LFOWaveform.TRIANGLE:
            if phase < 0.25:
                return phase * 4
            elif phase < 0.75:
                return 1 - (phase - 0.25) * 4
            else:
                return -1 + (phase - 0.75) * 4

        elif waveform == LFOWaveform.SQUARE:
            return 1.0 if phase < 0.5 else -1.0

        elif waveform == LFOWaveform.SAW_UP:
            return 2 * phase - 1

        elif waveform == LFOWaveform.SAW_DOWN:
            return 1 - 2 * phase

        elif waveform == LFOWaveform.RANDOM:
            # Smooth random with interpolation
            if phase < lfo.last_random_value:  # Phase wrapped, get new target
                lfo.last_random_value = random.random() * 2 - 1
            return lfo.last_random_value

        elif waveform == LFOWaveform.SAMPLE_HOLD:
            if phase < 0.01:  # Near phase start, sample new value
                lfo.last_sample_hold_value = random.random() * 2 - 1
            return lfo.last_sample_hold_value

        elif waveform == LFOWaveform.PULSE:
            return 1.0 if phase < lfo.pulse_width else -1.0

        return 0.0

    def _calculate_envelope_value(self, lane: AutomationLaneState) -> float:
        """Calculate envelope follower value from audio input."""
        env = lane.envelope

        # Get audio input
        if env.input_source == "main_input":
            audio = self._audio_buffer
        elif env.input_source == "sidechain":
            audio = self._sidechain_buffer
        else:
            audio = self._audio_buffer

        if audio is None or len(audio) == 0:
            return env.envelope_value

        # Calculate RMS of audio buffer
        rms = np.sqrt(np.mean(audio ** 2))

        # Convert to dB
        if rms > 0:
            db = 20 * np.log10(rms)
        else:
            db = -120.0

        # Apply threshold (gate)
        if db < env.threshold_db:
            target = 0.0
        else:
            # Normalize to 0-1 range with sensitivity
            target = min(1.0, (db - env.threshold_db) / 60.0 * env.sensitivity)

        # Apply attack/release envelope
        sample_time_ms = 1000.0 * self.buffer_size / self.sample_rate

        if target > env.envelope_value:
            # Attack
            coeff = 1.0 - math.exp(-sample_time_ms / max(0.1, env.attack_ms))
        else:
            # Release
            coeff = 1.0 - math.exp(-sample_time_ms / max(0.1, env.release_ms))

        env.envelope_value = env.envelope_value + (target - env.envelope_value) * coeff

        # Invert if needed
        result = 1.0 - env.envelope_value if env.invert else env.envelope_value

        return max(0.0, min(1.0, result))

    def set_audio_input(self, audio: np.ndarray) -> None:
        """Set main audio input buffer for envelope follower."""
        self._audio_buffer = audio

    def set_sidechain_input(self, audio: np.ndarray) -> None:
        """Set sidechain audio input for envelope follower."""
        self._sidechain_buffer = audio

    # ==========================================================================
    # Lane Management
    # ==========================================================================

    def add_lane(
        self,
        plugin_uri: str,
        param_index: int,
        plugin_position: Optional[int] = None,
        param_name: str = "",
        modulation_source: ModulationSource = ModulationSource.TIMELINE,
    ) -> AutomationLaneState:
        """Add new automation lane."""
        parameter_id = self.build_parameter_id(plugin_uri, param_index, plugin_position)

        with self._lock:
            if parameter_id in self.lanes:
                return self.lanes[parameter_id]

            lane = AutomationLaneState(
                parameter_id=parameter_id,
                plugin_uri=plugin_uri,
                plugin_position=plugin_position,
                param_index=param_index,
                param_name=param_name or f"Param {param_index}",
                modulation_source=modulation_source,
            )

            self.lanes[parameter_id] = lane
            logger.info(f"Added automation lane: {parameter_id} ({modulation_source.value})")

            return lane

    def remove_lane(self, parameter_id: str) -> bool:
        """Remove automation lane."""
        with self._lock:
            if parameter_id in self.lanes:
                del self.lanes[parameter_id]
                logger.info(f"Removed automation lane: {parameter_id}")
                return True
        return False

    def get_lane(self, parameter_id: str) -> Optional[AutomationLaneState]:
        """Get automation lane by ID."""
        return self.lanes.get(parameter_id)

    def get_all_automated_parameters(self) -> List[str]:
        """Get list of all automated parameter IDs."""
        return list(self.lanes.keys())

    def add_automation_point(
        self,
        parameter_id: str,
        time: float,
        value: float,
        curve: CurveType = CurveType.LINEAR,
    ) -> bool:
        """Compatibility helper for route-driven point insertion."""
        with self._lock:
            lane = self.lanes.get(parameter_id)
            if not lane:
                return False
            lane.add_point(time, value, curve)
            return True

    def remove_automation_point(self, parameter_id: str, time: float) -> bool:
        """Compatibility helper for route-driven point removal."""
        with self._lock:
            lane = self.lanes.get(parameter_id)
            if not lane:
                return False
            return lane.remove_point(time)

    def export_automation(self, parameter_id: str) -> Optional[Dict[str, Any]]:
        """Export a single automation lane as a JSON-serializable payload."""
        lane = self.get_lane(parameter_id)
        if not lane:
            return None
        return {
            "parameter_id": lane.parameter_id,
            "plugin_uri": lane.plugin_uri,
            "plugin_position": lane.plugin_position,
            "param_index": lane.param_index,
            "param_name": lane.param_name,
            "enabled": lane.enabled,
            "modulation_source": lane.modulation_source.value,
            "points": [
                {"time": point.time, "value": point.value, "curve": point.curve.value}
                for point in lane.points
            ],
            "loop_enabled": lane.loop_enabled,
            "loop_start": lane.loop_start,
            "loop_end": lane.loop_end,
        }

    def get_parameter_value(self, parameter_id: str, time: Optional[float] = None) -> Optional[float]:
        """Get the value a lane would produce at a given time."""
        lane = self.get_lane(parameter_id)
        if not lane:
            return None
        sample_time = self.current_time if time is None else max(0.0, float(time))
        return self._calculate_lane_value(lane, sample_time)

    def import_automation(self, data: Dict[str, Any]) -> bool:
        """Import or replace a single automation lane from JSON-serializable data."""
        if not isinstance(data, dict):
            return False
        parameter_id = str(data.get("parameter_id") or "")
        if not parameter_id:
            plugin_uri = str(data.get("plugin_uri") or "")
            param_index = int(data.get("param_index") or 0)
            plugin_position = data.get("plugin_position")
            parameter_id = self.build_parameter_id(plugin_uri, param_index, plugin_position)
        plugin_uri, param_index, plugin_position = self.parse_parameter_id(parameter_id)

        modulation_raw = data.get("modulation_source", ModulationSource.TIMELINE.value)
        try:
            modulation_source = ModulationSource(modulation_raw)
        except ValueError:
            modulation_source = ModulationSource.TIMELINE

        lane = self.add_lane(
            plugin_uri=plugin_uri,
            param_index=param_index,
            plugin_position=plugin_position,
            param_name=str(data.get("param_name") or ""),
            modulation_source=modulation_source,
        )
        lane.enabled = bool(data.get("enabled", True))
        lane.loop_enabled = bool(data.get("loop_enabled", False))
        lane.loop_start = float(data.get("loop_start", 0.0))
        lane.loop_end = float(data.get("loop_end", 4.0))
        lane.points.clear()
        for point in data.get("points", []):
            try:
                lane.add_point(
                    float(point["time"]),
                    float(point["value"]),
                    CurveType(point.get("curve", CurveType.LINEAR.value)),
                )
            except (KeyError, TypeError, ValueError):
                continue
        return True

    def configure_lfo(
        self,
        parameter_id: str,
        rate_hz: float = 1.0,
        depth: float = 0.5,
        waveform: str = "sine",
        sync_to_tempo: bool = False,
        tempo_division: str = "1/4",
        phase_offset: float = 0.0,
        smoothing: float = 0.0,
    ) -> bool:
        """Configure LFO for a parameter lane."""
        with self._lock:
            lane = self.lanes.get(parameter_id)
            if not lane:
                return False

            lane.modulation_source = ModulationSource.LFO

            try:
                wf = LFOWaveform(waveform)
            except ValueError:
                wf = LFOWaveform.SINE

            try:
                td = TempoDivision(tempo_division)
            except ValueError:
                td = TempoDivision.QUARTER

            lane.lfo = LFOState(
                rate_hz=rate_hz,
                depth=depth,
                phase_offset=phase_offset,
                waveform=wf,
                sync_to_tempo=sync_to_tempo,
                tempo_division=td,
                tempo_bpm=self.tempo_bpm,
                smoothing=smoothing,
            )

            logger.info(f"Configured LFO for {parameter_id}: {rate_hz}Hz {waveform}")
            return True

    def remove_lfo(self, parameter_id: str) -> bool:
        """Disable LFO modulation and fall back to timeline mode."""
        with self._lock:
            lane = self.lanes.get(parameter_id)
            if not lane:
                return False
            lane.modulation_source = ModulationSource.TIMELINE
            lane.lfo = LFOState()
            return True

    def configure_envelope_follower(
        self,
        parameter_id: str,
        attack_ms: float = 10.0,
        release_ms: float = 100.0,
        threshold_db: float = -60.0,
        sensitivity: float = 1.0,
        input_source: str = "main_input",
        invert: bool = False,
    ) -> bool:
        """Configure envelope follower for a parameter lane."""
        with self._lock:
            lane = self.lanes.get(parameter_id)
            if not lane:
                return False

            lane.modulation_source = ModulationSource.ENVELOPE

            lane.envelope = EnvelopeFollowerState(
                input_source=input_source,
                attack_ms=attack_ms,
                release_ms=release_ms,
                threshold_db=threshold_db,
                sensitivity=sensitivity,
                invert=invert,
            )

            logger.info(
                f"Configured envelope follower for {parameter_id}: "
                f"A={attack_ms}ms R={release_ms}ms"
            )
            return True

    def remove_envelope_follower(self, parameter_id: str) -> bool:
        """Disable envelope follower modulation and fall back to timeline mode."""
        with self._lock:
            lane = self.lanes.get(parameter_id)
            if not lane:
                return False
            lane.modulation_source = ModulationSource.TIMELINE
            lane.envelope = EnvelopeFollowerState()
            return True

    # ==========================================================================
    # Playback Control
    # ==========================================================================

    def start_playback(self, start_time: float = 0.0) -> None:
        """Start automation playback."""
        with self._lock:
            self.is_playing = True
            self.current_time = start_time
        logger.info(f"Started automation playback at {start_time}s")

    def stop_playback(self) -> None:
        """Stop automation playback."""
        with self._lock:
            self.is_playing = False
        logger.info("Stopped automation playback")

    def seek(self, time: float) -> None:
        """Seek to specific time."""
        with self._lock:
            self.current_time = max(0.0, time)

    def set_tempo(self, bpm: float) -> None:
        """Set tempo for tempo-synced LFOs."""
        self.tempo_bpm = max(20.0, min(300.0, bpm))
        # Update all LFOs
        with self._lock:
            for lane in self.lanes.values():
                lane.lfo.tempo_bpm = self.tempo_bpm

    # ==========================================================================
    # Persistence
    # ==========================================================================

    async def save_to_database(self) -> int:
        """Save all automation lanes to database."""
        from app.database import get_session, AutomationLane as AutomationLaneModel
        from sqlalchemy import delete

        count = 0

        async with get_session() as session:
            # Clear existing lanes
            await session.execute(delete(AutomationLaneModel))

            # Save all lanes
            for lane in self.lanes.values():
                db_lane = AutomationLaneModel(
                    parameter_id=lane.parameter_id,
                    plugin_uri=lane.plugin_uri,
                    plugin_position=lane.plugin_position,
                    param_index=lane.param_index,
                    param_name=lane.param_name,
                    points=json.dumps([
                        {"time": p.time, "value": p.value, "curve": p.curve.value}
                        for p in lane.points
                    ]),
                    enabled=lane.enabled,
                    modulation_source=lane.modulation_source.value,
                    lfo_rate_hz=lane.lfo.rate_hz,
                    lfo_depth=lane.lfo.depth,
                    lfo_waveform=lane.lfo.waveform.value,
                    lfo_phase=lane.lfo.phase_offset,
                    lfo_sync_to_tempo=lane.lfo.sync_to_tempo,
                    lfo_tempo_division=lane.lfo.tempo_division.value,
                    env_input_source=lane.envelope.input_source,
                    env_attack_ms=lane.envelope.attack_ms,
                    env_release_ms=lane.envelope.release_ms,
                    env_threshold_db=lane.envelope.threshold_db,
                    env_sensitivity=lane.envelope.sensitivity,
                    loop_enabled=lane.loop_enabled,
                    loop_start=lane.loop_start,
                    loop_end=lane.loop_end,
                )
                session.add(db_lane)
                count += 1

        logger.info(f"Saved {count} automation lanes to database")
        return count

    async def load_from_database(self) -> int:
        """Load automation lanes from database."""
        from app.database import get_session, AutomationLane as AutomationLaneModel
        from sqlalchemy import select

        count = 0

        async with get_session() as session:
            result = await session.execute(select(AutomationLaneModel))
            db_lanes = result.scalars().all()

            with self._lock:
                self.lanes.clear()

                for db_lane in db_lanes:
                    lane = AutomationLaneState(
                        parameter_id=db_lane.parameter_id
                        or self.build_parameter_id(
                            db_lane.plugin_uri,
                            db_lane.param_index,
                            db_lane.plugin_position,
                        ),
                        plugin_uri=db_lane.plugin_uri,
                        plugin_position=db_lane.plugin_position,
                        param_index=db_lane.param_index,
                        param_name=db_lane.param_name or "",
                        enabled=db_lane.enabled,
                        modulation_source=ModulationSource(db_lane.modulation_source),
                        loop_enabled=db_lane.loop_enabled,
                        loop_start=db_lane.loop_start,
                        loop_end=db_lane.loop_end,
                    )

                    # Load points
                    try:
                        points_data = json.loads(db_lane.points or "[]")
                        for p in points_data:
                            lane.add_point(
                                p["time"],
                                p["value"],
                                CurveType(p.get("curve", "linear"))
                            )
                    except (json.JSONDecodeError, KeyError):
                        pass

                    # Load LFO config
                    try:
                        lane.lfo = LFOState(
                            rate_hz=db_lane.lfo_rate_hz,
                            depth=db_lane.lfo_depth,
                            waveform=LFOWaveform(db_lane.lfo_waveform),
                            phase_offset=db_lane.lfo_phase,
                            sync_to_tempo=db_lane.lfo_sync_to_tempo,
                            tempo_division=TempoDivision(db_lane.lfo_tempo_division),
                        )
                    except (ValueError, TypeError):
                        pass

                    # Load envelope config
                    lane.envelope = EnvelopeFollowerState(
                        input_source=db_lane.env_input_source,
                        attack_ms=db_lane.env_attack_ms,
                        release_ms=db_lane.env_release_ms,
                        threshold_db=db_lane.env_threshold_db,
                        sensitivity=db_lane.env_sensitivity,
                    )

                    self.lanes[lane.parameter_id] = lane
                    count += 1

        logger.info(f"Loaded {count} automation lanes from database")
        return count

    def export_all(self) -> List[Dict[str, Any]]:
        """Export all automation data as JSON-serializable list."""
        with self._lock:
            return [
                {
                    "parameter_id": lane.parameter_id,
                    "plugin_uri": lane.plugin_uri,
                    "plugin_position": lane.plugin_position,
                    "param_index": lane.param_index,
                    "param_name": lane.param_name,
                    "enabled": lane.enabled,
                    "modulation_source": lane.modulation_source.value,
                    "points": [
                        {"time": p.time, "value": p.value, "curve": p.curve.value}
                        for p in lane.points
                    ],
                    "lfo": {
                        "rate_hz": lane.lfo.rate_hz,
                        "depth": lane.lfo.depth,
                        "waveform": lane.lfo.waveform.value,
                        "phase_offset": lane.lfo.phase_offset,
                        "sync_to_tempo": lane.lfo.sync_to_tempo,
                        "tempo_division": lane.lfo.tempo_division.value,
                        "smoothing": lane.lfo.smoothing,
                    },
                    "envelope": {
                        "input_source": lane.envelope.input_source,
                        "attack_ms": lane.envelope.attack_ms,
                        "release_ms": lane.envelope.release_ms,
                        "threshold_db": lane.envelope.threshold_db,
                        "sensitivity": lane.envelope.sensitivity,
                        "invert": lane.envelope.invert,
                    },
                    "loop_enabled": lane.loop_enabled,
                    "loop_start": lane.loop_start,
                    "loop_end": lane.loop_end,
                }
                for lane in self.lanes.values()
            ]

    def clear_all(self) -> None:
        """Clear all automation data."""
        with self._lock:
            self.lanes.clear()
        logger.info("Cleared all automation data")


# Global automation engine instance
automation_engine = AutomationEngine()
