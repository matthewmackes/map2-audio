from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class DeviceConfig:
    name: str
    midi_channel: int
    program_offset_mode: int
    definition_raw: int = 0
    confidence: str = "inferred"


@dataclass
class PedalConfig:
    exists: int
    confidence: str = "inferred"


@dataclass
class GCXConfig:
    num_gcx: int
    vca_exists: int
    switch_types: List[int] = field(default_factory=list)
    confidence: str = "inferred"


@dataclass
class MidiSettings:
    soft_options_raw: int
    global_program: bool
    link_mode: int
    respond_to_program_change: bool
    program_change_receive_channel: int
    confidence: str = "confirmed"


@dataclass
class InstantAccessDefinition:
    function: int
    detail: int
    transmit_cc: int
    switch_type: int
    confidence: str = "inferred"


@dataclass
class UtilitySettings:
    directory_speed: int
    program_access_mode: int
    extended_memory_raw: int = 0
    confidence: str = "inferred"


@dataclass
class GlobalConfiguration:
    devices: List[DeviceConfig] = field(default_factory=list)
    pedals: List[PedalConfig] = field(default_factory=list)
    gcx: GCXConfig = field(default_factory=lambda: GCXConfig(num_gcx=0, vca_exists=0, switch_types=[]))
    midi: MidiSettings = field(default_factory=lambda: MidiSettings(soft_options_raw=0, global_program=False, link_mode=0, respond_to_program_change=False, program_change_receive_channel=1))
    instant_access: List[InstantAccessDefinition] = field(default_factory=list)
    utility: UtilitySettings = field(default_factory=lambda: UtilitySettings(directory_speed=2, program_access_mode=0, extended_memory_raw=0))


@dataclass
class PresetDeviceProgramChange:
    enabled: int
    program: int
    confidence: str = "inferred"


@dataclass
class PresetModel:
    index: int
    name: str
    device_program_changes: List[PresetDeviceProgramChange] = field(default_factory=list)
    device_program_banks_raw: List[int] = field(default_factory=list)
    pedal_definitions: List[int] = field(default_factory=list)
    pedal_device_assignments: List[int] = field(default_factory=list)
    gcx_loop_states: List[int] = field(default_factory=list)
    gcx_toggles: List[int] = field(default_factory=list)
    instant_access_state: List[int] = field(default_factory=list)
    confidence: str = "inferred"


@dataclass
class GroundControlModel:
    profile_id: str
    global_config: GlobalConfiguration
    presets: List[PresetModel]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class GroundControlValidationReport:
    total_payload_size: int
    exact_size_ok: bool
    preamble_ok: bool
    terminator_ok: bool
    offsets_ok: bool
    field_ranges_ok: bool
    unknown_bytes_preserved: bool
    round_trip_identity: bool
    unknown_byte_count: int
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    changed_offsets: List[int] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class GroundControlTransportOptions:
    input_port_index: Optional[int] = None
    output_port_index: Optional[int] = None
    input_port_name: Optional[str] = None
    output_port_name: Optional[str] = None
    timeout_seconds: float = 30.0
    inter_message_delay_ms: float = 0.0
    chunk_size: Optional[int] = None
    allow_unsafe_segmented_send: bool = False
    debug: bool = False
    dry_run_path: Optional[str] = None


@dataclass
class GroundControlJob:
    job_id: str
    job_type: str
    status: str
    progress: float
    created_at: str
    updated_at: str
    result: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def model_from_dict(payload: Dict[str, Any]) -> GroundControlModel:
    global_config_payload = payload.get("global_config", {})
    devices = [
        DeviceConfig(**device)
        for device in global_config_payload.get("devices", [])
    ]
    pedals = [
        PedalConfig(**pedal)
        for pedal in global_config_payload.get("pedals", [])
    ]
    gcx = GCXConfig(**global_config_payload.get("gcx", {}))
    midi = MidiSettings(**global_config_payload.get("midi", {}))
    instant_access = [
        InstantAccessDefinition(**entry)
        for entry in global_config_payload.get("instant_access", [])
    ]
    utility = UtilitySettings(**global_config_payload.get("utility", {}))
    presets = []
    for preset_payload in payload.get("presets", []):
        device_program_changes = [
            PresetDeviceProgramChange(**change)
            for change in preset_payload.get("device_program_changes", [])
        ]
        presets.append(
            PresetModel(
                index=int(preset_payload.get("index", 0)),
                name=str(preset_payload.get("name", "")),
                device_program_changes=device_program_changes,
                device_program_banks_raw=[int(value) for value in preset_payload.get("device_program_banks_raw", [])],
                pedal_definitions=[int(value) for value in preset_payload.get("pedal_definitions", [])],
                pedal_device_assignments=[int(value) for value in preset_payload.get("pedal_device_assignments", [])],
                gcx_loop_states=[int(value) for value in preset_payload.get("gcx_loop_states", [])],
                gcx_toggles=[int(value) for value in preset_payload.get("gcx_toggles", [])],
                instant_access_state=[int(value) for value in preset_payload.get("instant_access_state", [])],
                confidence=str(preset_payload.get("confidence", "inferred")),
            )
        )
    return GroundControlModel(
        profile_id=str(payload.get("profile_id", "v1_13_bulk_dump")),
        global_config=GlobalConfiguration(
            devices=devices,
            pedals=pedals,
            gcx=gcx,
            midi=midi,
            instant_access=instant_access,
            utility=utility,
        ),
        presets=presets,
    )
