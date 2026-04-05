"""
Performance Brain state service.

Provides a persistence-backed, per-instance service layer for the new unified
instrument/workstation that replaces the split drum and sampler surfaces over
time while legacy routes remain available.
"""

from __future__ import annotations

import json
import os
import re
import threading
import wave
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.paths import StoragePaths
from app.services.drum_kit_service import get_drum_kit_service
from app.utils.singleton import Singleton


_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_BRAIN_ROOT = Path(
    os.environ.get("MAP2_BRAIN_ROOT", Path.home() / ".map2" / "performance_brain")
)
_INSTANCE_DIR_NAME = "instances"
_SECTION_IDS = (
    "overview",
    "perform",
    "layers",
    "sequence",
    "routing",
    "inputs",
    "library",
    "diagnostics",
)
BRAIN_RUNTIME_TOPIC = "brain:runtime"
BrainRuntimeResource = Literal[
    "state",
    "transport",
    "slot",
    "layers",
    "sequence",
    "song",
    "mixer",
    "inputs",
    "sample_editor",
]


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _sanitize_key(value: str) -> str:
    sanitized = re.sub(r"[^A-Za-z0-9._-]+", "_", value.strip())
    return sanitized or "workspace-default"


class BrainTransportStateModel(BaseModel):
    is_playing: bool = False
    bpm: int = Field(120, ge=40, le=300)
    swing: int = Field(0, ge=0, le=100)
    pattern: int = Field(0, ge=0, le=127)
    variation: int = Field(0, ge=0, le=10)
    step: int = Field(0, ge=0, le=63)
    bar: int = Field(1, ge=1)
    beat: int = Field(1, ge=1, le=16)
    pending_pattern: int = Field(-1, ge=-1, le=127)
    switch_quantization_beats: int = Field(4, ge=1, le=16)


class BrainSlotModel(BaseModel):
    slot_id: int = Field(..., ge=0, le=15)
    name: str
    mode: Literal["chromatic", "drum", "hybrid"] = "drum"
    asset_type: Literal["soundfont", "sfz", "sample", "kit", "patch", "empty"] = "empty"
    asset_path: str = ""
    source_label: str = ""
    level: float = Field(1.0, ge=0.0, le=1.0)
    pan: float = Field(0.0, ge=-1.0, le=1.0)
    mute: bool = False
    solo: bool = False
    tune: float = Field(0.0, ge=-24.0, le=24.0)
    transpose: int = Field(0, ge=-36, le=36)
    output_bus: int = Field(0, ge=0, le=7)
    polyphony: int = Field(16, ge=1, le=128)
    midi_channel: int = Field(0, ge=0, le=16)
    trigger_note: int = Field(36, ge=0, le=127)
    trigger_notes: list[int] = Field(default_factory=lambda: [36], min_length=1)
    key_low: int = Field(0, ge=0, le=127)
    key_high: int = Field(127, ge=0, le=127)
    velocity_low: int = Field(1, ge=1, le=127)
    velocity_high: int = Field(127, ge=1, le=127)
    choke_group: int = Field(0, ge=0, le=15)
    articulation_group: str = "main"
    velocity_curve: str = "linear"
    status: str = "ready"


class BrainLayerModel(BaseModel):
    layer_id: str
    name: str
    slot_indices: list[int] = Field(default_factory=list)
    key_low: int = Field(0, ge=0, le=127)
    key_high: int = Field(127, ge=0, le=127)
    velocity_low: int = Field(1, ge=1, le=127)
    velocity_high: int = Field(127, ge=1, le=127)
    polyphony: int = Field(32, ge=1, le=256)
    scene_slot: int = Field(0, ge=0, le=7)
    enabled: bool = True
    purpose: str = "layer"


class BrainPatternSummaryModel(BaseModel):
    pattern_id: int = Field(..., ge=0, le=127)
    name: str
    length: int = Field(16, ge=1, le=64)
    active_lane_count: int = Field(0, ge=0, le=16)
    fill_enabled: bool = False
    variation_count: int = Field(10, ge=0, le=10)
    summary: str = ""


class BrainSequenceLaneSummaryModel(BaseModel):
    slot_id: int = Field(..., ge=0, le=15)
    name: str
    length: int = Field(16, ge=1, le=64)
    swing: int = Field(0, ge=0, le=100)
    active_steps: int = Field(0, ge=0, le=64)
    step_lock_targets: list[str] = Field(default_factory=list)


class BrainSequenceModel(BaseModel):
    pattern_bank_size: int = Field(128, ge=1)
    max_steps: int = Field(64, ge=1)
    current_pattern: int = Field(0, ge=0, le=127)
    current_variation: int = Field(0, ge=0, le=10)
    patterns: list[BrainPatternSummaryModel] = Field(default_factory=list)
    lanes: list[BrainSequenceLaneSummaryModel] = Field(default_factory=list)
    fill_mode: str = "manual"
    song_entry_count: int = Field(0, ge=0)


class BrainSongEntryModel(BaseModel):
    pattern_id: int = Field(..., ge=0, le=127)
    variation: int = Field(0, ge=0, le=10)
    repeat_count: int = Field(1, ge=1, le=64)
    label: str = ""


class BrainSongStateModel(BaseModel):
    entries: list[BrainSongEntryModel] = Field(default_factory=list)
    loop: bool = False


class BrainMixerBusModel(BaseModel):
    bus_id: int = Field(..., ge=0, le=7)
    name: str
    level: float = Field(1.0, ge=0.0, le=1.5)
    pan: float = Field(0.0, ge=-1.0, le=1.0)
    mute: bool = False
    solo: bool = False
    output_pair: int = Field(0, ge=0)
    reverb_send: float = Field(0.0, ge=0.0, le=1.0)


class BrainMasterSectionModel(BaseModel):
    master_volume: float = Field(0.82, ge=0.0, le=1.2)
    drive_db: float = Field(0.0, ge=0.0, le=24.0)
    compressor_amount: float = Field(0.2, ge=0.0, le=1.0)
    reverb_mix: float = Field(0.18, ge=0.0, le=1.0)
    limiter_ceiling_db: float = Field(-0.5, ge=-12.0, le=0.0)


class BrainMixerStateModel(BaseModel):
    buses: list[BrainMixerBusModel] = Field(default_factory=list)
    master: BrainMasterSectionModel = Field(default_factory=BrainMasterSectionModel)


class BrainKeyboardZoneModel(BaseModel):
    zone_id: str
    name: str
    midi_channel: int = Field(1, ge=1, le=16)
    key_low: int = Field(0, ge=0, le=127)
    key_high: int = Field(127, ge=0, le=127)
    transpose: int = Field(0, ge=-24, le=24)
    enabled: bool = True
    aftertouch_mode: str = "channel"


class BrainTriggerProfileModel(BaseModel):
    profile_id: str
    name: str
    pad_range_start: int = Field(0, ge=0, le=15)
    pad_range_end: int = Field(15, ge=0, le=15)
    curve: str = "linear"
    scan_time_ms: float = Field(1.2, ge=0.1, le=20.0)
    mask_time_ms: float = Field(8.0, ge=0.1, le=50.0)
    retrigger_cancel_ms: float = Field(18.0, ge=0.1, le=100.0)
    crosstalk_guard: float = Field(0.4, ge=0.0, le=1.0)
    velocity_floor: int = Field(1, ge=1, le=127)
    velocity_ceiling: int = Field(127, ge=1, le=127)


class BrainControllerAssignmentModel(BaseModel):
    source: str
    target: str
    mode: str = "absolute"
    enabled: bool = True


class BrainInputsStateModel(BaseModel):
    keyboard_zones: list[BrainKeyboardZoneModel] = Field(default_factory=list)
    trigger_profiles: list[BrainTriggerProfileModel] = Field(default_factory=list)
    controller_assignments: list[BrainControllerAssignmentModel] = Field(default_factory=list)


class BrainLibraryAssetModel(BaseModel):
    asset_id: str
    name: str
    asset_type: Literal["soundfont", "sfz", "sample", "kit", "patch"]
    source: str
    path: str = ""
    description: str = ""
    default_slot_mode: Literal["chromatic", "drum", "hybrid"] = "chromatic"
    tags: list[str] = Field(default_factory=list)


