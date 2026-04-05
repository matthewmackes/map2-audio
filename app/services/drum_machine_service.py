"""
Drum machine state service.

Provides a persistence-backed, typed service layer for the current drum machine
surface while the deeper engine integration work is still in progress.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import os
import time
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, ValidationError

from app.services.juce_engine_service import get_audio_engine
from app.services.user_content_manager import UserContentManager
from app.utils.singleton import Singleton


_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_DRUMS_ROOT = Path(os.environ.get("MAP2_DRUMS_ROOT", Path.home() / ".map2" / "drums"))
_DEFAULT_STATE_PATH = Path(os.environ.get("MAP2_DRUMS_STATE_PATH", _DEFAULT_DRUMS_ROOT / "state.json"))
_FACTORY_PACKS_DIR = Path(os.environ.get("MAP2_DRUMS_FACTORY_PACKS_DIR", _PROJECT_ROOT / "data" / "drums" / "factory_packs"))
_GENERATED_PACKS_DIR = Path(os.environ.get("MAP2_DRUMS_GENERATED_PACKS_DIR", _PROJECT_ROOT / "data" / "drums" / "generated"))
_POSITION_POLL_INTERVAL_SECONDS = float(os.environ.get("MAP2_DRUM_POSITION_POLL_INTERVAL_SECONDS", "0.05"))
_MIDI_CONFIGS_DIR = Path(os.environ.get("MAP2_DRUMS_MIDI_CONFIGS_DIR", _DEFAULT_DRUMS_ROOT / "midi_configs"))
_CC_MAPPINGS_PATH = Path(os.environ.get("MAP2_DRUMS_CC_MAPPINGS_PATH", _DEFAULT_DRUMS_ROOT / "cc_mappings.json"))
_DEFAULT_DRUM_NOTES = [36, 38, 42, 46, 41, 43, 45, 49, 51, 57, 39, 37, 56, 47, 50, 48]
_BACKING_TRACK_LIBRARY = [
    {"track_id": "bt-001", "name": "Midnight Motor", "genre": "Rock", "key": "E minor", "tempo": 118, "duration_seconds": 204.0},
    {"track_id": "bt-002", "name": "City Lights", "genre": "Pop", "key": "A major", "tempo": 124, "duration_seconds": 178.0},
    {"track_id": "bt-003", "name": "Copper Shuffle", "genre": "Blues", "key": "G", "tempo": 92, "duration_seconds": 251.0},
    {"track_id": "bt-004", "name": "Neon Circuit", "genre": "Electronic", "key": "D minor", "tempo": 128, "duration_seconds": 222.0},
]
DrumPadSoundSource = Literal["sample", "synth", "hybrid"]


class DrumSynthParamModel(BaseModel):
    oscillator_type: Literal["sine", "triangle", "saw", "square", "metallic"] = "sine"
    pitch_envelope_start_hz: float = Field(160.0, ge=20.0, le=4000.0)
    pitch_envelope_end_hz: float = Field(50.0, ge=20.0, le=4000.0)
    pitch_envelope_decay_ms: float = Field(180.0, ge=1.0, le=5000.0)
    noise_level: float = Field(0.2, ge=0.0, le=1.0)
    noise_decay_ms: float = Field(120.0, ge=1.0, le=5000.0)
    body_decay_ms: float = Field(420.0, ge=1.0, le=5000.0)
    tone_amount: float = Field(0.55, ge=0.0, le=1.0)


class DrumPadFilterModel(BaseModel):
    type: Literal["lowpass", "highpass", "bandpass", "notch"] = "lowpass"
    cutoff_hz: float = Field(12000.0, ge=20.0, le=20000.0)
    resonance: float = Field(0.35, ge=0.1, le=10.0)
    env_amount: float = Field(0.0, ge=-1.0, le=1.0)
    env_decay_ms: float = Field(180.0, ge=1.0, le=5000.0)


class DrumCvGateConfigModel(BaseModel):
    enabled: bool = False
    output_pair: int = Field(0, ge=0)
    gate_length_ms: float = Field(25.0, ge=1.0, le=5000.0)
    note_min: int = Field(36, ge=0, le=126)
    note_max: int = Field(84, ge=1, le=127)
    pitch_min_volts: float = Field(0.0, ge=-10.0, le=10.0)
    pitch_max_volts: float = Field(5.0, ge=-10.0, le=10.0)


class DrumPadControlModel(BaseModel):
    pad_id: int = Field(..., ge=0, le=15)
    volume: float = Field(100.0, ge=0.0, le=100.0)
    pan: float = Field(0.0, ge=-100.0, le=100.0)
    tune: float = Field(0.0, ge=-24.0, le=24.0)
    mute: bool = False
    solo: bool = False
    bus_assignment: int = Field(0, ge=0, le=7)


class DrumEqModel(BaseModel):
    low_gain: float = Field(0.0, ge=-24.0, le=24.0)
    mid_gain: float = Field(0.0, ge=-24.0, le=24.0)
    mid_freq: float = Field(1000.0, ge=40.0, le=16000.0)
    high_gain: float = Field(0.0, ge=-24.0, le=24.0)


class DrumCompModel(BaseModel):
    threshold: float = Field(-18.0, ge=-60.0, le=0.0)
    ratio: float = Field(2.0, ge=1.0, le=20.0)
    attack: float = Field(10.0, ge=0.1, le=200.0)
    release: float = Field(80.0, ge=5.0, le=1000.0)
    makeup: float = Field(0.0, ge=-24.0, le=24.0)


class DrumBusMixerModel(BaseModel):
    bus_id: int = Field(..., ge=0, le=7)
    name: str
    eq: DrumEqModel = Field(default_factory=DrumEqModel)
    comp: DrumCompModel = Field(default_factory=DrumCompModel)
    level: float = Field(100.0, ge=0.0, le=100.0)
    pan: float = Field(0.0, ge=-100.0, le=100.0)
    mute: bool = False
    solo: bool = False
    output_pair: int = Field(0, ge=0)
    reverb_send: float = Field(0.0, ge=0.0, le=100.0)
    output_channel_count: int = Field(2, ge=2)
    available_output_pairs: List[int] = Field(default_factory=lambda: [0])


class DrumMasterFxModel(BaseModel):
    drive_db: float = Field(0.0, ge=0.0, le=24.0)
    compressor_threshold: float = Field(-18.0, ge=-60.0, le=0.0)
    compressor_ratio: float = Field(2.0, ge=1.0, le=20.0)
    compressor_attack: float = Field(10.0, ge=0.1, le=200.0)
    compressor_release: float = Field(80.0, ge=5.0, le=1000.0)
    compressor_makeup: float = Field(0.0, ge=-24.0, le=24.0)
    reverb_mix: float = Field(0.18, ge=0.0, le=1.0)
    reverb_size: float = Field(0.45, ge=0.0, le=1.0)
    reverb_damping: float = Field(0.35, ge=0.0, le=1.0)
    reverb_width: float = Field(1.0, ge=0.0, le=1.0)
    limiter_threshold: float = Field(-0.5, ge=-12.0, le=0.0)
    limiter_release: float = Field(60.0, ge=5.0, le=500.0)


class DrumMachineStateModel(BaseModel):
    ui_mode: Literal["practice", "advanced", "backing_tracks"] = "practice"
    bpm: int = Field(120, ge=40, le=300)
    volume: int = Field(80, ge=0, le=100)
    pattern: int = Field(0, ge=0, le=127)
    variation: int = Field(0, ge=0, le=10)
    transport: bool = False
    swing: int = Field(0, ge=0, le=100)
    active_pack: Optional[str] = None
    practice_style_id: Optional[str] = None
    practice_variation: int = Field(0, ge=0, le=10)
    practice_change_quantization: int = Field(1, ge=1, le=8)
    practice_count_in_bars: int = Field(1, ge=0, le=4)
    practice_auto_fill: bool = False
    midi_output_enabled: bool = False
    midi_clock_output_enabled: bool = False
    midi_output_channel: int = Field(9, ge=0, le=15)
    program_change_enabled: bool = False
    track_swing: List[int] = Field(default_factory=lambda: [0] * 16, min_length=16, max_length=16)
    pad_sound_sources: List[DrumPadSoundSource] = Field(default_factory=lambda: ["sample"] * 16, min_length=16, max_length=16)
    pad_synth_params: List[DrumSynthParamModel] = Field(
        default_factory=lambda: [DrumSynthParamModel() for _ in range(16)],
        min_length=16,
        max_length=16,
    )
    pad_filters: List[DrumPadFilterModel] = Field(
        default_factory=lambda: [DrumPadFilterModel() for _ in range(16)],
        min_length=16,
        max_length=16,
    )
    pad_cv_gate_configs: List[DrumCvGateConfigModel] = Field(
        default_factory=lambda: [DrumCvGateConfigModel() for _ in range(16)],
        min_length=16,
        max_length=16,
    )
    pad_controls: List[DrumPadControlModel] = Field(
        default_factory=lambda: [
            DrumPadControlModel(
                pad_id=pad,
                bus_assignment=min(pad // 2, 7),
            )
            for pad in range(16)
        ],
        min_length=16,
        max_length=16,
    )
    bus_mixers: List[DrumBusMixerModel] = Field(
        default_factory=lambda: [
            DrumBusMixerModel(
                bus_id=bus,
                name=f"Bus {bus}",
            )
            for bus in range(8)
        ],
        min_length=8,
        max_length=8,
    )
    master_fx: DrumMasterFxModel = Field(default_factory=DrumMasterFxModel)


class DrumMachineStateUpdateModel(BaseModel):
    ui_mode: Optional[Literal["practice", "advanced", "backing_tracks"]] = None
    bpm: Optional[int] = Field(None, ge=40, le=300)
    volume: Optional[int] = Field(None, ge=0, le=100)
    pattern: Optional[int] = Field(None, ge=0, le=127)
    variation: Optional[int] = Field(None, ge=0, le=10)
    transport: Optional[bool] = None
    swing: Optional[int] = Field(None, ge=0, le=100)
    active_pack: Optional[str] = None
    practice_style_id: Optional[str] = None
    practice_variation: Optional[int] = Field(None, ge=0, le=10)
    practice_change_quantization: Optional[int] = Field(None, ge=1, le=8)
    practice_count_in_bars: Optional[int] = Field(None, ge=0, le=4)
    practice_auto_fill: Optional[bool] = None
    midi_output_enabled: Optional[bool] = None
    midi_clock_output_enabled: Optional[bool] = None
    midi_output_channel: Optional[int] = Field(None, ge=0, le=15)
    program_change_enabled: Optional[bool] = None
    track_swing: Optional[List[int]] = Field(default=None, min_length=16, max_length=16)
    pad_sound_sources: Optional[List[DrumPadSoundSource]] = Field(default=None, min_length=16, max_length=16)
    pad_synth_params: Optional[List[DrumSynthParamModel]] = Field(default=None, min_length=16, max_length=16)
    pad_filters: Optional[List[DrumPadFilterModel]] = Field(default=None, min_length=16, max_length=16)
    pad_cv_gate_configs: Optional[List[DrumCvGateConfigModel]] = Field(default=None, min_length=16, max_length=16)


class DrumTransportStateModel(BaseModel):
    is_playing: bool = False
    bpm: int = Field(120, ge=40, le=300)
    pattern: int = Field(0, ge=0, le=127)
    variation: int = Field(0, ge=0, le=10)
    swing: int = Field(0, ge=0, le=100)
    pending_pattern: int = Field(-1, ge=-1, le=127)
    switch_quantization_beats: int = Field(4, ge=1, le=16)
    midi_output_enabled: bool = False
    midi_clock_output_enabled: bool = False
    midi_output_channel: int = Field(9, ge=0, le=15)
    program_change_enabled: bool = False
    track_swing: List[int] = Field(default_factory=lambda: [0] * 16, min_length=16, max_length=16)


class DrumTransportUpdateModel(BaseModel):
    is_playing: Optional[bool] = None
    bpm: Optional[int] = Field(None, ge=40, le=300)
    pattern: Optional[int] = Field(None, ge=0, le=127)
    variation: Optional[int] = Field(None, ge=0, le=10)
    swing: Optional[int] = Field(None, ge=0, le=100)
    switch_quantization_beats: Optional[int] = Field(None, ge=1, le=16)
    midi_output_enabled: Optional[bool] = None
    midi_clock_output_enabled: Optional[bool] = None
    midi_output_channel: Optional[int] = Field(None, ge=0, le=15)
    program_change_enabled: Optional[bool] = None


class DrumMidiOutputConfigModel(BaseModel):
    midi_output_enabled: bool = False
    midi_clock_output_enabled: bool = False
    midi_output_channel: int = Field(9, ge=0, le=15)
    program_change_enabled: bool = False


class DrumMeteringModel(BaseModel):
    per_pad_peak: List[float] = Field(default_factory=lambda: [0.0] * 16, min_length=16, max_length=16)
    per_pad_rms: List[float] = Field(default_factory=lambda: [0.0] * 16, min_length=16, max_length=16)
    per_bus_peak: List[float] = Field(default_factory=lambda: [0.0] * 8, min_length=8, max_length=8)
    per_bus_rms: List[float] = Field(default_factory=lambda: [0.0] * 8, min_length=8, max_length=8)
    master_peak_left: float = 0.0
    master_peak_right: float = 0.0
    master_rms_left: float = 0.0
    master_rms_right: float = 0.0


class DrumSequencerPositionModel(BaseModel):
    step: int = Field(0, ge=0, le=63)
    bar: int = Field(1, ge=1)
    beat: int = Field(1, ge=1, le=4)
    pattern: int = Field(0, ge=0, le=127)
    pattern_id: int = Field(0, ge=0, le=127)
    variation: int = Field(0, ge=0, le=10)
    is_playing: bool = False
    pending_pattern: int = Field(-1, ge=-1, le=127)
    switch_quantization_beats: int = Field(4, ge=1, le=16)
    updated_at: Optional[str] = None


class DrumSongTransportStateModel(BaseModel):
    is_playing: bool = False
    current_entry_index: int = Field(-1, ge=-1)
    current_repeat: int = Field(0, ge=0)
    total_entries: int = Field(0, ge=0)
    loop: bool = False
    active_pattern: int = Field(0, ge=0, le=127)


class DrumBackingTrackSummaryModel(BaseModel):
    track_id: str
    name: str
    genre: str
    key: str
    tempo: int = Field(..., ge=1)
    duration_seconds: float = Field(..., gt=0.0)
    duration_label: str


class DrumBackingTrackTransportStateModel(BaseModel):
    track_id: str
    track_name: str
    genre: str
    key: str
    tempo: int = Field(..., ge=1)
    duration_seconds: float = Field(..., gt=0.0)
    duration_label: str
    position_seconds: float = Field(0.0, ge=0.0)
    position_label: str = "00:00"
    is_playing: bool = False
    loop_enabled: bool = False
    tempo_shift: int = Field(0, ge=-50, le=50)
    pitch_shift: int = Field(0, ge=-12, le=12)
    runtime_source: Literal["drum_machine_service"] = "drum_machine_service"


class DrumBackingTrackTransportUpdateModel(BaseModel):
    track_id: Optional[str] = None
    is_playing: Optional[bool] = None
    loop_enabled: Optional[bool] = None
    tempo_shift: Optional[int] = Field(None, ge=-50, le=50)
    pitch_shift: Optional[int] = Field(None, ge=-12, le=12)
    position_seconds: Optional[float] = Field(None, ge=0.0)


class DrumPackSummaryModel(BaseModel):
    pack_id: str
    name: str
    description: str = ""
    source: str = ""
    filename: str


class DrumMidiPadMappingModel(BaseModel):
    pad: int = Field(..., ge=0, le=15)
    notes: List[int] = Field(default_factory=list)
    midi_channel: int = Field(0, ge=0, le=16)


class DrumMidiMappingModel(BaseModel):
    global_midi_channel: int = Field(0, ge=0, le=16)
    pads: List[DrumMidiPadMappingModel] = Field(default_factory=list)


class DrumPadVelocityCurveModel(BaseModel):
    pad: int = Field(..., ge=0, le=15)
    curve_type: int = Field(0, ge=0, le=4)
    fixed_velocity: float = Field(1.0, ge=0.0, le=1.0)
    input_floor: float = Field(0.0, ge=0.0, le=1.0)
    output_floor: float = Field(0.0, ge=0.0, le=1.0)
    output_ceiling: float = Field(1.0, ge=0.0, le=1.0)
    preview: List[float] = Field(default_factory=list)
    last_velocity: float = Field(0.0, ge=0.0, le=1.0)


class DrumMidiVelocityCurvesModel(BaseModel):
    pads: List[DrumPadVelocityCurveModel] = Field(default_factory=list)


class DrumPadZoneModel(BaseModel):
    kind: int = Field(..., ge=0, le=2)
    trigger_note: int = Field(..., ge=0, le=127)
    key_switch_note: int = Field(-1, ge=-1, le=127)
    velocity_scale: float = Field(1.0, ge=0.0, le=2.0)
    enabled: bool = True


class DrumPadZonesModel(BaseModel):
    pad: int = Field(..., ge=0, le=15)
    zones: List[DrumPadZoneModel] = Field(default_factory=list)


class DrumMidiZonesModel(BaseModel):
    pads: List[DrumPadZonesModel] = Field(default_factory=list)


class DrumMidiLearnStateModel(BaseModel):
    active: bool = False
    learn_all: bool = False
    active_pad_index: int = -1
    next_pad_index: int = -1
    last_received_note: int = -1
    last_received_channel: int = -1
    timeout_seconds: int = Field(10, ge=1)


class DrumMidiPresetListModel(BaseModel):
    presets: List[str] = Field(default_factory=list)


DrumCcTarget = Literal[
    "pad_volume",
    "pad_pan",
    "pad_tune",
    "pad_filter_cutoff",
    "bus_level",
    "bus_pan",
    "master_volume",
    "tempo",
    "swing",
    "synth_pitch_start_hz",
    "synth_pitch_end_hz",
    "synth_pitch_decay_ms",
    "synth_noise_level",
    "synth_noise_decay_ms",
    "synth_body_decay_ms",
    "synth_tone_amount",
]


class DrumCcMappingEntryModel(BaseModel):
    slot: int = Field(..., ge=0, le=31)
    cc_number: int = Field(0, ge=0, le=127)
    midi_channel: int = Field(0, ge=0, le=16)
    target: DrumCcTarget = "pad_volume"
    target_index: int = Field(0, ge=0)
    active: bool = False


class DrumCcMappingModel(BaseModel):
    mappings: List[DrumCcMappingEntryModel] = Field(default_factory=list)


class DrumCcLearnStateModel(BaseModel):
    active: bool = False
    slot: int = Field(-1, ge=-1, le=31)
    last_cc: int = Field(-1, ge=-1, le=127)
    last_channel: int = Field(-1, ge=-1, le=16)
    timeout_seconds: int = Field(10, ge=1, le=60)


class DrumMachineService(Singleton):
    def __init__(self) -> None:
        super().__init__()
        self._state_path = _DEFAULT_STATE_PATH
        self._factory_packs_dir = _FACTORY_PACKS_DIR
        self._user_content_manager = UserContentManager(_GENERATED_PACKS_DIR)
        self._midi_configs_dir = _MIDI_CONFIGS_DIR
        self._cc_mappings_path = _CC_MAPPINGS_PATH
        self._metering = DrumMeteringModel()
        self._state = self._load_state()
        self._position = DrumSequencerPositionModel(
            pattern=self._state.pattern,
            pattern_id=self._state.pattern,
            variation=self._state.variation,
        )
        self._backing_tracks = [self._build_backing_track_summary(item) for item in _BACKING_TRACK_LIBRARY]
        default_backing_track = self._backing_tracks[0]
        self._backing_track_transport = DrumBackingTrackTransportStateModel(
            track_id=default_backing_track.track_id,
            track_name=default_backing_track.name,
            genre=default_backing_track.genre,
            key=default_backing_track.key,
            tempo=default_backing_track.tempo,
            duration_seconds=default_backing_track.duration_seconds,
            duration_label=default_backing_track.duration_label,
            position_seconds=0.0,
            position_label="00:00",
            is_playing=False,
            loop_enabled=False,
            tempo_shift=0,
            pitch_shift=0,
        )
        self._backing_track_started_monotonic: Optional[float] = None
        self._backing_track_started_position_seconds: float = 0.0
        self._song_transport = DrumSongTransportStateModel(active_pattern=self._state.pattern)
        self._last_polled_step: Optional[int] = None
        self._position_poll_task: Optional[asyncio.Task] = None
        self._event_loop: Optional[asyncio.AbstractEventLoop] = None
        self._global_midi_channel = 0
        self._pad_midi_notes = {index: [note] for index, note in enumerate(_DEFAULT_DRUM_NOTES)}
        self._pad_midi_channels = {index: 0 for index in range(16)}
        self._velocity_curves = {
            index: {
                "curve_type": 0,
                "fixed_velocity": 1.0,
                "input_floor": 0.0,
                "output_floor": 0.0,
                "output_ceiling": 1.0,
            }
            for index in range(16)
        }
        self._pad_zones = {index: [] for index in range(16)}
        self._midi_learn_state = DrumMidiLearnStateModel()
        self._cc_mappings = self._load_cc_mappings()
        self._cc_learn_state = DrumCcLearnStateModel()
        self._sync_static_state_to_engine()
        self._sync_transport_patch_to_engine(
            {
                "bpm": self._state.bpm,
                "pattern": self._state.pattern,
                "variation": self._state.variation,
                "swing": self._state.swing,
                "is_playing": self._state.transport,
                "midi_output_enabled": self._state.midi_output_enabled,
                "midi_clock_output_enabled": self._state.midi_clock_output_enabled,
                "midi_output_channel": self._state.midi_output_channel,
                "program_change_enabled": self._state.program_change_enabled,
            }
        )
        self._sync_cc_mappings_to_engine()

    def _load_state(self) -> DrumMachineStateModel:
        if not self._state_path.exists():
            return DrumMachineStateModel()

        try:
            payload = json.loads(self._state_path.read_text())
            return DrumMachineStateModel.model_validate(payload)
        except (OSError, json.JSONDecodeError, ValidationError):
            return DrumMachineStateModel()

    def _persist_state(self) -> None:
        self._state_path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = self._state_path.with_suffix(".tmp")
        temp_path.write_text(json.dumps(self._state.model_dump(), indent=2, sort_keys=True))
        temp_path.replace(self._state_path)

    def _load_cc_mappings(self) -> DrumCcMappingModel:
        if not self._cc_mappings_path.exists():
            return DrumCcMappingModel(
                mappings=[DrumCcMappingEntryModel(slot=slot) for slot in range(32)]
            )
        try:
            payload = json.loads(self._cc_mappings_path.read_text())
            model = DrumCcMappingModel.model_validate(payload)
            slots = {entry.slot for entry in model.mappings}
            mappings = list(model.mappings)
            for slot in range(32):
                if slot not in slots:
                    mappings.append(DrumCcMappingEntryModel(slot=slot))
            mappings.sort(key=lambda entry: entry.slot)
            return DrumCcMappingModel(mappings=mappings)
        except (OSError, json.JSONDecodeError, ValidationError):
            return DrumCcMappingModel(
                mappings=[DrumCcMappingEntryModel(slot=slot) for slot in range(32)]
            )

    def _persist_cc_mappings(self) -> None:
        self._cc_mappings_path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = self._cc_mappings_path.with_suffix(".tmp")
        temp_path.write_text(json.dumps(self._cc_mappings.model_dump(), indent=2, sort_keys=True))
        temp_path.replace(self._cc_mappings_path)

    def _build_backing_track_summary(self, payload: Dict[str, Any]) -> DrumBackingTrackSummaryModel:
        return DrumBackingTrackSummaryModel.model_validate(
            {
                **payload,
                "duration_label": self._format_time_label(float(payload["duration_seconds"])),
            }
        )

    def _format_time_label(self, seconds: float) -> str:
        rounded_seconds = max(0, int(round(seconds)))
        minutes, remainder = divmod(rounded_seconds, 60)
        return f"{minutes:02d}:{remainder:02d}"

    def _backing_track_playback_rate(self, tempo_shift: int) -> float:
        return max(0.5, 1.0 + (float(tempo_shift) / 100.0))

    def _get_backing_track_summary(self, track_id: str) -> DrumBackingTrackSummaryModel:
        for track in self._backing_tracks:
            if track.track_id == track_id:
                return track
        raise ValueError(f"unknown backing track: {track_id}")

    def _normalize_backing_track_transport_payload(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        duration_seconds = float(payload["duration_seconds"])
        position_seconds = max(0.0, float(payload.get("position_seconds", 0.0)))
        loop_enabled = bool(payload.get("loop_enabled", False))
        is_playing = bool(payload.get("is_playing", False))

        if duration_seconds > 0.0 and loop_enabled and position_seconds >= duration_seconds:
            position_seconds = position_seconds % duration_seconds
        else:
            position_seconds = min(position_seconds, duration_seconds)
            if duration_seconds > 0.0 and position_seconds >= duration_seconds:
                is_playing = False

        payload["position_seconds"] = position_seconds
        payload["position_label"] = self._format_time_label(position_seconds)
        payload["duration_label"] = self._format_time_label(duration_seconds)
        payload["is_playing"] = is_playing
        return payload

    def _refresh_backing_track_transport(self) -> None:
        if not self._backing_track_transport.is_playing or self._backing_track_started_monotonic is None:
            self._backing_track_transport = DrumBackingTrackTransportStateModel.model_validate(
                self._normalize_backing_track_transport_payload(self._backing_track_transport.model_dump())
            )
            return

        now = time.monotonic()
        elapsed_seconds = max(0.0, now - self._backing_track_started_monotonic)
        rate = self._backing_track_playback_rate(self._backing_track_transport.tempo_shift)
        raw_position = self._backing_track_started_position_seconds + (elapsed_seconds * rate)
        duration_seconds = self._backing_track_transport.duration_seconds
        if self._backing_track_transport.loop_enabled and duration_seconds > 0.0:
            position_seconds = raw_position % duration_seconds
            is_playing = True
        else:
            position_seconds = min(raw_position, duration_seconds)
            is_playing = raw_position < duration_seconds

        self._backing_track_transport = DrumBackingTrackTransportStateModel.model_validate(
            self._normalize_backing_track_transport_payload(
                {
                    **self._backing_track_transport.model_dump(),
                    "position_seconds": position_seconds,
                    "is_playing": is_playing,
                }
            )
        )

        if not self._backing_track_transport.is_playing:
            self._backing_track_started_monotonic = None
            self._backing_track_started_position_seconds = self._backing_track_transport.position_seconds

    def _freeze_backing_track_transport(self) -> None:
        self._refresh_backing_track_transport()
        if self._backing_track_transport.is_playing:
            self._backing_track_started_monotonic = time.monotonic()
        else:
            self._backing_track_started_monotonic = None
        self._backing_track_started_position_seconds = self._backing_track_transport.position_seconds

    def get_state(self) -> Dict[str, Any]:
        return self._state.model_dump()

    def update_state(self, patch: Dict[str, Any]) -> Dict[str, Any]:
        current = self._state.model_dump()
        current.update({key: value for key, value in patch.items() if value is not None or key in patch})
        self._state = DrumMachineStateModel.model_validate(current)
        self._position = DrumSequencerPositionModel.model_validate(
            {
                **self._position.model_dump(),
                "pattern": self._state.pattern,
                "pattern_id": self._state.pattern,
                "variation": self._state.variation,
            }
        )
        self._sync_state_patch_to_engine(patch)
        self._persist_state()
        return self.get_state()

    def get_transport(self) -> Dict[str, Any]:
        self._refresh_transport_from_engine()
        return DrumTransportStateModel(
            is_playing=self._state.transport,
            bpm=self._state.bpm,
            pattern=self._state.pattern,
            variation=self._state.variation,
            swing=self._state.swing,
            pending_pattern=self._position.pending_pattern,
            switch_quantization_beats=self._position.switch_quantization_beats,
            midi_output_enabled=self._state.midi_output_enabled,
            midi_clock_output_enabled=self._state.midi_clock_output_enabled,
            midi_output_channel=self._state.midi_output_channel,
            program_change_enabled=self._state.program_change_enabled,
            track_swing=list(self._state.track_swing),
        ).model_dump()

    def list_backing_tracks(self) -> List[Dict[str, Any]]:
        return [track.model_dump() for track in self._backing_tracks]

    def get_backing_track_transport(self) -> Dict[str, Any]:
        self._refresh_backing_track_transport()
        return self._backing_track_transport.model_dump()

    def update_backing_track_transport(self, patch: Dict[str, Any]) -> Dict[str, Any]:
        self._freeze_backing_track_transport()
        current = self._backing_track_transport.model_dump()

        if "track_id" in patch and patch["track_id"] is not None:
            track = self._get_backing_track_summary(str(patch["track_id"]))
            current.update(
                {
                    "track_id": track.track_id,
                    "track_name": track.name,
                    "genre": track.genre,
                    "key": track.key,
                    "tempo": track.tempo,
                    "duration_seconds": track.duration_seconds,
                    "duration_label": track.duration_label,
                    "position_seconds": 0.0,
                }
            )

        if "position_seconds" in patch and patch["position_seconds"] is not None:
            current["position_seconds"] = float(patch["position_seconds"])

        if "is_playing" in patch and patch["is_playing"] is True and float(current["position_seconds"]) >= float(current["duration_seconds"]):
            current["position_seconds"] = 0.0

        for key in ("is_playing", "loop_enabled", "tempo_shift", "pitch_shift"):
            if key in patch and patch[key] is not None:
                current[key] = patch[key]

        normalized = self._normalize_backing_track_transport_payload(current)
        self._backing_track_transport = DrumBackingTrackTransportStateModel.model_validate(normalized)
        if self._backing_track_transport.is_playing:
            self._backing_track_started_monotonic = time.monotonic()
        else:
            self._backing_track_started_monotonic = None
        self._backing_track_started_position_seconds = self._backing_track_transport.position_seconds
        return self.get_backing_track_transport()

    def update_transport(self, patch: Dict[str, Any]) -> Dict[str, Any]:
        immediate_pattern = bool(patch.pop("_immediate_pattern", False))
        payload: Dict[str, Any] = {}
        queue_pattern = (
            "pattern" in patch
            and patch.get("pattern") is not None
            and not immediate_pattern
            and bool(self._state.transport)
            and int(patch["pattern"]) != self._state.pattern
        )
        if "is_playing" in patch:
            payload["transport"] = patch["is_playing"]
        for source, target in (
            ("bpm", "bpm"),
            ("variation", "variation"),
            ("swing", "swing"),
            ("midi_output_enabled", "midi_output_enabled"),
            ("midi_clock_output_enabled", "midi_clock_output_enabled"),
            ("midi_output_channel", "midi_output_channel"),
            ("program_change_enabled", "program_change_enabled"),
        ):
            if source in patch:
                payload[target] = patch[source]
        if "pattern" in patch and not queue_pattern:
            payload["pattern"] = patch["pattern"]
        self.update_state(payload)
        engine_patch = dict(patch)
        if queue_pattern:
            engine_patch["queued_pattern"] = patch["pattern"]
            engine_patch.pop("pattern", None)
        self._sync_transport_patch_to_engine(engine_patch)
        if patch.get("is_playing") is False:
            try:
                from app.services.drum_sequencer_service import DrumSequencerService, get_drum_sequencer_service

                if DrumSequencerService.has_instance():
                    get_drum_sequencer_service().handle_transport_stop(self._state.active_pack)
            except Exception:
                pass
            self._persist_state()
        return self.get_transport()

    def get_midi_output_config(self) -> Dict[str, Any]:
        self._refresh_transport_from_engine()
        return DrumMidiOutputConfigModel(
            midi_output_enabled=self._state.midi_output_enabled,
            midi_clock_output_enabled=self._state.midi_clock_output_enabled,
            midi_output_channel=self._state.midi_output_channel,
            program_change_enabled=self._state.program_change_enabled,
        ).model_dump()

    def update_midi_output_config(self, patch: Dict[str, Any]) -> Dict[str, Any]:
        return DrumMidiOutputConfigModel.model_validate(self.update_transport(patch)).model_dump()

    def get_metering(self) -> Dict[str, Any]:
        self._refresh_metering_from_engine()
        return self._metering.model_dump()

    def update_metering(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        self._metering = DrumMeteringModel.model_validate(payload)
        return self._metering.model_dump()

    def get_position(self) -> Dict[str, Any]:
        return self._position.model_dump()

    def get_song_transport(self) -> Dict[str, Any]:
        self._refresh_song_transport_metadata()
        return self._song_transport.model_dump()

    def update_position(self, patch: Dict[str, Any]) -> Dict[str, Any]:
        current = self._position.model_dump()
        current.update({key: value for key, value in patch.items() if value is not None or key in patch})
        current["pattern"] = self._state.pattern if "pattern" not in patch else current["pattern"]
        current["pattern_id"] = current["pattern"]
        current["variation"] = self._state.variation if "variation" not in patch else current["variation"]
        current["is_playing"] = self._state.transport if "is_playing" not in patch else current["is_playing"]
        current["updated_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        self._position = DrumSequencerPositionModel.model_validate(current)
        return self.get_position()

    def trigger_fill(self) -> Dict[str, Any]:
        engine = self._engine()
        if engine is not None:
            trigger = getattr(engine, "trigger_drum_fill", None)
            if callable(trigger):
                trigger()
        return {
            "status": "ok",
            "pattern": self._state.pattern,
            "variation": self._state.variation,
        }

    def set_track_swing(self, instrument: int, swing: int) -> Dict[str, Any]:
        if instrument < 0 or instrument >= 16:
            raise ValueError("instrument must be between 0 and 15")
        next_track_swing = list(self._state.track_swing)
        next_track_swing[instrument] = max(0, min(100, int(swing)))
        self._state = DrumMachineStateModel.model_validate(
            {
                **self._state.model_dump(),
                "track_swing": next_track_swing,
            }
        )
        self._persist_state()
        engine = self._engine()
        setter = getattr(engine, "set_drum_track_swing", None) if engine is not None else None
        if callable(setter):
            setter(instrument, float(next_track_swing[instrument]))
        return {
            "instrument": instrument,
            "swing": next_track_swing[instrument],
            "track_swing": next_track_swing,
        }

    def get_pad_sound_source(self, pad: int) -> Dict[str, Any]:
        self._validate_pad_index(pad)
        return {
            "pad": pad,
            "source": self._state.pad_sound_sources[pad],
        }

    def set_pad_sound_source(self, pad: int, source: str) -> Dict[str, Any]:
        self._validate_pad_index(pad)
        if source not in ("sample", "synth", "hybrid"):
            raise ValueError("source must be one of: sample, synth, hybrid")
        next_sources = list(self._state.pad_sound_sources)
        next_sources[pad] = source
        self._state = DrumMachineStateModel.model_validate(
            {
                **self._state.model_dump(),
                "pad_sound_sources": next_sources,
            }
        )
        engine = self._engine()
        setter = getattr(engine, "set_drum_pad_sound_source", None) if engine is not None else None
        if callable(setter):
            setter(pad, source)
        self._persist_state()
        return self.get_pad_sound_source(pad)

    def get_pad_synth_params(self, pad: int) -> Dict[str, Any]:
        self._validate_pad_index(pad)
        return {
            "pad": pad,
            "params": self._state.pad_synth_params[pad].model_dump(),
        }

    def set_pad_synth_params(self, pad: int, patch: Dict[str, Any]) -> Dict[str, Any]:
        self._validate_pad_index(pad)
        current = self._state.pad_synth_params[pad].model_dump()
        current.update({key: value for key, value in patch.items() if value is not None})
        params = DrumSynthParamModel.model_validate(current)
        next_params = list(self._state.pad_synth_params)
        next_params[pad] = params
        self._state = DrumMachineStateModel.model_validate(
            {
                **self._state.model_dump(),
                "pad_synth_params": [item.model_dump() for item in next_params],
            }
        )
        engine = self._engine()
        setter = getattr(engine, "set_drum_synth_param", None) if engine is not None else None
        if callable(setter):
            for key, value in params.model_dump().items():
                setter(pad, key, value)
        self._persist_state()
        return self.get_pad_synth_params(pad)

    def get_pad_filter(self, pad: int) -> Dict[str, Any]:
        self._validate_pad_index(pad)
        return {
            "pad": pad,
            "filter": self._state.pad_filters[pad].model_dump(),
        }

    def set_pad_filter(self, pad: int, patch: Dict[str, Any]) -> Dict[str, Any]:
        self._validate_pad_index(pad)
        current = self._state.pad_filters[pad].model_dump()
        current.update({key: value for key, value in patch.items() if value is not None})
        config = DrumPadFilterModel.model_validate(current)
        next_filters = list(self._state.pad_filters)
        next_filters[pad] = config
        self._state = DrumMachineStateModel.model_validate(
            {
                **self._state.model_dump(),
                "pad_filters": [item.model_dump() for item in next_filters],
            }
        )
        engine = self._engine()
        setter = getattr(engine, "set_drum_pad_filter", None) if engine is not None else None
        if callable(setter):
            setter(pad, config.type, config.cutoff_hz, config.resonance, config.env_amount, config.env_decay_ms)
        self._persist_state()
        return self.get_pad_filter(pad)

    def get_pad_cv_gate_config(self, pad: int) -> Dict[str, Any]:
        self._validate_pad_index(pad)
        return {
            "pad": pad,
            "config": self._state.pad_cv_gate_configs[pad].model_dump(),
        }

    def set_pad_cv_gate_config(self, pad: int, patch: Dict[str, Any]) -> Dict[str, Any]:
        self._validate_pad_index(pad)
        current = self._state.pad_cv_gate_configs[pad].model_dump()
        current.update({key: value for key, value in patch.items() if value is not None})
        if current["note_max"] <= current["note_min"]:
            current["note_max"] = min(127, current["note_min"] + 1)
        if current["pitch_max_volts"] < current["pitch_min_volts"]:
            current["pitch_max_volts"] = current["pitch_min_volts"]
        config = DrumCvGateConfigModel.model_validate(current)
        next_configs = list(self._state.pad_cv_gate_configs)
        next_configs[pad] = config
        self._state = DrumMachineStateModel.model_validate(
            {
                **self._state.model_dump(),
                "pad_cv_gate_configs": [item.model_dump() for item in next_configs],
            }
        )
        engine = self._engine()
        setter = getattr(engine, "set_drum_cv_gate_config", None) if engine is not None else None
        if callable(setter):
            setter(
                pad,
                config.enabled,
                config.output_pair,
                config.gate_length_ms,
                config.note_min,
                config.note_max,
                config.pitch_min_volts,
                config.pitch_max_volts,
            )
        self._persist_state()
        return self.get_pad_cv_gate_config(pad)

    def get_pad_controls(self) -> List[Dict[str, Any]]:
        return [control.model_dump() for control in self._state.pad_controls]

    def set_pad_control(self, pad: int, patch: Dict[str, Any]) -> Dict[str, Any]:
        self._validate_pad_index(pad)
        current = self._state.pad_controls[pad].model_dump()
        current.update({key: value for key, value in patch.items() if value is not None})
        control = DrumPadControlModel.model_validate(current)
        next_controls = list(self._state.pad_controls)
        next_controls[pad] = control
        self._state = DrumMachineStateModel.model_validate(
            {
                **self._state.model_dump(),
                "pad_controls": [item.model_dump() for item in next_controls],
            }
        )
        engine = self._engine()
        if engine is not None:
            for method_name, value in (
                ("set_drum_pad_volume", control.volume / 100.0),
                ("set_drum_pad_pan", control.pan / 100.0),
                ("set_drum_pad_tune", control.tune),
                ("set_drum_pad_mute", control.mute),
                ("set_drum_pad_solo", control.solo),
                ("set_drum_pad_bus", control.bus_assignment),
            ):
                setter = getattr(engine, method_name, None)
                if callable(setter):
                    setter(pad, value)
        self._persist_state()
        return control.model_dump()

    def _output_channel_count(self) -> int:
        engine = self._engine()
        getter = getattr(engine, "get_num_output_channels", None) if engine is not None else None
        if callable(getter):
            try:
                return max(2, int(getter()))
            except Exception:
                return 2
        return 2

    def _available_output_pairs(self) -> List[int]:
        return list(range(max(1, self._output_channel_count() // 2)))

    def _normalize_bus_mixer(self, mixer: DrumBusMixerModel) -> DrumBusMixerModel:
        available_output_pairs = self._available_output_pairs()
        output_channel_count = self._output_channel_count()
        payload = mixer.model_dump()
        payload["output_pair"] = min(payload["output_pair"], available_output_pairs[-1])
        payload["output_channel_count"] = output_channel_count
        payload["available_output_pairs"] = available_output_pairs
        return DrumBusMixerModel.model_validate(payload)

    def get_bus_mixers(self) -> List[Dict[str, Any]]:
        return [self._normalize_bus_mixer(mixer).model_dump() for mixer in self._state.bus_mixers]

    def set_bus_mixer(self, bus: int, patch: Dict[str, Any]) -> Dict[str, Any]:
        if bus < 0 or bus >= 8:
            raise ValueError("bus must be between 0 and 7")
        current = self._state.bus_mixers[bus].model_dump()
        for key, value in patch.items():
            if value is None:
                continue
            if key in ("eq", "comp") and isinstance(value, dict):
                nested = dict(current.get(key, {}))
                nested.update({nested_key: nested_value for nested_key, nested_value in value.items() if nested_value is not None})
                current[key] = nested
            else:
                current[key] = value
        mixer = self._normalize_bus_mixer(DrumBusMixerModel.model_validate(current))
        next_mixers = list(self._state.bus_mixers)
        next_mixers[bus] = mixer
        self._state = DrumMachineStateModel.model_validate(
            {
                **self._state.model_dump(),
                "bus_mixers": [item.model_dump() for item in next_mixers],
            }
        )
        engine = self._engine()
        if engine is not None:
            eq_setter = getattr(engine, "set_drum_bus_eq", None)
            if callable(eq_setter):
                eq_setter(bus, mixer.eq.low_gain, mixer.eq.mid_gain, mixer.eq.mid_freq, mixer.eq.high_gain)
            comp_setter = getattr(engine, "set_drum_bus_comp", None)
            if callable(comp_setter):
                comp_setter(bus, mixer.comp.threshold, mixer.comp.ratio, mixer.comp.attack, mixer.comp.release, mixer.comp.makeup)
            for method_name, value in (
                ("set_drum_bus_level", mixer.level / 100.0),
                ("set_drum_bus_mute", mixer.mute),
                ("set_drum_bus_solo", mixer.solo),
                ("set_drum_bus_output_pair", mixer.output_pair),
                ("set_drum_bus_reverb_send", mixer.reverb_send / 100.0),
            ):
                setter = getattr(engine, method_name, None)
                if callable(setter):
                    setter(bus, value)
        self._persist_state()
        return mixer.model_dump()

    def get_master_fx(self) -> Dict[str, Any]:
        return self._state.master_fx.model_dump()

    def set_master_fx(self, patch: Dict[str, Any]) -> Dict[str, Any]:
        current = self._state.master_fx.model_dump()
        current.update({key: value for key, value in patch.items() if value is not None})
        master_fx = DrumMasterFxModel.model_validate(current)
        self._state = DrumMachineStateModel.model_validate(
            {
                **self._state.model_dump(),
                "master_fx": master_fx.model_dump(),
            }
        )
        engine = self._engine()
        if engine is not None:
            setter = getattr(engine, "set_drum_master_fx", None)
            if callable(setter):
                for key, value in master_fx.model_dump().items():
                    setter(key, value)
        self._persist_state()
        return master_fx.model_dump()

    def set_bus_reverb_send(self, bus: int, level: float) -> Dict[str, Any]:
        return self.set_bus_mixer(bus, {"reverb_send": level})

    def get_master_volume(self) -> Dict[str, Any]:
        return {"volume": self._state.volume}

    def set_master_volume(self, volume: float) -> Dict[str, Any]:
        normalized = int(max(0, min(100, round(volume))))
        self.update_state({"volume": normalized})
        return self.get_master_volume()

    def start_song_playback(self) -> Dict[str, Any]:
        entries = self._get_song_entries()
        if not entries:
            self._song_transport = DrumSongTransportStateModel(
                is_playing=False,
                current_entry_index=-1,
                current_repeat=0,
                total_entries=0,
                loop=self._get_song_loop(),
                active_pattern=self._state.pattern,
            )
            return self.get_song_transport()

        first_pattern = int(entries[0]["pattern"])
        self._song_transport = DrumSongTransportStateModel(
            is_playing=True,
            current_entry_index=0,
            current_repeat=1,
            total_entries=len(entries),
            loop=self._get_song_loop(),
            active_pattern=first_pattern,
        )
        self._last_polled_step = None
        self.update_transport({"pattern": first_pattern, "is_playing": True})
        return self.get_song_transport()

    def stop_song_playback(self, stop_transport: bool = True) -> Dict[str, Any]:
        self._refresh_song_transport_metadata()
        self._song_transport = DrumSongTransportStateModel(
            is_playing=False,
            current_entry_index=self._song_transport.current_entry_index,
            current_repeat=self._song_transport.current_repeat if self._song_transport.current_entry_index >= 0 else 0,
            total_entries=self._song_transport.total_entries,
            loop=self._song_transport.loop,
            active_pattern=self._state.pattern,
        )
        if stop_transport:
            self.update_transport({"is_playing": False})
        return self.get_song_transport()

    async def publish_state_update(self) -> None:
        from app.services.websocket_manager import ws_manager

        payload = {
            "type": "drum_state",
            "data": self.get_state(),
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        await ws_manager.broadcast_json(payload, topic="drums")

    async def publish_transport_update(self) -> None:
        from app.services.websocket_manager import ws_manager

        payload = {
            "type": "drum_transport",
            "data": self.get_transport(),
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        await ws_manager.broadcast_json(payload, topic="drums:transport")
        await ws_manager.broadcast_json(payload, topic="drums")

    async def publish_position_update(self) -> None:
        from app.services.websocket_manager import ws_manager

        payload = {
            "type": "drum_position",
            "data": self.get_position(),
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        await ws_manager.broadcast_json(payload, topic="drums:position")
        await ws_manager.broadcast_json(payload, topic="drums")

    async def publish_metering_update(self) -> None:
        from app.services.websocket_manager import ws_manager

        payload = {
            "type": "drum_metering",
            "data": self._metering.model_dump(),
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        await ws_manager.broadcast_json(payload, topic="drums:metering")
        await ws_manager.broadcast_json(payload, topic="drums")

    def _index_pack_file(self, pack_file: Path) -> Optional[DrumPackSummaryModel]:
        try:
            pack = json.loads(pack_file.read_text())
        except (OSError, json.JSONDecodeError):
            return None

        pack_id = pack.get("pack_id")
        if not pack_id:
            return None

        return DrumPackSummaryModel(
            pack_id=str(pack_id),
            name=str(pack.get("name") or pack_id),
            description=str(pack.get("description") or ""),
            source=str(pack.get("source") or ""),
            filename=pack_file.name,
        )

    def list_factory_packs(self) -> List[Dict[str, Any]]:
        if not self._factory_packs_dir.exists():
            return []

        packs: List[DrumPackSummaryModel] = []
        for pack_file in sorted(self._factory_packs_dir.glob("*.json")):
            pack = self._index_pack_file(pack_file)
            if pack is not None:
                packs.append(pack)
        return [pack.model_dump() for pack in packs]

    def list_generated_packs(self) -> List[Dict[str, Any]]:
        return self._user_content_manager.list_packs()

    def get_factory_pack_details(self, pack_id: str) -> Dict[str, Any]:
        for pack_file in sorted(self._factory_packs_dir.glob("*.json")):
            try:
                pack = json.loads(pack_file.read_text())
            except (OSError, json.JSONDecodeError):
                continue
            if pack.get("pack_id") == pack_id:
                return pack
        raise FileNotFoundError(pack_id)

    def get_generated_pack_details(self, pack_id: str) -> Dict[str, Any]:
        return self._user_content_manager.get_pack(pack_id)

    def save_generated_pack(self, pack: Dict[str, Any]) -> Dict[str, Any]:
        path = self._user_content_manager.save_pack(pack)
        pack_id = str(pack.get("pack_id") or Path(path).stem)
        return {
            "status": "ok",
            "path": path,
            "pack_id": pack_id,
        }

    def _get_active_kit_id(self) -> Optional[str]:
        try:
            from app.services.drum_kit_service import DrumKitService, get_drum_kit_service

            if not DrumKitService.has_instance():
                return None
            active_kit = get_drum_kit_service().get_active_kit()
            return None if active_kit is None else str(active_kit.get("kit_id") or "")
        except Exception:
            return None

    def _midi_config_path(self, kit_id: str) -> Path:
        return self._midi_configs_dir / f"{kit_id}.json"

    def _current_midi_config_payload(self) -> Dict[str, Any]:
        return {
            "mapping": self.get_midi_mapping(),
            "velocity_curves": self.get_velocity_curves(),
            "zones": self.get_midi_zones(),
        }

    def persist_midi_config_for_kit(self, kit_id: str) -> Dict[str, Any]:
        payload = self._current_midi_config_payload()
        self._midi_configs_dir.mkdir(parents=True, exist_ok=True)
        path = self._midi_config_path(kit_id)
        temp_path = path.with_suffix(".tmp")
        temp_path.write_text(json.dumps(payload, indent=2, sort_keys=True))
        temp_path.replace(path)
        return payload

    def persist_active_kit_midi_config(self) -> Optional[Dict[str, Any]]:
        kit_id = self._get_active_kit_id()
        if not kit_id:
            return None
        return self.persist_midi_config_for_kit(kit_id)

    def load_midi_config_for_kit(self, kit_id: str) -> Dict[str, Any]:
        path = self._midi_config_path(kit_id)
        if not path.exists():
            return self._current_midi_config_payload()

        payload = json.loads(path.read_text())
        mapping = DrumMidiMappingModel.model_validate(payload.get("mapping", {})).model_dump()
        velocity_curves = DrumMidiVelocityCurvesModel.model_validate(payload.get("velocity_curves", {})).model_dump()
        zones = DrumMidiZonesModel.model_validate(payload.get("zones", {})).model_dump()
        self.update_midi_mapping(mapping)
        self.update_velocity_curves(velocity_curves)
        self.update_midi_zones(zones)
        return self._current_midi_config_payload()

    def get_midi_mapping(self) -> Dict[str, Any]:
        engine = self._engine()
        getter = getattr(engine, "get_drum_global_midi_channel", None) if engine is not None else None
        if callable(getter):
            try:
                self._global_midi_channel = int(getter())
            except Exception:
                pass

        get_notes = getattr(engine, "get_drum_pad_notes", None) if engine is not None else None
        for pad in range(16):
            if callable(get_notes):
                try:
                    self._pad_midi_notes[pad] = [int(note) for note in list(get_notes(pad))]
                except Exception:
                    pass

        return DrumMidiMappingModel(
            global_midi_channel=self._global_midi_channel,
            pads=[
                DrumMidiPadMappingModel(
                    pad=pad,
                    notes=list(self._pad_midi_notes[pad]),
                    midi_channel=self._pad_midi_channels[pad],
                )
                for pad in range(16)
            ],
        ).model_dump()

    def update_midi_mapping(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        engine = self._engine()
        if "global_midi_channel" in payload:
            self._global_midi_channel = int(payload["global_midi_channel"])
            setter = getattr(engine, "set_drum_global_midi_channel", None) if engine is not None else None
            if callable(setter):
                setter(self._global_midi_channel)

        for pad_payload in payload.get("pads", []):
            pad = int(pad_payload["pad"])
            notes = [int(note) for note in pad_payload.get("notes", [])]
            midi_channel = int(pad_payload.get("midi_channel", self._pad_midi_channels[pad]))
            previous_notes = list(self._pad_midi_notes.get(pad, []))
            self._pad_midi_notes[pad] = notes or [self._pad_midi_notes.get(pad, [_DEFAULT_DRUM_NOTES[pad]])[0]]
            self._pad_midi_channels[pad] = midi_channel

            if engine is not None:
                set_note = getattr(engine, "set_drum_pad_note", None)
                add_note = getattr(engine, "add_drum_pad_note", None)
                remove_note = getattr(engine, "remove_drum_pad_note", None)
                set_channel = getattr(engine, "set_drum_pad_midi_channel", None)
                if callable(set_note) and self._pad_midi_notes[pad]:
                    set_note(pad, self._pad_midi_notes[pad][0])
                if callable(remove_note):
                    for note in previous_notes[1:]:
                        if note not in self._pad_midi_notes[pad]:
                            remove_note(pad, note)
                if callable(add_note):
                    for note in self._pad_midi_notes[pad][1:]:
                        add_note(pad, note)
                if callable(set_channel):
                    set_channel(pad, midi_channel)

        updated = self.get_midi_mapping()
        self.persist_active_kit_midi_config()
        return updated

    def get_velocity_curves(self) -> Dict[str, Any]:
        engine = self._engine()
        get_preview = getattr(engine, "get_drum_pad_velocity_curve_preview", None) if engine is not None else None
        get_last_velocity = getattr(engine, "get_drum_pad_last_velocity", None) if engine is not None else None
        pads: List[DrumPadVelocityCurveModel] = []
        for pad in range(16):
            config = dict(self._velocity_curves[pad])
            preview = []
            if callable(get_preview):
                try:
                    preview = [float(value) for value in list(get_preview(pad))]
                except Exception:
                    preview = []
            last_velocity = 0.0
            if callable(get_last_velocity):
                try:
                    last_velocity = float(get_last_velocity(pad))
                except Exception:
                    last_velocity = 0.0
            pads.append(DrumPadVelocityCurveModel(pad=pad, preview=preview, last_velocity=last_velocity, **config))
        return DrumMidiVelocityCurvesModel(pads=pads).model_dump()

    def update_velocity_curves(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        engine = self._engine()
        setter = getattr(engine, "set_drum_pad_velocity_curve", None) if engine is not None else None
        for pad_payload in payload.get("pads", []):
            pad = int(pad_payload["pad"])
            self._velocity_curves[pad] = {
                "curve_type": int(pad_payload.get("curve_type", 0)),
                "fixed_velocity": float(pad_payload.get("fixed_velocity", 1.0)),
                "input_floor": float(pad_payload.get("input_floor", 0.0)),
                "output_floor": float(pad_payload.get("output_floor", 0.0)),
                "output_ceiling": float(pad_payload.get("output_ceiling", 1.0)),
            }
            if callable(setter):
                setter(
                    pad,
                    self._velocity_curves[pad]["curve_type"],
                    self._velocity_curves[pad]["fixed_velocity"],
                    self._velocity_curves[pad]["input_floor"],
                    self._velocity_curves[pad]["output_floor"],
                    self._velocity_curves[pad]["output_ceiling"],
                )
        updated = self.get_velocity_curves()
        self.persist_active_kit_midi_config()
        return updated

    def get_midi_zones(self) -> Dict[str, Any]:
        engine = self._engine()
        getter = getattr(engine, "get_drum_pad_zones", None) if engine is not None else None
        pads: List[DrumPadZonesModel] = []
        for pad in range(16):
            zones = self._pad_zones[pad]
            if callable(getter):
                try:
                    zones = [dict(zone) for zone in list(getter(pad))]
                    self._pad_zones[pad] = zones
                except Exception:
                    pass
            pads.append(
                DrumPadZonesModel(
                    pad=pad,
                    zones=[DrumPadZoneModel.model_validate(zone) for zone in zones],
                )
            )
        return DrumMidiZonesModel(pads=pads).model_dump()

    def update_midi_zones(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        engine = self._engine()
        set_zone = getattr(engine, "set_drum_pad_zone", None) if engine is not None else None
        clear_zone = getattr(engine, "clear_drum_pad_zone", None) if engine is not None else None
        for pad_payload in payload.get("pads", []):
            pad = int(pad_payload["pad"])
            zones = [DrumPadZoneModel.model_validate(zone).model_dump() for zone in pad_payload.get("zones", [])]
            self._pad_zones[pad] = zones
            if callable(clear_zone):
                for kind in range(3):
                    clear_zone(pad, kind)
            if callable(set_zone):
                for zone in zones:
                    if zone["enabled"]:
                        set_zone(
                            pad,
                            zone["kind"],
                            zone["trigger_note"],
                            zone["key_switch_note"],
                            zone["velocity_scale"],
                        )
        updated = self.get_midi_zones()
        self.persist_active_kit_midi_config()
        return updated

    def start_midi_learn(self, pad: int, learn_all: bool = False, timeout_seconds: int = 10) -> Dict[str, Any]:
        engine = self._engine()
        starter = getattr(engine, "start_drum_midi_learn", None) if engine is not None else None
        started = True
        if callable(starter):
            started = bool(starter(pad, learn_all, timeout_seconds))
        if not started:
            raise ValueError("Unable to start drum MIDI learn mode")
        self._midi_learn_state = DrumMidiLearnStateModel(
            active=True,
            learn_all=learn_all,
            active_pad_index=pad,
            next_pad_index=pad,
            timeout_seconds=timeout_seconds,
        )
        return self.get_midi_learn_state()

    def stop_midi_learn(self) -> Dict[str, Any]:
        engine = self._engine()
        stopper = getattr(engine, "stop_drum_midi_learn", None) if engine is not None else None
        if callable(stopper):
            stopper()
        self._midi_learn_state.active = False
        self._midi_learn_state.learn_all = False
        self._midi_learn_state.active_pad_index = -1
        self._midi_learn_state.next_pad_index = -1
        return self.get_midi_learn_state()

    def get_midi_learn_state(self) -> Dict[str, Any]:
        engine = self._engine()
        getter = getattr(engine, "get_drum_midi_learn_state", None) if engine is not None else None
        if callable(getter):
            try:
                self._midi_learn_state = DrumMidiLearnStateModel.model_validate(dict(getter()))
            except Exception:
                pass
        return self._midi_learn_state.model_dump()

    def get_midi_presets(self) -> Dict[str, Any]:
        engine = self._engine()
        getter = getattr(engine, "get_drum_midi_presets", None) if engine is not None else None
        presets: List[str] = []
        if callable(getter):
            try:
                presets = [str(preset) for preset in list(getter())]
            except Exception:
                presets = []
        return DrumMidiPresetListModel(presets=presets).model_dump()

    def load_midi_preset(self, preset_name: str) -> Dict[str, Any]:
        engine = self._engine()
        loader = getattr(engine, "apply_drum_midi_preset", None) if engine is not None else None
        applied = True
        if callable(loader):
            applied = bool(loader(preset_name))
        if not applied:
            raise ValueError(f"Unknown drum MIDI preset: {preset_name}")
        payload = {
            "status": "ok",
            "preset_name": preset_name,
            "mapping": self.get_midi_mapping(),
            "zones": self.get_midi_zones(),
        }
        self.persist_active_kit_midi_config()
        return payload

    def get_cc_mappings(self) -> Dict[str, Any]:
        engine = self._engine()
        getter = getattr(engine, "get_drum_cc_mappings", None) if engine is not None else None
        if callable(getter):
            try:
                payload = DrumCcMappingModel.model_validate({"mappings": list(getter())})
                self._cc_mappings = payload
            except Exception:
                pass
        return self._cc_mappings.model_dump()

    def update_cc_mappings(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        model = DrumCcMappingModel.model_validate(payload)
        self._cc_mappings = DrumCcMappingModel(
            mappings=sorted(model.mappings, key=lambda entry: entry.slot)
        )
        self._persist_cc_mappings()
        self._sync_cc_mappings_to_engine()
        return self.get_cc_mappings()

    def start_cc_learn(self, slot: int, timeout_seconds: int = 10) -> Dict[str, Any]:
        engine = self._engine()
        starter = getattr(engine, "start_drum_cc_learn", None) if engine is not None else None
        started = True
        if callable(starter):
            started = bool(starter(slot, timeout_seconds))
        if not started:
            raise ValueError("Unable to start drum CC learn mode")
        self._cc_learn_state = DrumCcLearnStateModel(
            active=True,
            slot=slot,
            timeout_seconds=timeout_seconds,
        )
        return self.get_cc_learn_state()

    def stop_cc_learn(self) -> Dict[str, Any]:
        engine = self._engine()
        stopper = getattr(engine, "stop_drum_cc_learn", None) if engine is not None else None
        if callable(stopper):
            stopper()
        self._cc_learn_state = DrumCcLearnStateModel()
        return self.get_cc_learn_state()

    def get_cc_learn_state(self) -> Dict[str, Any]:
        engine = self._engine()
        getter = getattr(engine, "get_drum_cc_learn_state", None) if engine is not None else None
        if callable(getter):
            try:
                self._cc_learn_state = DrumCcLearnStateModel.model_validate(dict(getter()))
            except Exception:
                pass
        return self._cc_learn_state.model_dump()

    def _sync_cc_mappings_to_engine(self) -> None:
        engine = self._engine()
        if engine is None:
            return
        setter = getattr(engine, "set_drum_cc_mapping", None)
        if not callable(setter):
            return
        for mapping in self._cc_mappings.mappings:
            setter(
                mapping.slot,
                mapping.cc_number,
                mapping.midi_channel,
                mapping.target,
                mapping.target_index,
                mapping.active,
            )

    def _engine(self) -> Any:
        try:
            return get_audio_engine().engine
        except Exception:
            return None

    def _validate_pad_index(self, pad: int) -> None:
        if pad < 0 or pad >= 16:
            raise ValueError("pad must be between 0 and 15")

    def _sync_static_state_to_engine(self) -> None:
        self._sync_state_patch_to_engine({"volume": self._state.volume})
        for pad, control in enumerate(self._state.pad_controls):
            self.set_pad_control(pad, control.model_dump())
        for instrument, swing in enumerate(self._state.track_swing):
            self.set_track_swing(instrument, swing)
        for pad, source in enumerate(self._state.pad_sound_sources):
            self.set_pad_sound_source(pad, source)
        for pad, params in enumerate(self._state.pad_synth_params):
            self.set_pad_synth_params(pad, params.model_dump())
        for pad, filter_config in enumerate(self._state.pad_filters):
            self.set_pad_filter(pad, filter_config.model_dump())
        for pad, cv_gate_config in enumerate(self._state.pad_cv_gate_configs):
            self.set_pad_cv_gate_config(pad, cv_gate_config.model_dump())
        for bus, mixer in enumerate(self._state.bus_mixers):
            self.set_bus_mixer(bus, mixer.model_dump())
        self.set_master_fx(self._state.master_fx.model_dump())
        self._refresh_metering_from_engine()
        self._refresh_position_from_engine()

    def _sync_state_patch_to_engine(self, patch: Dict[str, Any]) -> None:
        engine = self._engine()
        if engine is None:
            return

        if "volume" in patch:
            setter = getattr(engine, "set_drum_master_volume", None)
            if callable(setter):
                setter(float(self._state.volume) / 100.0)

    def _sync_transport_patch_to_engine(self, patch: Dict[str, Any]) -> None:
        engine = self._engine()
        if engine is None:
            return

        if "bpm" in patch:
            setter = getattr(engine, "set_drum_bpm", None)
            if callable(setter):
                setter(self._state.bpm)

        if "pattern" in patch:
            setter = getattr(engine, "set_drum_current_pattern", None)
            if callable(setter):
                setter(self._state.pattern)
            self._song_transport = DrumSongTransportStateModel.model_validate(
                {
                    **self._song_transport.model_dump(),
                    "active_pattern": self._state.pattern,
                }
            )

        if "queued_pattern" in patch:
            setter = getattr(engine, "queue_drum_pattern_switch", None)
            if callable(setter):
                setter(int(patch["queued_pattern"]))

        if "switch_quantization_beats" in patch:
            setter = getattr(engine, "set_drum_pattern_switch_quantization", None)
            if callable(setter):
                setter(int(patch["switch_quantization_beats"]))

        if "variation" in patch:
            setter = getattr(engine, "set_drum_variation", None)
            if callable(setter):
                setter(self._state.pattern, self._state.variation)

        if "swing" in patch:
            setter = getattr(engine, "set_drum_swing", None)
            if callable(setter):
                setter(float(self._state.swing))

        if "midi_output_enabled" in patch:
            setter = getattr(engine, "set_drum_midi_output_enabled", None)
            if callable(setter):
                setter(bool(self._state.midi_output_enabled))

        if "midi_clock_output_enabled" in patch:
            setter = getattr(engine, "set_drum_midi_clock_output_enabled", None)
            if callable(setter):
                setter(bool(self._state.midi_clock_output_enabled))

        if "midi_output_channel" in patch:
            setter = getattr(engine, "set_drum_midi_output_channel", None)
            if callable(setter):
                setter(int(self._state.midi_output_channel))

        if "program_change_enabled" in patch:
            setter = getattr(engine, "set_drum_program_change_enabled", None)
            if callable(setter):
                setter(bool(self._state.program_change_enabled))

        if "is_playing" in patch:
            self._event_loop = self._safe_running_loop()
            if patch["is_playing"]:
                setter = getattr(engine, "set_drum_transport_playing", None)
                if callable(setter):
                    setter(True)
                self._ensure_position_poll_task()
            else:
                setter = getattr(engine, "set_drum_transport_playing", None)
                if callable(setter):
                    setter(False)
                self._stop_position_poll_task()
                self._song_transport = DrumSongTransportStateModel.model_validate(
                    {
                        **self._song_transport.model_dump(),
                        "is_playing": False,
                    }
                )
                self._refresh_position_from_engine()

    def _safe_running_loop(self) -> Optional[asyncio.AbstractEventLoop]:
        try:
            return asyncio.get_running_loop()
        except RuntimeError:
            return None

    def _ensure_position_poll_task(self) -> None:
        if self._event_loop is None:
            return
        if self._position_poll_task is None or self._position_poll_task.done():
            self._position_poll_task = self._event_loop.create_task(
                self._position_poll_loop(),
                name="drum_machine_position_poll",
            )

    def _stop_position_poll_task(self) -> None:
        if self._position_poll_task is None:
            return
        task = self._position_poll_task
        self._position_poll_task = None
        task.cancel()
        if self._event_loop is not None and self._event_loop.is_running():
            self._event_loop.create_task(self._drain_cancelled_task(task))

    async def _position_poll_loop(self) -> None:
        try:
            while self._state.transport:
                changed = self._refresh_position_from_engine()
                if changed:
                    await self.publish_position_update()
                await asyncio.sleep(_POSITION_POLL_INTERVAL_SECONDS)
        except asyncio.CancelledError:
            raise

    async def _drain_cancelled_task(self, task: asyncio.Task) -> None:
        with contextlib.suppress(asyncio.CancelledError):
            await task

    def _refresh_position_from_engine(self) -> bool:
        engine = self._engine()
        if engine is None:
            return False

        getter = getattr(engine, "get_drum_sequencer_position", None)
        if not callable(getter):
            return False

        try:
            payload = dict(getter())
        except Exception:
            return False

        payload.setdefault("pattern", payload.get("pattern_id", self._state.pattern))
        payload.setdefault("pattern_id", payload.get("pattern", self._state.pattern))
        payload.setdefault("variation", self._state.variation)
        payload.setdefault("is_playing", self._state.transport)
        payload.setdefault("beat", min(4, (int(payload.get("step", 0)) // 4) + 1))
        payload.setdefault("pending_pattern", self._position.pending_pattern)
        payload.setdefault("switch_quantization_beats", self._position.switch_quantization_beats)

        state_changed = False
        if int(payload["pattern"]) != self._state.pattern or int(payload["variation"]) != self._state.variation:
            self._state = DrumMachineStateModel.model_validate(
                {
                    **self._state.model_dump(),
                    "pattern": int(payload["pattern"]),
                    "variation": int(payload["variation"]),
                }
            )
            self._persist_state()
            state_changed = True

        current_snapshot = self._position.model_dump(exclude={"updated_at"})
        updated = self.update_position(payload)
        updated_snapshot = {key: value for key, value in updated.items() if key != "updated_at"}
        self._advance_song_transport(updated_snapshot)
        return state_changed or updated_snapshot != current_snapshot

    def _refresh_transport_from_engine(self) -> None:
        engine = self._engine()
        if engine is None:
            return

        pending_getter = getattr(engine, "get_drum_pending_pattern_switch", None)
        quantization_getter = getattr(engine, "get_drum_pattern_switch_quantization", None)
        midi_output_getter = getattr(engine, "get_drum_midi_output_enabled", None)
        midi_clock_getter = getattr(engine, "get_drum_midi_clock_output_enabled", None)
        midi_channel_getter = getattr(engine, "get_drum_midi_output_channel", None)
        program_change_getter = getattr(engine, "get_drum_program_change_enabled", None)
        patch: Dict[str, Any] = {}

        if callable(pending_getter):
            try:
                patch["pending_pattern"] = int(pending_getter())
            except Exception:
                pass

        if callable(quantization_getter):
            try:
                patch["switch_quantization_beats"] = int(quantization_getter())
            except Exception:
                pass

        state_patch: Dict[str, Any] = {}
        if callable(midi_output_getter):
            try:
                state_patch["midi_output_enabled"] = bool(midi_output_getter())
            except Exception:
                pass

        if callable(midi_clock_getter):
            try:
                state_patch["midi_clock_output_enabled"] = bool(midi_clock_getter())
            except Exception:
                pass

        if callable(midi_channel_getter):
            try:
                state_patch["midi_output_channel"] = int(midi_channel_getter())
            except Exception:
                pass

        if callable(program_change_getter):
            try:
                state_patch["program_change_enabled"] = bool(program_change_getter())
            except Exception:
                pass

        if state_patch:
            self._state = DrumMachineStateModel.model_validate(
                {
                    **self._state.model_dump(),
                    **state_patch,
                }
            )

        if patch:
            self.update_position(patch)

    def _get_song_entries(self) -> List[Dict[str, Any]]:
        try:
            from app.services.drum_sequencer_service import DrumSequencerService, get_drum_sequencer_service

            if not DrumSequencerService.has_instance():
                return []
            return list(get_drum_sequencer_service().get_song())
        except Exception:
            return []

    def _get_song_loop(self) -> bool:
        try:
            from app.services.drum_sequencer_service import DrumSequencerService, get_drum_sequencer_service

            if not DrumSequencerService.has_instance():
                return False
            return bool(get_drum_sequencer_service().get_song_loop())
        except Exception:
            return False

    def _refresh_song_transport_metadata(self) -> None:
        entries = self._get_song_entries()
        loop = self._get_song_loop()
        current_index = self._song_transport.current_entry_index
        if current_index >= len(entries):
            current_index = len(entries) - 1
        self._song_transport = DrumSongTransportStateModel.model_validate(
            {
                **self._song_transport.model_dump(),
                "current_entry_index": current_index if entries else -1,
                "current_repeat": self._song_transport.current_repeat if entries else 0,
                "total_entries": len(entries),
                "loop": loop,
                "active_pattern": self._state.pattern,
            }
        )

    def _advance_song_transport(self, position_snapshot: Dict[str, Any]) -> None:
        current_step = int(position_snapshot.get("step", 0))
        is_playing = bool(position_snapshot.get("is_playing", False))
        if not is_playing:
            self._last_polled_step = current_step
            return

        if not self._song_transport.is_playing:
            self._last_polled_step = current_step
            return

        entries = self._get_song_entries()
        if not entries:
            self._song_transport = DrumSongTransportStateModel(active_pattern=self._state.pattern)
            self._last_polled_step = current_step
            return

        if self._last_polled_step is not None and current_step < self._last_polled_step:
            entry_index = max(0, min(self._song_transport.current_entry_index, len(entries) - 1))
            repeat = max(1, self._song_transport.current_repeat)
            current_entry = entries[entry_index]
            if repeat < int(current_entry["repeat_count"]):
                self._song_transport = DrumSongTransportStateModel.model_validate(
                    {
                        **self._song_transport.model_dump(),
                        "current_repeat": repeat + 1,
                    }
                )
            else:
                next_index = entry_index + 1
                if next_index >= len(entries):
                    if self._song_transport.loop:
                        next_index = 0
                    else:
                        self.stop_song_playback(stop_transport=True)
                        self._last_polled_step = current_step
                        return
                next_pattern = int(entries[next_index]["pattern"])
                self._song_transport = DrumSongTransportStateModel.model_validate(
                    {
                        **self._song_transport.model_dump(),
                        "current_entry_index": next_index,
                        "current_repeat": 1,
                        "active_pattern": next_pattern,
                    }
                )
                self.update_transport({"pattern": next_pattern, "_immediate_pattern": True})

        self._refresh_song_transport_metadata()
        self._last_polled_step = current_step

    def _refresh_metering_from_engine(self) -> None:
        engine = self._engine()
        if engine is None:
            return

        getter = getattr(engine, "get_drum_metering", None)
        if not callable(getter):
            return

        try:
            payload = getter()
            if payload:
                self._metering = DrumMeteringModel.model_validate(dict(payload))
        except Exception:
            return


def get_drum_machine_service() -> DrumMachineService:
    return DrumMachineService.get_instance()
