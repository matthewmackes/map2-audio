from __future__ import annotations

from .constants import (
    DEVICE_NAME_LENGTH,
    NUM_DEVICES,
    NUM_GCX,
    NUM_GCX_LOOPS,
    NUM_GCX_SWITCHES,
    NUM_INSTANT_ACCESS,
    NUM_PEDALS,
    NUM_PRESETS,
    PRESET_NAME_LENGTH,
    PROFILE_ID,
    SOFT_OPTION_GLOBAL_PROGRAM_MASK,
    SOFT_OPTION_LINK_MODE_MASK,
    SOFT_OPTION_LINK_MODE_SHIFT,
    SOFT_OPTION_RESPOND_MASK,
    SOFT_OPTION_RESPOND_SHIFT,
)
from .model import (
    DeviceConfig,
    GCXConfig,
    GlobalConfiguration,
    GroundControlModel,
    InstantAccessDefinition,
    MidiSettings,
    PedalConfig,
    PresetDeviceProgramChange,
    PresetModel,
    UtilitySettings,
)
from .sysex_container import GroundControlSysexContainer


def _decode_ascii_padded(data: bytes) -> str:
    return data.decode("ascii", errors="replace").rstrip(" ")


def parse_container_to_model(container: GroundControlSysexContainer) -> GroundControlModel:
    config = container.config_block
    devices = []
    for index in range(NUM_DEVICES):
        name_begin = index * DEVICE_NAME_LENGTH
        devices.append(
            DeviceConfig(
                name=_decode_ascii_padded(config[name_begin:name_begin + DEVICE_NAME_LENGTH]),
                midi_channel=config[64 + index],
                program_offset_mode=config[72 + index],
                definition_raw=config[80 + index],
            )
        )

    pedals = [PedalConfig(exists=config[88 + index]) for index in range(NUM_PEDALS)]
    soft_options_raw = config[126]
    midi_settings = MidiSettings(
        soft_options_raw=soft_options_raw,
        global_program=bool(soft_options_raw & SOFT_OPTION_GLOBAL_PROGRAM_MASK),
        link_mode=(soft_options_raw & SOFT_OPTION_LINK_MODE_MASK) >> SOFT_OPTION_LINK_MODE_SHIFT,
        respond_to_program_change=bool((soft_options_raw & SOFT_OPTION_RESPOND_MASK) >> SOFT_OPTION_RESPOND_SHIFT),
        program_change_receive_channel=config[128],
    )
    instant_access = [
        InstantAccessDefinition(
            function=config[129 + index],
            detail=config[137 + index],
            transmit_cc=config[145 + index],
            switch_type=config[153 + index],
        )
        for index in range(NUM_INSTANT_ACCESS)
    ]
    gcx = GCXConfig(
        num_gcx=config[92],
        vca_exists=config[91],
        switch_types=[config[93 + index] for index in range(NUM_GCX * NUM_GCX_SWITCHES)],
    )
    utility = UtilitySettings(
        directory_speed=config[127],
        program_access_mode=config[125],
        extended_memory_raw=config[90],
    )

    presets = []
    for preset_index in range(NUM_PRESETS):
        block = container.preset_blocks[preset_index]
        device_program_changes = [
            PresetDeviceProgramChange(enabled=block[10 + (index * 2)], program=block[11 + (index * 2)])
            for index in range(NUM_DEVICES)
        ]
        presets.append(
            PresetModel(
                index=preset_index,
                name=_decode_ascii_padded(block[:PRESET_NAME_LENGTH]),
                device_program_changes=device_program_changes,
                device_program_banks_raw=[block[26 + index] for index in range(NUM_DEVICES)],
                pedal_definitions=[block[34 + index] for index in range(NUM_PEDALS)],
                pedal_device_assignments=[block[36 + index] for index in range(NUM_PEDALS)],
                gcx_loop_states=[block[38 + index] for index in range(NUM_GCX * NUM_GCX_LOOPS)],
                gcx_toggles=[block[70 + index] for index in range(NUM_GCX)],
                instant_access_state=[block[74 + index] for index in range(NUM_INSTANT_ACCESS)],
            )
        )

    return GroundControlModel(
        profile_id=PROFILE_ID,
        global_config=GlobalConfiguration(
            devices=devices,
            pedals=pedals,
            gcx=gcx,
            midi=midi_settings,
            instant_access=instant_access,
            utility=utility,
        ),
        presets=presets,
    )