class BrainLibraryCollectionModel(BaseModel):
    collection_id: str
    label: str
    asset_count: int = Field(0, ge=0)
    assets: list[BrainLibraryAssetModel] = Field(default_factory=list)


class BrainLibraryStateModel(BaseModel):
    collections: list[BrainLibraryCollectionModel] = Field(default_factory=list)
    featured_assets: list[str] = Field(default_factory=list)
    last_scan_iso: str = ""


class BrainSampleEditorStateModel(BaseModel):
    slot_id: int = Field(0, ge=0, le=15)
    asset_path: str = ""
    waveform_available: bool = False
    duration_seconds: float = Field(0.0, ge=0.0)
    start_sample: int = Field(0, ge=0)
    end_sample: int = Field(0, ge=0)
    normalize_target: float = Field(0.99, gt=0.0, le=1.0)
    reverse_enabled: bool = True
    record_target_path: str = ""


class BrainSnapshotIntegrationModel(BaseModel):
    authority_model: Literal["snapshot-first"] = "snapshot-first"
    snapshot_id: int | None = None
    snapshot_name: str | None = None
    committed_state_id: str = "brain:committed:default"
    desired_state_id: str = "brain:desired:default"
    observed_state_id: str = "brain:observed:default"


class BrainDiagnosticsModel(BaseModel):
    sample_rate_hz: int = Field(48000, ge=8000)
    buffer_size_samples: int = Field(128, ge=16)
    cpu_load_percent: float = Field(8.5, ge=0.0, le=100.0)
    active_voices: int = Field(0, ge=0)
    peak_voices: int = Field(0, ge=0)
    polyphony_headroom: int = Field(96, ge=0)
    trigger_latency_ms: float = Field(2.2, ge=0.0)
    roundtrip_latency_ms: float = Field(5.3, ge=0.0)
    xruns: int = Field(0, ge=0)
    backend_mode: str = "hybrid"
    warnings: list[str] = Field(default_factory=list)
    last_import_source: str | None = None
    updated_at_iso: str = Field(default_factory=_utcnow_iso)


class BrainStateModel(BaseModel):
    instance_id: str
    product_name: str = "Performance Brain"
    set_name: str = "Init Performance Brain"
    active_slot: int = Field(0, ge=0, le=15)
    active_layer_id: str = "main-stack"
    active_section: Literal[
        "overview",
        "perform",
        "layers",
        "sequence",
        "routing",
        "inputs",
        "library",
        "diagnostics",
    ] = "overview"
    transport: BrainTransportStateModel = Field(default_factory=BrainTransportStateModel)
    slots: list[BrainSlotModel] = Field(default_factory=list, min_length=16, max_length=16)
    layers: list[BrainLayerModel] = Field(default_factory=list)
    sequence: BrainSequenceModel = Field(default_factory=BrainSequenceModel)
    song: BrainSongStateModel = Field(default_factory=BrainSongStateModel)
    mixer: BrainMixerStateModel = Field(default_factory=BrainMixerStateModel)
    inputs: BrainInputsStateModel = Field(default_factory=BrainInputsStateModel)
    library: BrainLibraryStateModel = Field(default_factory=BrainLibraryStateModel)
    sample_editor: BrainSampleEditorStateModel = Field(default_factory=BrainSampleEditorStateModel)
    diagnostics: BrainDiagnosticsModel = Field(default_factory=BrainDiagnosticsModel)
    snapshot_integration: BrainSnapshotIntegrationModel = Field(default_factory=BrainSnapshotIntegrationModel)


class BrainRuntimeScopeModel(BaseModel):
    runtime_instance_id: str
    instance_id: str | None = None
    plugin_position: int | None = Field(default=None, ge=0)


class BrainRuntimeEventModel(BaseModel):
    resource: BrainRuntimeResource
    scope: BrainRuntimeScopeModel
    state: BrainStateModel


class BrainStateUpdateModel(BaseModel):
    set_name: str | None = Field(default=None, min_length=1, max_length=160)
    active_slot: int | None = Field(default=None, ge=0, le=15)
    active_layer_id: str | None = Field(default=None, min_length=1, max_length=80)
    active_section: Literal[
        "overview",
        "perform",
        "layers",
        "sequence",
        "routing",
        "inputs",
        "library",
        "diagnostics",
    ] | None = None


class BrainTransportUpdateModel(BaseModel):
    is_playing: bool | None = None
    bpm: int | None = Field(default=None, ge=40, le=300)
    swing: int | None = Field(default=None, ge=0, le=100)
    pattern: int | None = Field(default=None, ge=0, le=127)
    variation: int | None = Field(default=None, ge=0, le=10)
    pending_pattern: int | None = Field(default=None, ge=-1, le=127)
    switch_quantization_beats: int | None = Field(default=None, ge=1, le=16)


