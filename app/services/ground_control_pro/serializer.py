from __future__ import annotations

from .constants import (
    CONFIG_NUM_BYTES,
    DEVICE_NAME_LENGTH,
    NUM_DEVICES,
    NUM_GCX,
    NUM_GCX_LOOPS,
    NUM_GCX_SWITCHES,
    NUM_INSTANT_ACCESS,
    NUM_PEDALS,
    NUM_PRESETS,
    PRESET_NAME_LENGTH,
    SOFT_OPTION_GLOBAL_PROGRAM_MASK,
    SOFT_OPTION_LINK_MODE_MASK,
    SOFT_OPTION_LINK_MODE_SHIFT,
    SOFT_OPTION_RESPOND_MASK,
    SOFT_OPTION_RESPOND_SHIFT,
)
from .model import GroundControlModel
from .sysex_container import GroundControlSysexContainer


def _encode_ascii_padded(value: str, length: int) -> bytes:
    encoded = value.upper().encode("ascii", errors="strict")
    if len(encoded) > length:
        raise ValueError(f"Value '{value}' exceeds fixed width {length}")
    return encoded.ljust(length, b" ")


def _build_soft_options(raw_value: int, *, global_program: bool, link_mode: int, respond_to_program_change: bool) -> int:
    value = raw_value & 0xFF
    value &= ~SOFT_OPTION_GLOBAL_PROGRAM_MASK
    value |= (1 if global_program else 0) * SOFT_OPTION_GLOBAL_PROGRAM_MASK
    value &= ~SOFT_OPTION_LINK_MODE_MASK
    value |= (link_mode << SOFT_OPTION_LINK_MODE_SHIFT) & SOFT_OPTION_LINK_MODE_MASK
    value &= ~SOFT_OPTION_RESPOND_MASK
    value |= ((1 if respond_to_program_change else 0) << SOFT_OPTION_RESPOND_SHIFT) & SOFT_OPTION_RESPOND_MASK
    return value & 0x7F


def compile_model(model: GroundControlModel, base_container: GroundControlSysexContainer) -> bytes:
    if len(model.presets) != NUM_PRESETS:
        raise ValueError(f"Expected {NUM_PRESETS} presets, received {len(model.presets)}")

    config = bytearray(base_container.config_block)
    if len(config) != CONFIG_NUM_BYTES:
        raise ValueError("Invalid base config block length")

    for index, device in enumerate(model.global_config.devices[:NUM_DEVICES]):
        begin = index * DEVICE_NAME_LENGTH
        config[begin:begin + DEVICE_NAME_LENGTH] = _encode_ascii_padded(device.name, DEVICE_NAME_LENGTH)
        config[64 + index] = int(device.midi_channel) & 0x7F
        config[72 + index] = int(device.program_offset_mode) & 0x7F
        config[80 + index] = int(device.definition_raw) & 0x7F

    for index, pedal in enumerate(model.global_config.pedals[:NUM_PEDALS]):
        config[88 + index] = int(pedal.exists) & 0x7F

    config[90] = int(model.global_config.utility.extended_memory_raw) & 0x7F
    config[91] = int(model.global_config.gcx.vca_exists) & 0x7F
    config[92] = int(model.global_config.gcx.num_gcx) & 0x7F

    for index, value in enumerate(model.global_config.gcx.switch_types[:NUM_GCX * NUM_GCX_SWITCHES]):
        config[93 + index] = int(value) & 0x7F

    config[125] = int(model.global_config.utility.program_access_mode) & 0x7F
    config[126] = _build_soft_options(
        int(model.global_config.midi.soft_options_raw) & 0x7F,
        global_program=bool(model.global_config.midi.global_program),
        link_mode=int(model.global_config.midi.link_mode),
        respond_to_program_change=bool(model.global_config.midi.respond_to_program_change),
    )
    config[127] = int(model.global_config.utility.directory_speed) & 0x7F
    config[128] = int(model.global_config.midi.program_change_receive_channel) & 0x7F

    for index, definition in enumerate(model.global_config.instant_access[:NUM_INSTANT_ACCESS]):
        config[129 + index] = int(definition.function) & 0x7F
        config[137 + index] = int(definition.detail) & 0x7F
        config[145 + index] = int(definition.transmit_cc) & 0x7F
        config[153 + index] = int(definition.switch_type) & 0x7F

    presets = []
    for preset in model.presets:
        block = bytearray(base_container.preset_blocks[preset.index])
        block[:PRESET_NAME_LENGTH] = _encode_ascii_padded(preset.name, PRESET_NAME_LENGTH)
        for index, change in enumerate(preset.device_program_changes[:NUM_DEVICES]):
            block[10 + (index * 2)] = int(change.enabled) & 0x7F
            block[11 + (index * 2)] = int(change.program) & 0x7F
        for index, value in enumerate(preset.device_program_banks_raw[:NUM_DEVICES]):
            block[26 + index] = int(value) & 0x7F
        for index, value in enumerate(preset.pedal_definitions[:NUM_PEDALS]):
            block[34 + index] = int(value) & 0x7F
        for index, value in enumerate(preset.pedal_device_assignments[:NUM_PEDALS]):
            block[36 + index] = int(value) & 0x7F
        for index, value in enumerate(preset.gcx_loop_states[:NUM_GCX * NUM_GCX_LOOPS]):
            block[38 + index] = int(value) & 0x7F
        for index, value in enumerate(preset.gcx_toggles[:NUM_GCX]):
            block[70 + index] = int(value) & 0x7F
        for index, value in enumerate(preset.instant_access_state[:NUM_INSTANT_ACCESS]):
            block[74 + index] = int(value) & 0x7F
        presets.append(bytes(block))

    return GroundControlSysexContainer(
        raw_bytes=base_container.raw_bytes,
        preamble=base_container.preamble,
        config_block=bytes(config),
        preset_blocks=tuple(presets),
        terminator=base_container.terminator,
    ).to_bytes()
