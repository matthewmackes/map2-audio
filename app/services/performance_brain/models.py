"""Performance Brain model definitions."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field


BRAIN_SECTION_IDS = (
    "overview",
    "perform",
    "layers",
    "sequence",
    "routing",
    "inputs",
    "library",
    "session_media",
    "practice_coach",
    "diagnostics",
)


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


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


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
    # T2461-A9 — snapshot of `profile_key`s connected to the bench at
    # save time (from /api/devices/snapshot-keys). Empty list when the
    # asset wasn't saved with hardware attached. Library detail row
    # surfaces these as device-pin Tags + a "Used in N Brain entries"
    # reverse-link on the matching Hardware Store cards.
    authored_with_devices: list[str] = Field(default_factory=list)


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


class BrainKeyboardQualificationModel(BaseModel):
    ready: bool = False
    zone_count: int = Field(0, ge=0)
    channel_count: int = Field(0, ge=0)
    chromatic_slot_count: int = Field(0, ge=0)
    polyphony_capacity: int = Field(0, ge=0)
    max_key_span: int = Field(0, ge=0)
    aftertouch_modes: list[str] = Field(default_factory=list)
    summary: str = ""
    issues: list[str] = Field(default_factory=list)


class BrainTriggerQualificationModel(BaseModel):
    ready: bool = False
    profile_count: int = Field(0, ge=0)
    covered_pad_count: int = Field(0, ge=0, le=16)
    trigger_slot_count: int = Field(0, ge=0, le=16)
    unique_trigger_notes: int = Field(0, ge=0)
    fastest_scan_time_ms: float = Field(0.0, ge=0.0)
    widest_mask_time_ms: float = Field(0.0, ge=0.0)
    summary: str = ""
    issues: list[str] = Field(default_factory=list)


class BrainSequenceQualificationModel(BaseModel):
    ready: bool = False
    pattern_count: int = Field(0, ge=0)
    populated_pattern_count: int = Field(0, ge=0)
    active_lane_count: int = Field(0, ge=0)
    max_pattern_length: int = Field(0, ge=0)
    swing_lane_count: int = Field(0, ge=0)
    song_entry_count: int = Field(0, ge=0)
    summary: str = ""
    issues: list[str] = Field(default_factory=list)


class BrainRoutingQualificationModel(BaseModel):
    ready: bool = False
    used_bus_count: int = Field(0, ge=0, le=8)
    output_pair_count: int = Field(0, ge=0)
    reverb_bus_count: int = Field(0, ge=0, le=8)
    controller_assignment_count: int = Field(0, ge=0)
    summary: str = ""
    issues: list[str] = Field(default_factory=list)


class BrainControllerQualificationModel(BaseModel):
    scoped_instance_key: str = "workspace-default"
    scope_binding_ready: bool = True
    tier_a_runtime_locked: bool = True
    controller_ready: bool = False
    ready_surface_count: int = Field(0, ge=0, le=4)
    keyboard: BrainKeyboardQualificationModel = Field(default_factory=BrainKeyboardQualificationModel)
    triggers: BrainTriggerQualificationModel = Field(default_factory=BrainTriggerQualificationModel)
    sequence: BrainSequenceQualificationModel = Field(default_factory=BrainSequenceQualificationModel)
    routing: BrainRoutingQualificationModel = Field(default_factory=BrainRoutingQualificationModel)
    summary: str = ""
    issues: list[str] = Field(default_factory=list)


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
    controller_qualification: BrainControllerQualificationModel = Field(default_factory=BrainControllerQualificationModel)
    updated_at_iso: str = Field(default_factory=utcnow_iso)


class BrainStateModel(BaseModel):
    instance_id: str
    product_name: str = "Performance Brain"
    set_name: str = "Init Performance Brain"
    active_slot: int = Field(0, ge=0, le=15)
    active_layer_id: str = "main-stack"
    # T2442: Brain Overview tabs (performance/console/step/split) are now first-class
    # `?section=` values instead of frontend-only `?view=` indirection. The legacy
    # `overview` aggregate value is migrated to `performance` at load time.
    active_section: Literal[
        "performance",
        "console",
        "step",
        "split",
        "perform",
        "layers",
        "sequence",
        "routing",
        "inputs",
        "library",
        "session_media",
        "practice_coach",
        "diagnostics",
    ] = "performance"
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
        "performance",
        "console",
        "step",
        "split",
        "perform",
        "layers",
        "sequence",
        "routing",
        "inputs",
        "library",
        "session_media",
        "practice_coach",
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



__all__ = [
    "BRAIN_SECTION_IDS",
    "BrainControllerAssignmentModel",
    "BrainControllerQualificationModel",
    "BrainDiagnosticsModel",
    "BrainInputsStateModel",
    "BrainInputsUpdateModel",
    "BrainKeyboardQualificationModel",
    "BrainKeyboardZoneModel",
    "BrainLayerModel",
    "BrainLayersUpdateModel",
    "BrainLibraryAssetModel",
    "BrainLibraryCollectionModel",
    "BrainLibraryStateModel",
    "BrainMasterSectionModel",
    "BrainMixerBusModel",
    "BrainMixerStateModel",
    "BrainMixerUpdateModel",
    "BrainPatternSummaryModel",
    "BrainRoutingQualificationModel",
    "BrainRuntimeEventModel",
    "BrainRuntimeResource",
    "BrainRuntimeScopeModel",
    "BrainSampleEditorStateModel",
    "BrainSampleEditorUpdateModel",
    "BrainSequenceLaneSummaryModel",
    "BrainSequenceModel",
    "BrainSequenceQualificationModel",
    "BrainSequenceUpdateModel",
    "BrainSlotModel",
    "BrainSlotUpdateModel",
    "BrainSnapshotIntegrationModel",
    "BrainSongEntryModel",
    "BrainSongStateModel",
    "BrainSongUpdateModel",
    "BrainStateModel",
    "BrainStateUpdateModel",
    "BrainTransportStateModel",
    "BrainTransportUpdateModel",
    "BrainTriggerProfileModel",
    "BrainTriggerQualificationModel",
    "utcnow_iso",
]