class BrainSlotUpdateModel(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    mode: Literal["chromatic", "drum", "hybrid"] | None = None
    asset_type: Literal["soundfont", "sfz", "sample", "kit", "patch", "empty"] | None = None
    asset_path: str | None = Field(default=None, max_length=4096)
    source_label: str | None = Field(default=None, max_length=160)
    level: float | None = Field(default=None, ge=0.0, le=1.0)
    pan: float | None = Field(default=None, ge=-1.0, le=1.0)
    mute: bool | None = None
    solo: bool | None = None
    tune: float | None = Field(default=None, ge=-24.0, le=24.0)
    transpose: int | None = Field(default=None, ge=-36, le=36)
    output_bus: int | None = Field(default=None, ge=0, le=7)
    polyphony: int | None = Field(default=None, ge=1, le=128)
    midi_channel: int | None = Field(default=None, ge=0, le=16)
    trigger_note: int | None = Field(default=None, ge=0, le=127)
    trigger_notes: list[int] | None = None
    key_low: int | None = Field(default=None, ge=0, le=127)
    key_high: int | None = Field(default=None, ge=0, le=127)
    velocity_low: int | None = Field(default=None, ge=1, le=127)
    velocity_high: int | None = Field(default=None, ge=1, le=127)
    choke_group: int | None = Field(default=None, ge=0, le=15)
    articulation_group: str | None = Field(default=None, min_length=1, max_length=80)
    velocity_curve: str | None = Field(default=None, min_length=1, max_length=40)
    status: str | None = Field(default=None, min_length=1, max_length=80)


class BrainLayersUpdateModel(BaseModel):
    layers: list[BrainLayerModel] = Field(default_factory=list)


class BrainSequenceUpdateModel(BaseModel):
    sequence: BrainSequenceModel


class BrainSongUpdateModel(BaseModel):
    song: BrainSongStateModel


class BrainMixerUpdateModel(BaseModel):
    mixer: BrainMixerStateModel


class BrainInputsUpdateModel(BaseModel):
    inputs: BrainInputsStateModel


class BrainSampleEditorUpdateModel(BaseModel):
    slot_id: int = Field(..., ge=0, le=15)
    start_sample: int | None = Field(default=None, ge=0)
    end_sample: int | None = Field(default=None, ge=0)
    normalize_target: float | None = Field(default=None, gt=0.0, le=1.0)


class PerformanceBrainService(Singleton):
    def __init__(self, root_path: Path | None = None) -> None:
        super().__init__()
        self._root_path = Path(root_path) if root_path is not None else _DEFAULT_BRAIN_ROOT
        self._state_dir = self._root_path / _INSTANCE_DIR_NAME
        self._state_dir.mkdir(parents=True, exist_ok=True)
        self._instances: dict[str, BrainStateModel] = {}
        self._lock = threading.RLock()

    def _build_instance_key(
        self,
        instance_id: str | int | None = None,
        plugin_position: int | None = None,
    ) -> str:
        key_parts: list[str] = []
        if instance_id is not None:
            key_parts.append(f"instance-{instance_id}")
        if plugin_position is not None:
            key_parts.append(f"position-{plugin_position}")
        if not key_parts:
            key_parts.append("workspace-default")
        return _sanitize_key("__".join(key_parts))

    def resolve_runtime_instance_id(
        self,
        instance_id: str | int | None = None,
        plugin_position: int | None = None,
    ) -> str:
        return self._build_instance_key(instance_id, plugin_position)

    def _state_path_for_key(self, instance_key: str) -> Path:
        return self._state_dir / f"{_sanitize_key(instance_key)}.json"

    def _default_slots(self) -> list[BrainSlotModel]:
        slots: list[BrainSlotModel] = []
        for slot_id in range(16):
            if slot_id < 8:
                mode = "drum"
                name = [
                    "Kick",
                    "Snare",
                    "Closed Hat",
                    "Open Hat",
                    "Tom",
                    "Clap",
                    "Ride",
                    "Crash",
                ][slot_id]
                asset_type = "kit"
                articulation_group = "trigger"
                key_low = 36 + slot_id
                key_high = 36 + slot_id
            elif slot_id < 12:
                mode = "chromatic"
                name = f"Keys {slot_id - 7}"
                asset_type = "soundfont"
                articulation_group = "keyboard"
                key_low = 36
                key_high = 96
            else:
                mode = "hybrid"
                name = f"Layer {slot_id - 11}"
                asset_type = "sfz"
                articulation_group = "hybrid"
                key_low = 24
                key_high = 108

            trigger_note = 36 + slot_id
            slots.append(
                BrainSlotModel(
                    slot_id=slot_id,
                    name=name,
                    mode=mode,
                    asset_type=asset_type,
                    source_label="Factory seed",
                    output_bus=min(slot_id // 2, 7),
                    polyphony=24 if mode != "drum" else 8,
                    trigger_note=trigger_note,
                    trigger_notes=[trigger_note],
                    key_low=key_low,
                    key_high=key_high,
                    midi_channel=0 if mode == "drum" else min(slot_id + 1, 16),
                    articulation_group=articulation_group,
                    velocity_curve="linear" if mode != "drum" else "dynamic",
                )
            )
        return slots

    def _default_layers(self) -> list[BrainLayerModel]:
        return [
            BrainLayerModel(
                layer_id="main-stack",
                name="Main Stack",
                slot_indices=[8, 9, 12],
                key_low=36,
                key_high=96,
                scene_slot=0,
                purpose="keys",
            ),
            BrainLayerModel(
                layer_id="percussion-kit",
                name="Percussion Kit",
                slot_indices=list(range(8)),
                key_low=36,
                key_high=51,
                polyphony=48,
                scene_slot=1,
                purpose="drums",
            ),
            BrainLayerModel(
                layer_id="hybrid-split",
                name="Hybrid Split",
                slot_indices=[10, 11, 13, 14, 15],
                key_low=24,
                key_high=108,
                scene_slot=2,
                purpose="hybrid",
            ),
        ]

    def _default_sequence(self, slots: list[BrainSlotModel]) -> BrainSequenceModel:
        patterns = [
            BrainPatternSummaryModel(
                pattern_id=index,
                name=f"Pattern {index + 1}",
                length=16 if index < 8 else 32,
                active_lane_count=4 if index == 0 else 0,
                fill_enabled=index % 4 == 3,
                variation_count=10,
                summary="Operator seed pattern" if index == 0 else "",
            )
            for index in range(16)
        ]
        lanes = [
            BrainSequenceLaneSummaryModel(
                slot_id=slot.slot_id,
                name=slot.name,
                length=16 if slot.mode == "drum" else 32,
                swing=0 if slot.mode == "drum" else 8,
                active_steps=4 if slot.slot_id < 4 else 0,
                step_lock_targets=["volume", "pan"] if slot.slot_id < 2 else [],
            )
            for slot in slots
        ]
        return BrainSequenceModel(
            current_pattern=0,
            current_variation=0,
            patterns=patterns,
            lanes=lanes,
            fill_mode="manual+auto",
            song_entry_count=2,
        )

    def _default_song(self) -> BrainSongStateModel:
        return BrainSongStateModel(
            entries=[
                BrainSongEntryModel(pattern_id=0, variation=0, repeat_count=2, label="Intro"),
                BrainSongEntryModel(pattern_id=1, variation=1, repeat_count=4, label="Main"),
            ],
            loop=False,
        )

    def _default_mixer(self) -> BrainMixerStateModel:
        return BrainMixerStateModel(
            buses=[
                BrainMixerBusModel(
                    bus_id=bus_id,
                    name=f"Bus {bus_id + 1}",
                    output_pair=min(bus_id, 3),
                    reverb_send=0.12 if bus_id in {4, 5, 6, 7} else 0.0,
                )
                for bus_id in range(8)
            ],
            master=BrainMasterSectionModel(),
        )

    def _default_inputs(self) -> BrainInputsStateModel:
        return BrainInputsStateModel(
            keyboard_zones=[
                BrainKeyboardZoneModel(
                    zone_id="lower-manual",
                    name="Lower Manual",
                    midi_channel=1,
                    key_low=36,
                    key_high=72,
                    transpose=0,
                ),
                BrainKeyboardZoneModel(
                    zone_id="upper-manual",
                    name="Upper Manual",
                    midi_channel=2,
                    key_low=73,
                    key_high=108,
                    transpose=12,
                ),
            ],
            trigger_profiles=[
                BrainTriggerProfileModel(
                    profile_id="pads-a",
                    name="Pads A",
                    pad_range_start=0,
                    pad_range_end=7,
                    curve="dynamic",
                    scan_time_ms=1.1,
                    mask_time_ms=7.0,
                    retrigger_cancel_ms=16.0,
                    crosstalk_guard=0.35,
                ),
                BrainTriggerProfileModel(
                    profile_id="pads-b",
                    name="Pads B",
                    pad_range_start=8,
                    pad_range_end=15,
                    curve="expressive",
                    scan_time_ms=1.4,
                    mask_time_ms=8.5,
                    retrigger_cancel_ms=20.0,
                    crosstalk_guard=0.42,
                ),
            ],
            controller_assignments=[
                BrainControllerAssignmentModel(source="modwheel", target="layer:main-stack:blend"),
                BrainControllerAssignmentModel(source="aftertouch", target="slot:8:filter"),
                BrainControllerAssignmentModel(source="pedal_1", target="transport:start-stop"),
            ],
        )

    def _scan_soundfont_assets(self) -> list[BrainLibraryAssetModel]:
        soundfonts: list[BrainLibraryAssetModel] = []
        for root in (
            StoragePaths.get_soundfont_user_dir(),
            StoragePaths.get_soundfont_download_dir(),
        ):
            if not root.exists():
                continue
            for path in sorted(root.rglob("*")):
                if not path.is_file():
                    continue
                suffix = path.suffix.lower()
                if suffix not in {".sf2", ".sf3"}:
                    continue
                asset_id = f"soundfont:{path.name.lower()}"
                soundfonts.append(
                    BrainLibraryAssetModel(
                        asset_id=asset_id,
                        name=path.stem,
                        asset_type="soundfont",
                        source="local-soundfont-library",
                        path=str(path),
                        description="Installed SoundFont asset",
                        default_slot_mode="chromatic",
                        tags=["soundfont", suffix.lstrip(".")],
                    )
                )
        return soundfonts[:24]

    def _scan_sfz_assets(self) -> list[BrainLibraryAssetModel]:
        sfz_assets: list[BrainLibraryAssetModel] = []
        for root in (
            _PROJECT_ROOT / "data" / "drums" / "factory_kits",
            _DEFAULT_BRAIN_ROOT,
        ):
            if not root.exists():
                continue
            for path in sorted(root.rglob("*.sfz")):
                if not path.is_file():
                    continue
                sfz_assets.append(
                    BrainLibraryAssetModel(
                        asset_id=f"sfz:{path.stem.lower()}",
                        name=path.stem.replace("_", " ").title(),
                        asset_type="sfz",
                        source="factory-sfz" if str(path).startswith(str(_PROJECT_ROOT)) else "user-sfz",
                        path=str(path),
                        description="SFZ instrument/kit definition",
                        default_slot_mode="hybrid" if "layer" in path.stem.lower() else "drum",
                        tags=["sfz"],
                    )
                )
        return sfz_assets[:24]

    def _scan_sample_assets(self) -> list[BrainLibraryAssetModel]:
        sample_assets: list[BrainLibraryAssetModel] = []
        for root in (
            _PROJECT_ROOT / "data" / "drums",
            _DEFAULT_BRAIN_ROOT,
        ):
            if not root.exists():
                continue
            for path in sorted(root.rglob("*")):
                if not path.is_file():
                    continue
                suffix = path.suffix.lower()
                if suffix not in {".wav", ".aif", ".aiff", ".flac"}:
                    continue
                sample_assets.append(
                    BrainLibraryAssetModel(
                        asset_id=f"sample:{path.stem.lower()}",
                        name=path.stem.replace("_", " ").title(),
                        asset_type="sample",
                        source="factory-samples" if str(path).startswith(str(_PROJECT_ROOT)) else "user-samples",
                        path=str(path),
                        description="Sample asset",
                        default_slot_mode="drum",
                        tags=["sample", suffix.lstrip(".")],
                    )
                )
        return sample_assets[:24]

    def _scan_kit_assets(self) -> list[BrainLibraryAssetModel]:
        kits: list[BrainLibraryAssetModel] = []
        for kit in get_drum_kit_service().list_kits():
            kit_id = str(kit.get("kit_id") or "kit")
            kits.append(
                BrainLibraryAssetModel(
                    asset_id=f"kit:{kit_id}",
                    name=str(kit.get("name") or kit_id),
                    asset_type="kit",
                    source=str(kit.get("source") or "kits"),
                    path=str(kit.get("root_path") or ""),
                    description=str(kit.get("description") or "Drum kit"),
                    default_slot_mode="drum",
                    tags=["kit", str(kit.get("category") or "drums").lower()],
                )
            )
        return kits[:24]

    def _build_library_state(self) -> BrainLibraryStateModel:
        soundfonts = self._scan_soundfont_assets()
        sfz_assets = self._scan_sfz_assets()
        sample_assets = self._scan_sample_assets()
        kits = self._scan_kit_assets()
        collections = [
            BrainLibraryCollectionModel(
                collection_id="soundfonts",
                label="SoundFonts",
                asset_count=len(soundfonts),
                assets=soundfonts,
            ),
            BrainLibraryCollectionModel(
                collection_id="sfz",
                label="SFZ Instruments",
                asset_count=len(sfz_assets),
                assets=sfz_assets,
            ),
            BrainLibraryCollectionModel(
                collection_id="kits",
                label="Drum Kits",
                asset_count=len(kits),
                assets=kits,
            ),
            BrainLibraryCollectionModel(
                collection_id="samples",
                label="Samples",
                asset_count=len(sample_assets),
                assets=sample_assets,
            ),
        ]
        featured_assets = [
            asset.asset_id
            for asset in (kits[:2] + soundfonts[:2] + sfz_assets[:2] + sample_assets[:2])
        ]
        return BrainLibraryStateModel(
            collections=collections,
            featured_assets=featured_assets,
            last_scan_iso=_utcnow_iso(),
        )

    def _build_sample_editor_state(
        self,
        slot_id: int,
        slot: BrainSlotModel,
    ) -> BrainSampleEditorStateModel:
        waveform_available = False
        duration_seconds = 0.0
        end_sample = 0
        asset_path = slot.asset_path or ""
        if asset_path and asset_path.lower().endswith(".wav"):
            path = Path(asset_path)
            if path.exists():
                try:
                    with wave.open(str(path), "rb") as wav_file:
                        frames = wav_file.getnframes()
                        rate = wav_file.getframerate() or 1
                        waveform_available = True
                        duration_seconds = frames / float(rate)
                        end_sample = frames
                except wave.Error:
                    waveform_available = False
        return BrainSampleEditorStateModel(
            slot_id=slot_id,
            asset_path=asset_path,
            waveform_available=waveform_available,
            duration_seconds=duration_seconds,
            end_sample=end_sample,
            record_target_path=str(self._root_path / f"slot-{slot_id + 1}-capture.wav"),
        )

    def _default_state(self, instance_key: str) -> BrainStateModel:
        slots = self._default_slots()
        return BrainStateModel(
            instance_id=instance_key,
            slots=slots,
            layers=self._default_layers(),
            sequence=self._default_sequence(slots),
            song=self._default_song(),
            mixer=self._default_mixer(),
            inputs=self._default_inputs(),
            library=self._build_library_state(),
            sample_editor=self._build_sample_editor_state(0, slots[0]),
            diagnostics=BrainDiagnosticsModel(updated_at_iso=_utcnow_iso()),
            snapshot_integration=BrainSnapshotIntegrationModel(
                committed_state_id=f"brain:committed:{instance_key}",
                desired_state_id=f"brain:desired:{instance_key}",
                observed_state_id=f"brain:observed:{instance_key}",
            ),
        )

    def _load_instance(self, instance_key: str) -> BrainStateModel:
        if instance_key in self._instances:
            return self._instances[instance_key]

        path = self._state_path_for_key(instance_key)
        if path.exists():
            payload = json.loads(path.read_text())
            state = BrainStateModel.model_validate(payload)
        else:
            state = self._default_state(instance_key)
            self._persist_state(state)

        self._instances[instance_key] = state
        return state

    def _persist_state(self, state: BrainStateModel) -> None:
        path = self._state_path_for_key(state.instance_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(state.model_dump(mode="json"), indent=2, sort_keys=True))

    def _refresh_derived_state(self, state: BrainStateModel, slot_id: int | None = None) -> BrainStateModel:
        active_slot = state.active_slot if slot_id is None else slot_id
        active_slot = max(0, min(active_slot, len(state.slots) - 1))
        state.active_slot = active_slot
        state.sample_editor = self._build_sample_editor_state(active_slot, state.slots[active_slot])
        base_library = self._build_library_state()
        existing_library = state.library.model_copy(deep=True)
        base_collection_ids = {collection.collection_id for collection in base_library.collections}
        extra_collections = [
            collection.model_copy(deep=True)
            for collection in existing_library.collections
            if collection.collection_id not in base_collection_ids
        ]
        if extra_collections:
            # Preserve importer-owned library views such as SynthForge patch banks.
            base_library.collections.extend(extra_collections)
        merged_featured_assets: list[str] = []
        for asset_id in [*existing_library.featured_assets, *base_library.featured_assets]:
            if asset_id and asset_id not in merged_featured_assets:
                merged_featured_assets.append(asset_id)
        base_library.featured_assets = merged_featured_assets
        state.library = base_library
        state.sequence.song_entry_count = len(state.song.entries)
        state.diagnostics.updated_at_iso = _utcnow_iso()
        return state

    def get_state(
        self,
        instance_id: str | int | None = None,
        plugin_position: int | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            state = self._load_instance(self._build_instance_key(instance_id, plugin_position))
            self._refresh_derived_state(state)
            return state.model_dump()

    def replace_state(
        self,
        state: BrainStateModel | dict[str, Any],
        *,
        instance_id: str | int | None = None,
        plugin_position: int | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            runtime_instance_id = self._build_instance_key(instance_id, plugin_position)
            next_state = BrainStateModel.model_validate(state).model_copy(deep=True)
            next_state.instance_id = runtime_instance_id
            self._refresh_derived_state(next_state)
            self._persist_state(next_state)
            self._instances[runtime_instance_id] = next_state
            return next_state.model_dump()

    def reset_state(
        self,
        *,
        instance_id: str | int | None = None,
        plugin_position: int | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            runtime_instance_id = self._build_instance_key(instance_id, plugin_position)
            next_state = self._default_state(runtime_instance_id)
            self._refresh_derived_state(next_state)
            self._persist_state(next_state)
            self._instances[runtime_instance_id] = next_state
            return next_state.model_dump()

    def get_runtime_event(
        self,
        resource: BrainRuntimeResource,
        instance_id: str | int | None = None,
        plugin_position: int | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            state = self._load_instance(self._build_instance_key(instance_id, plugin_position))
            self._refresh_derived_state(state)
            return BrainRuntimeEventModel(
                resource=resource,
                scope=BrainRuntimeScopeModel(
                    runtime_instance_id=state.instance_id,
                    instance_id=None if instance_id is None else str(instance_id),
                    plugin_position=plugin_position,
                ),
                state=state,
            ).model_dump(mode="json")

    def update_state(
        self,
        patch: BrainStateUpdateModel,
        instance_id: str | int | None = None,
        plugin_position: int | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            state = self._load_instance(self._build_instance_key(instance_id, plugin_position))
            updates = patch.model_dump(exclude_none=True)
            for key, value in updates.items():
                setattr(state, key, value)
            self._refresh_derived_state(state)
            self._persist_state(state)
            return state.model_dump()

    def get_transport(self, instance_id: str | int | None = None, plugin_position: int | None = None) -> dict[str, Any]:
        with self._lock:
            state = self._load_instance(self._build_instance_key(instance_id, plugin_position))
            return state.transport.model_dump()

    def update_transport(
        self,
        patch: BrainTransportUpdateModel,
        instance_id: str | int | None = None,
        plugin_position: int | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            state = self._load_instance(self._build_instance_key(instance_id, plugin_position))
            for key, value in patch.model_dump(exclude_none=True).items():
                setattr(state.transport, key, value)
            state.sequence.current_pattern = state.transport.pattern
            state.sequence.current_variation = state.transport.variation
            self._refresh_derived_state(state)
            self._persist_state(state)
            return state.transport.model_dump()

    def get_slots(self, instance_id: str | int | None = None, plugin_position: int | None = None) -> list[dict[str, Any]]:
        with self._lock:
            state = self._load_instance(self._build_instance_key(instance_id, plugin_position))
            return [slot.model_dump() for slot in state.slots]

    def update_slot(
        self,
        slot_id: int,
        patch: BrainSlotUpdateModel,
        instance_id: str | int | None = None,
        plugin_position: int | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            state = self._load_instance(self._build_instance_key(instance_id, plugin_position))
            slot = state.slots[slot_id]
            for key, value in patch.model_dump(exclude_none=True).items():
                setattr(slot, key, value)
            self._refresh_derived_state(state, slot_id=slot_id)
            self._persist_state(state)
            return slot.model_dump()

    def get_layers(self, instance_id: str | int | None = None, plugin_position: int | None = None) -> dict[str, Any]:
        with self._lock:
            state = self._load_instance(self._build_instance_key(instance_id, plugin_position))
            return {"active_layer_id": state.active_layer_id, "layers": [layer.model_dump() for layer in state.layers]}

    def update_layers(
        self,
        patch: BrainLayersUpdateModel,
        instance_id: str | int | None = None,
        plugin_position: int | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            state = self._load_instance(self._build_instance_key(instance_id, plugin_position))
            state.layers = patch.layers
            self._refresh_derived_state(state)
            self._persist_state(state)
            return {"active_layer_id": state.active_layer_id, "layers": [layer.model_dump() for layer in state.layers]}

    def get_sequence(self, instance_id: str | int | None = None, plugin_position: int | None = None) -> dict[str, Any]:
        with self._lock:
            state = self._load_instance(self._build_instance_key(instance_id, plugin_position))
            return state.sequence.model_dump()

    def update_sequence(
        self,
        patch: BrainSequenceUpdateModel,
        instance_id: str | int | None = None,
        plugin_position: int | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            state = self._load_instance(self._build_instance_key(instance_id, plugin_position))
            state.sequence = patch.sequence
            state.transport.pattern = state.sequence.current_pattern
            state.transport.variation = state.sequence.current_variation
            self._refresh_derived_state(state)
            self._persist_state(state)
            return state.sequence.model_dump()

    def get_song(self, instance_id: str | int | None = None, plugin_position: int | None = None) -> dict[str, Any]:
        with self._lock:
            state = self._load_instance(self._build_instance_key(instance_id, plugin_position))
            return state.song.model_dump()

    def update_song(
        self,
        patch: BrainSongUpdateModel,
        instance_id: str | int | None = None,
        plugin_position: int | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            state = self._load_instance(self._build_instance_key(instance_id, plugin_position))
            state.song = patch.song
            self._refresh_derived_state(state)
            self._persist_state(state)
            return state.song.model_dump()

    def get_mixer(self, instance_id: str | int | None = None, plugin_position: int | None = None) -> dict[str, Any]:
        with self._lock:
            state = self._load_instance(self._build_instance_key(instance_id, plugin_position))
            return state.mixer.model_dump()

    def update_mixer(
        self,
        patch: BrainMixerUpdateModel,
        instance_id: str | int | None = None,
        plugin_position: int | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            state = self._load_instance(self._build_instance_key(instance_id, plugin_position))
            state.mixer = patch.mixer
            self._refresh_derived_state(state)
            self._persist_state(state)
            return state.mixer.model_dump()

    def get_inputs(self, instance_id: str | int | None = None, plugin_position: int | None = None) -> dict[str, Any]:
        with self._lock:
            state = self._load_instance(self._build_instance_key(instance_id, plugin_position))
            return state.inputs.model_dump()

    def update_inputs(
        self,
        patch: BrainInputsUpdateModel,
        instance_id: str | int | None = None,
        plugin_position: int | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            state = self._load_instance(self._build_instance_key(instance_id, plugin_position))
            state.inputs = patch.inputs
            self._refresh_derived_state(state)
            self._persist_state(state)
            return state.inputs.model_dump()

    def get_library(self, instance_id: str | int | None = None, plugin_position: int | None = None) -> dict[str, Any]:
        with self._lock:
            state = self._load_instance(self._build_instance_key(instance_id, plugin_position))
            state.library = self._build_library_state()
            self._persist_state(state)
            return state.library.model_dump()

    def get_sample_editor(
        self,
        instance_id: str | int | None = None,
        plugin_position: int | None = None,
        slot_id: int | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            state = self._load_instance(self._build_instance_key(instance_id, plugin_position))
            target_slot = state.active_slot if slot_id is None else slot_id
            self._refresh_derived_state(state, slot_id=target_slot)
            return state.sample_editor.model_dump()

    def update_sample_editor(
        self,
        patch: BrainSampleEditorUpdateModel,
        instance_id: str | int | None = None,
        plugin_position: int | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            state = self._load_instance(self._build_instance_key(instance_id, plugin_position))
            self._refresh_derived_state(state, slot_id=patch.slot_id)
            for key, value in patch.model_dump(exclude_none=True).items():
                setattr(state.sample_editor, key, value)
            self._persist_state(state)
            return state.sample_editor.model_dump()

    def get_diagnostics(self, instance_id: str | int | None = None, plugin_position: int | None = None) -> dict[str, Any]:
        with self._lock:
            state = self._load_instance(self._build_instance_key(instance_id, plugin_position))
            self._refresh_derived_state(state)
            return state.diagnostics.model_dump()

    @staticmethod
    def _drum_step_is_active(step: dict[str, Any]) -> bool:
        return any(
            (
                int(step.get("velocity", 0)) > 0,
                bool(step.get("accent", False)),
                int(step.get("micro_timing", 0)) != 0,
                float(step.get("probability", 1.0)) != 1.0,
                int(step.get("ratchet_count", 1)) > 1,
                int(step.get("ratchet_decay", 0)) > 0,
                step.get("lock_pitch") is not None,
                step.get("lock_filter_cutoff") is not None,
                step.get("lock_decay") is not None,
                step.get("lock_pan") is not None,
                step.get("lock_volume") is not None,
            )
        )

    @staticmethod
    def _drum_step_lock_targets(steps: list[dict[str, Any]]) -> list[str]:
        targets: set[str] = set()
        for step in steps:
            if step.get("lock_pitch") is not None:
                targets.add("pitch")
            if step.get("lock_filter_cutoff") is not None:
                targets.add("filter")
            if step.get("lock_decay") is not None:
                targets.add("decay")
            if step.get("lock_pan") is not None:
                targets.add("pan")
            if step.get("lock_volume") is not None:
                targets.add("volume")
        return sorted(targets)

    def _build_drum_import_sequence(
        self,
        *,
        slots: list[BrainSlotModel],
        patterns: list[dict[str, Any]],
        current_pattern: int,
        current_variation: int,
        track_swing: list[int],
    ) -> BrainSequenceModel:
        pattern_summaries: list[BrainPatternSummaryModel] = []
        active_pattern = None
        for pattern in sorted(patterns, key=lambda payload: int(payload.get("pattern_id", 0))):
            pattern_id = int(pattern.get("pattern_id", 0))
            length = max(1, min(64, int(pattern.get("length", 16))))
            rows = list(pattern.get("steps", []))
            track_lengths = list(pattern.get("track_lengths", [0] * 16))
            active_lane_count = 0
            active_steps_total = 0
            lock_targets: set[str] = set()
            fill_enabled = False

            for slot_id in range(min(len(slots), len(rows), 16)):
                row = list(rows[slot_id] or [])
                lane_length = max(1, min(64, int(track_lengths[slot_id] or length))) if slot_id < len(track_lengths) else length
                visible_steps = row[:lane_length]
                lane_active_steps = sum(1 for step in visible_steps if self._drum_step_is_active(step))
                if lane_active_steps > 0 or (slot_id < len(track_lengths) and int(track_lengths[slot_id] or 0) > 0):
                    active_lane_count += 1
                    active_steps_total += lane_active_steps
                lock_targets.update(self._drum_step_lock_targets(visible_steps))
                if any(int(step.get("ratchet_count", 1)) > 1 for step in visible_steps):
                    fill_enabled = True

            summary_parts: list[str] = []
            if active_lane_count > 0:
                summary_parts.append(f"{active_lane_count} lanes")
            if active_steps_total > 0:
                summary_parts.append(f"{active_steps_total} active steps")
            if lock_targets:
                summary_parts.append(f"locks: {', '.join(sorted(lock_targets))}")

            pattern_summaries.append(
                BrainPatternSummaryModel(
                    pattern_id=pattern_id,
                    name=f"Pattern {pattern_id + 1}",
                    length=length,
                    active_lane_count=active_lane_count,
                    fill_enabled=fill_enabled,
                    variation_count=max(1, current_variation + 1),
                    summary=" · ".join(summary_parts),
                )
            )
            if pattern_id == current_pattern:
                active_pattern = pattern

        lane_summaries: list[BrainSequenceLaneSummaryModel] = []
        if active_pattern is not None:
            rows = list(active_pattern.get("steps", []))
            track_lengths = list(active_pattern.get("track_lengths", [0] * 16))
            length = max(1, min(64, int(active_pattern.get("length", 16))))
            for slot in slots:
                row = list(rows[slot.slot_id] or []) if slot.slot_id < len(rows) else []
                lane_length = max(1, min(64, int(track_lengths[slot.slot_id] or length))) if slot.slot_id < len(track_lengths) else length
                visible_steps = row[:lane_length]
                lane_summaries.append(
                    BrainSequenceLaneSummaryModel(
                        slot_id=slot.slot_id,
                        name=slot.name,
                        length=lane_length,
                        swing=int(track_swing[slot.slot_id]) if slot.slot_id < len(track_swing) else 0,
                        active_steps=sum(1 for step in visible_steps if self._drum_step_is_active(step)),
                        step_lock_targets=self._drum_step_lock_targets(visible_steps),
                    )
                )

        if not lane_summaries:
            lane_summaries = [
                BrainSequenceLaneSummaryModel(
                    slot_id=slot.slot_id,
                    name=slot.name,
                    length=16,
                    swing=int(track_swing[slot.slot_id]) if slot.slot_id < len(track_swing) else 0,
                    active_steps=0,
                    step_lock_targets=[],
                )
                for slot in slots
            ]

        return BrainSequenceModel(
            pattern_bank_size=128,
            max_steps=64,
            current_pattern=current_pattern,
            current_variation=current_variation,
            patterns=pattern_summaries,
            lanes=lane_summaries,
            fill_mode="legacy-drum-import",
            song_entry_count=0,
        )

    def import_from_drums(
        self,
        *,
        drum_state: dict[str, Any],
        pad_controls: list[dict[str, Any]],
        bus_mixers: list[dict[str, Any]],
        master_fx: dict[str, Any],
        midi_mapping: dict[str, Any],
        velocity_curves: dict[str, Any],
        zones: dict[str, Any],
        active_kit: dict[str, Any] | None,
        song: list[dict[str, Any]],
        song_loop: bool,
        song_transport: dict[str, Any] | None = None,
        midi_output_config: dict[str, Any] | None = None,
        patterns: list[dict[str, Any]] | None = None,
        instance_id: str | int | None = None,
        plugin_position: int | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            state = self._load_instance(self._build_instance_key(instance_id, plugin_position))
            kit_instruments = (active_kit or {}).get("instruments") or []
            mapped_pads = {int(item.get("pad") or -1): item for item in midi_mapping.get("pads", [])}
            curve_lookup = {int(item.get("pad") or -1): item for item in velocity_curves.get("pads", [])}
            zone_lookup = {int(item.get("pad") or -1): item.get("zones", []) for item in zones.get("pads", [])}
            source_modes = list(drum_state.get("pad_sound_sources", ["sample"] * 16))
            synth_params = list(drum_state.get("pad_synth_params", [{}] * 16))
            pad_filters = list(drum_state.get("pad_filters", [{}] * 16))
            cv_gate_configs = list(drum_state.get("pad_cv_gate_configs", [{}] * 16))
            imported_kit_name = str((active_kit or {}).get("name") or "Drum Machine Import")
            midi_output_config = midi_output_config or {}
            song_transport = song_transport or {}
            track_swing = [int(value) for value in drum_state.get("track_swing", [0] * 16)]

            for slot_id in range(min(16, len(state.slots))):
                slot = state.slots[slot_id]
                control = pad_controls[slot_id] if slot_id < len(pad_controls) else {}
                instrument = kit_instruments[slot_id] if slot_id < len(kit_instruments) else {}
                mapping = mapped_pads.get(slot_id, {})
                curve = curve_lookup.get(slot_id, {})
                source_mode = str(source_modes[slot_id]) if slot_id < len(source_modes) else "sample"
                synth = synth_params[slot_id] if slot_id < len(synth_params) else {}
                filter_config = pad_filters[slot_id] if slot_id < len(pad_filters) else {}
                cv_gate = cv_gate_configs[slot_id] if slot_id < len(cv_gate_configs) else {}
                slot.mode = {
                    "sample": "drum",
                    "synth": "hybrid",
                    "hybrid": "hybrid",
                }.get(source_mode, "drum")
                slot.asset_type = "kit"
                slot.name = str(instrument.get("name") or slot.name)
                slot.asset_path = str(instrument.get("sfz_path") or "")
                slot.source_label = f"{imported_kit_name} · {source_mode}"
                slot.level = float(control.get("volume", 100.0)) / 100.0
                slot.pan = float(control.get("pan", 0.0)) / 100.0
                slot.tune = float(control.get("tune", 0.0))
                slot.mute = bool(control.get("mute", False))
                slot.solo = bool(control.get("solo", False))
                slot.output_bus = int(control.get("bus_assignment", slot.output_bus))
                notes = [int(note) for note in mapping.get("notes", [36 + slot_id])]
                slot.trigger_notes = notes or [36 + slot_id]
                slot.trigger_note = slot.trigger_notes[0]
                slot.midi_channel = int(mapping.get("midi_channel", 0))
                slot.velocity_curve = str(curve.get("curve_type", "dynamic"))
                slot.articulation_group = str(filter_config.get("type") or ("synth" if source_mode != "sample" else "main"))
                pad_zones = zone_lookup.get(slot_id, [])
                if pad_zones:
                    first_zone = pad_zones[0]
                    trigger_note = int(first_zone.get("trigger_note", slot.trigger_note))
                    zone_notes = [int(zone.get("trigger_note", trigger_note)) for zone in pad_zones if zone.get("trigger_note") is not None]
                    slot.trigger_note = trigger_note
                    slot.trigger_notes = zone_notes or [trigger_note]
                if slot.mode == "hybrid":
                    slot.polyphony = max(8, int(float(synth.get("tone_amount", 0.0)) * 32) or slot.polyphony)
                if bool(cv_gate.get("enabled", False)):
                    slot.output_bus = int(cv_gate.get("output_pair", slot.output_bus))
                slot.status = f"imported-drums:{source_mode}"

            state.transport.is_playing = bool(drum_state.get("transport", False))
            state.transport.bpm = int(drum_state.get("bpm", 120))
            state.transport.swing = int(drum_state.get("swing", 0))
            state.transport.pattern = int(drum_state.get("pattern", 0))
            state.transport.variation = int(drum_state.get("variation", 0))
            state.transport.pending_pattern = int(song_transport.get("pending_pattern", state.transport.pending_pattern))
            state.transport.switch_quantization_beats = int(
                song_transport.get("switch_quantization_beats", state.transport.switch_quantization_beats)
            )
            state.sequence = self._build_drum_import_sequence(
                slots=state.slots,
                patterns=list(patterns or []),
                current_pattern=state.transport.pattern,
                current_variation=state.transport.variation,
                track_swing=track_swing,
            )
            state.song = BrainSongStateModel(
                entries=[
                    BrainSongEntryModel(
                        pattern_id=int(entry.get("pattern_id", entry.get("pattern", 0))),
                        repeat_count=int(entry.get("repeat_count", 1)),
                        label=f"Pattern {int(entry.get('pattern_id', entry.get('pattern', 0))) + 1}",
                    )
                    for entry in song
                ],
                loop=bool(song_loop),
            )
            state.mixer = BrainMixerStateModel(
                buses=[
                    BrainMixerBusModel(
                        bus_id=int(bus.get("bus_id", index)),
                        name=str(bus.get("name", f"Bus {index + 1}")),
                        level=float(bus.get("level", 100.0)) / 100.0,
                        pan=float(bus.get("pan", 0.0)) / 100.0,
                        mute=bool(bus.get("mute", False)),
                        solo=bool(bus.get("solo", False)),
                        output_pair=int(bus.get("output_pair", 0)),
                        reverb_send=float(bus.get("reverb_send", 0.0)) / 100.0,
                    )
                    for index, bus in enumerate(bus_mixers[:8])
                ],
                master=BrainMasterSectionModel(
                    master_volume=float(drum_state.get("volume", 80)) / 100.0,
                    drive_db=float(master_fx.get("drive_db", 0.0)),
                    compressor_amount=min(1.0, float(master_fx.get("compressor_ratio", 2.0)) / 10.0),
                    reverb_mix=float(master_fx.get("reverb_mix", 0.18)),
                    limiter_ceiling_db=float(master_fx.get("limiter_threshold", -0.5)),
                ),
            )
            imported_note_assignments = [
                BrainControllerAssignmentModel(
                    source=f"note:{slot.trigger_note}",
                    target=f"slot:{slot.slot_id}:trigger",
                    mode="note",
                    enabled=True,
                )
                for slot in state.slots
            ]
            if bool(midi_output_config.get("midi_output_enabled", False)):
                imported_note_assignments.append(
                    BrainControllerAssignmentModel(
                        source=f"legacy:drums:midi-out:{int(midi_output_config.get('midi_output_channel', 9)) + 1}",
                        target="transport:midi-output",
                        mode="legacy",
                        enabled=True,
                    )
                )
            if bool(midi_output_config.get("midi_clock_output_enabled", False)):
                imported_note_assignments.append(
                    BrainControllerAssignmentModel(
                        source="legacy:drums:midi-clock",
                        target="transport:midi-clock",
                        mode="legacy",
                        enabled=True,
                    )
                )
            if bool(midi_output_config.get("program_change_enabled", False)):
                imported_note_assignments.append(
                    BrainControllerAssignmentModel(
                        source="legacy:drums:program-change",
                        target="transport:program-change",
                        mode="legacy",
                        enabled=True,
                    )
                )
            state.inputs.trigger_profiles = [
                BrainTriggerProfileModel(
                    profile_id="imported-drum-pads-a",
                    name="Imported Pads A",
                    pad_range_start=0,
                    pad_range_end=7,
                    curve="dynamic",
                    scan_time_ms=1.1,
                    mask_time_ms=7.0,
                    retrigger_cancel_ms=18.0,
                    crosstalk_guard=0.35,
                ),
                BrainTriggerProfileModel(
                    profile_id="imported-drum-pads-b",
                    name="Imported Pads B",
                    pad_range_start=8,
                    pad_range_end=15,
                    curve="dynamic",
                    scan_time_ms=1.2,
                    mask_time_ms=8.0,
                    retrigger_cancel_ms=18.0,
                    crosstalk_guard=0.4,
                ),
            ]
            state.inputs.controller_assignments = imported_note_assignments
            state.layers = [
                BrainLayerModel(
                    layer_id="drum-kit-import",
                    name=imported_kit_name,
                    slot_indices=[slot.slot_id for slot in state.slots],
                    key_low=min(slot.trigger_note for slot in state.slots),
                    key_high=max(slot.trigger_note for slot in state.slots),
                    velocity_low=1,
                    velocity_high=127,
                    polyphony=sum(max(1, slot.polyphony) for slot in state.slots),
                    scene_slot=0,
                    enabled=True,
                    purpose="drum-import",
                )
            ]
            state.set_name = f"{imported_kit_name} Brain Import"
            state.active_layer_id = "drum-kit-import"
            state.diagnostics.last_import_source = "drums"
            state.diagnostics.active_voices = 8
            state.diagnostics.peak_voices = 16
            state.diagnostics.warnings = []
            if bool(midi_output_config.get("midi_clock_output_enabled", False)):
                state.diagnostics.warnings.append("Imported Drum Machine MIDI clock output remains a legacy transport feature.")
            if bool(midi_output_config.get("program_change_enabled", False)):
                state.diagnostics.warnings.append("Imported Drum Machine program-change output remains a legacy transport feature.")
            hybrid_slots = [str(slot.slot_id + 1) for slot in state.slots if slot.mode == "hybrid"]
            if hybrid_slots:
                state.diagnostics.warnings.append(
                    f"Pads {', '.join(hybrid_slots[:6])} import hybrid Drum Machine sources into Brain slot state."
                )
            cv_gate_slots = [
                str(index + 1)
                for index, config in enumerate(cv_gate_configs[:16])
                if bool(config.get("enabled", False))
            ]
            if cv_gate_slots:
                state.diagnostics.warnings.append(
                    f"Pads {', '.join(cv_gate_slots[:6])} retain legacy CV/gate output assignments from Drum Machine."
                )
            self._refresh_derived_state(state)
            self._persist_state(state)
            return state.model_dump()

    def import_from_synthforge(
        self,
        *,
        parts: list[dict[str, Any]],
        sample_statuses: list[dict[str, Any]],
        parameters: list[dict[str, Any]],
        voice_metrics: dict[str, Any],
        performance_configs: list[dict[str, Any]] | None = None,
        sampler_backends: list[str] | None = None,
        streaming_configs: list[dict[str, Any]] | None = None,
        hot_reload_statuses: list[dict[str, Any]] | None = None,
        scala_tunings: list[dict[str, Any]] | None = None,
        mpe_configs: list[dict[str, Any]] | None = None,
        mod_matrix_routes: list[list[dict[str, Any]]] | None = None,
        backend_statuses: list[dict[str, Any]] | None = None,
        patches: list[dict[str, Any]] | None = None,
        instance_id: str | int | None = None,
        plugin_position: int | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            state = self._load_instance(self._build_instance_key(instance_id, plugin_position))
            performance_configs = performance_configs or [{} for _ in range(len(parts))]
            sampler_backends = sampler_backends or ["native" for _ in range(len(parts))]
            streaming_configs = streaming_configs or [{} for _ in range(len(parts))]
            hot_reload_statuses = hot_reload_statuses or [{} for _ in range(len(parts))]
            scala_tunings = scala_tunings or [{} for _ in range(len(parts))]
            mpe_configs = mpe_configs or [{} for _ in range(len(parts))]
            mod_matrix_routes = mod_matrix_routes or [[] for _ in range(len(parts))]
            backend_statuses = backend_statuses or [{} for _ in range(len(parts))]
            patches = patches or []

            patch_lookup = {
                (int(patch.get("bank", 0)), int(patch.get("program", 0))): patch
                for patch in patches
            }
            active_slot_indices: list[int] = []
            keyboard_zones: list[BrainKeyboardZoneModel] = []
            controller_assignments: list[BrainControllerAssignmentModel] = []
            warnings: list[str] = []
            unique_backends: set[str] = set()
            total_voice_budget = 128

            def _output_bus_index(value: str) -> int:
                normalized = str(value or "main").strip().lower()
                if normalized in {"main", "main_out"}:
                    return 0
                if normalized.startswith("aux_"):
                    suffix = normalized.split("_", 1)[1]
                    if suffix.isdigit():
                        return max(0, min(7, int(suffix)))
                return 0

            voices_per_part = voice_metrics.get("voices_per_part", [0] * 16)
            for slot_id, part in enumerate(parts[:16]):
                slot = state.slots[slot_id]
                sample_status = sample_statuses[slot_id] if slot_id < len(sample_statuses) else {}
                params = parameters[slot_id] if slot_id < len(parameters) else {}
                performance = performance_configs[slot_id] if slot_id < len(performance_configs) else {}
                backend = str(sampler_backends[slot_id] if slot_id < len(sampler_backends) else "native")
                streaming = streaming_configs[slot_id] if slot_id < len(streaming_configs) else {}
                hot_reload = hot_reload_statuses[slot_id] if slot_id < len(hot_reload_statuses) else {}
                scala = scala_tunings[slot_id] if slot_id < len(scala_tunings) else {}
                mpe = mpe_configs[slot_id] if slot_id < len(mpe_configs) else {}
                routes = mod_matrix_routes[slot_id] if slot_id < len(mod_matrix_routes) else []
                backend_status = backend_statuses[slot_id] if slot_id < len(backend_statuses) else {}
                asset_path = str(sample_status.get("soundfont_path") or sample_status.get("sfz_path") or "")
                asset_type = "soundfont" if sample_status.get("soundfont_path") else "sfz"
                if not sample_status.get("loaded"):
                    asset_type = "empty"
                patch = patch_lookup.get(
                    (
                        int(sample_status.get("active_bank", 0)),
                        int(sample_status.get("active_program", 0)),
                    )
                )
                slot.mode = "hybrid" if sample_status.get("sampler_mode") or bool(mpe.get("enabled", False)) else "chromatic"
                slot.asset_type = asset_type
                slot.asset_path = asset_path
                slot.name = str(sample_status.get("active_preset_name") or (patch or {}).get("name") or f"Part {slot_id + 1}")
                slot.source_label = " · ".join(
                    part
                    for part in (
                        backend,
                        str((patch or {}).get("category") or sample_status.get("engine") or "SynthForge import"),
                    )
                    if part
                )
                slot.level = float(part.get("level", 1.0))
                slot.pan = float(part.get("pan", 0.0))
                slot.mute = bool(part.get("mute", False))
                slot.solo = bool(part.get("solo", False))
                slot.midi_channel = int(part.get("midi_channel", 0))
                slot.output_bus = _output_bus_index(str(part.get("output_bus", "main")))
                slot.transpose = int(performance.get("master_transpose", params.get("global.transpose", 0)))
                slot.polyphony = max(
                    8,
                    min(
                        int(streaming.get("max_voices", 64)),
                        int(voices_per_part[slot_id] or 0) + 8,
                    ),
                )
                slot.velocity_curve = "mpe" if bool(mpe.get("enabled", False)) else (
                    "legato" if bool(performance.get("legato", False)) else "linear"
                )
                slot.articulation_group = (
                    "mono-legato"
                    if bool(performance.get("mono_mode", False)) and bool(performance.get("legato", False))
                    else ("mono" if bool(performance.get("mono_mode", False)) else "main")
                )
                slot.status = (
                    f"imported-synthforge:{backend}:hot-reload"
                    if bool(hot_reload.get("enabled", False))
                    else f"imported-synthforge:{backend}"
                )
                if slot.mode == "chromatic":
                    slot.key_low = 24
                    slot.key_high = 108
                if asset_type != "empty":
                    active_slot_indices.append(slot_id)
                unique_backends.add(backend)
                total_voice_budget += int(streaming.get("max_voices", 0) or 0)
                keyboard_zones.append(
                    BrainKeyboardZoneModel(
                        zone_id=f"synthforge-part-{slot_id + 1}",
                        name=slot.name,
                        midi_channel=max(1, int(part.get("midi_channel", slot_id + 1) or slot_id + 1)),
                        key_low=0 if bool(mpe.get("enabled", False)) else slot.key_low,
                        key_high=127 if bool(mpe.get("enabled", False)) else slot.key_high,
                        transpose=slot.transpose,
                        enabled=asset_type != "empty",
                        aftertouch_mode="poly" if bool(mpe.get("enabled", False)) else "channel",
                    )
                )
                for route in routes:
                    controller_assignments.append(
                        BrainControllerAssignmentModel(
                            source=f"part:{slot_id + 1}:{route.get('source', 'mod')}",
                            target=f"slot:{slot_id}:{route.get('destination', 'parameter')}",
                            mode="mod-matrix",
                            enabled=bool(route.get("enabled", True)),
                        )
                    )
                if bool(scala.get("enabled", False)):
                    warnings.append(f"Part {slot_id + 1} uses Scala tuning from {scala.get('scala_path', '')}.")
                if hot_reload.get("last_error"):
                    warnings.append(f"Part {slot_id + 1} hot reload reports: {hot_reload.get('last_error')}")
                unsupported_opcodes = list(backend_status.get("unsupported_opcodes", []) or [])
                if unsupported_opcodes:
                    warnings.append(
                        f"Part {slot_id + 1} backend {backend} reports unsupported opcodes: {', '.join(unsupported_opcodes[:4])}."
                    )
                unknown_opcodes = list(backend_status.get("unknown_opcodes", []) or [])
                if unknown_opcodes:
                    warnings.append(
                        f"Part {slot_id + 1} backend {backend} reports unknown opcodes: {', '.join(unknown_opcodes[:4])}."
                    )

            state.layers = [
                BrainLayerModel(
                    layer_id="synthforge-multi",
                    name="SynthForge Multi",
                    slot_indices=active_slot_indices,
                    key_low=min((zone.key_low for zone in keyboard_zones if zone.enabled), default=24),
                    key_high=max((zone.key_high for zone in keyboard_zones if zone.enabled), default=108),
                    polyphony=96,
                    scene_slot=0,
                    purpose="synthforge-import",
                )
            ] or state.layers
            state.set_name = (
                f"{state.slots[active_slot_indices[0]].name} Multi Import"
                if active_slot_indices
                else "SynthForge Multi Import"
            )
            state.active_layer_id = "synthforge-multi"
            state.inputs.keyboard_zones = keyboard_zones
            state.inputs.trigger_profiles = []
            state.inputs.controller_assignments = controller_assignments
            patch_assets = [
                BrainLibraryAssetModel(
                    asset_id=f"patch:{int(patch.get('bank', 0))}:{int(patch.get('program', 0))}",
                    name=str(patch.get("name") or f"Patch {index + 1}"),
                    asset_type="patch",
                    source=f"synthforge:{str(patch.get('category') or 'patch').lower()}",
                    path=f"bank:{int(patch.get('bank', 0))}/program:{int(patch.get('program', 0))}",
                    description=str(patch.get("description") or ""),
                    default_slot_mode="chromatic",
                    tags=[
                        "patch",
                        str(patch.get("category") or "uncategorized").lower(),
                    ],
                )
                for index, patch in enumerate(patches[:24])
            ]
            library_state = self._build_library_state()
            if patch_assets:
                library_state.collections.append(
                    BrainLibraryCollectionModel(
                        collection_id="synthforge-patches",
                        label="SynthForge Patches",
                        asset_count=len(patch_assets),
                        assets=patch_assets,
                    )
                )
                library_state.featured_assets = [asset.asset_id for asset in patch_assets[:4]] + library_state.featured_assets
            state.library = library_state
            state.diagnostics.active_voices = int(voice_metrics.get("active_voices", 0))
            state.diagnostics.peak_voices = int(voice_metrics.get("peak_voices", 0))
            state.diagnostics.polyphony_headroom = max(0, total_voice_budget - state.diagnostics.peak_voices)
            state.diagnostics.backend_mode = (
                f"synthforge:{sorted(unique_backends)[0]}"
                if len(unique_backends) == 1
                else f"synthforge:mixed({', '.join(sorted(unique_backends))})"
            )
            state.diagnostics.warnings = list(dict.fromkeys(warnings))
            state.diagnostics.last_import_source = "synthforge"
            self._refresh_derived_state(state)
            self._persist_state(state)
            return state.model_dump()


def get_performance_brain_service() -> PerformanceBrainService:
    return PerformanceBrainService.get_instance()
