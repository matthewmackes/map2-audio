from __future__ import annotations

from typing import List

from .constants import (
    NUM_DEVICES,
    NUM_GCX,
    NUM_GCX_LOOPS,
    NUM_GCX_SWITCHES,
    NUM_INSTANT_ACCESS,
    NUM_PEDALS,
    NUM_PRESETS,
    PREAMBLE,
    PRESET_NAME_LENGTH,
    SYSEX_NUM_BYTES,
    TERMINATOR,
)
from .field_map import expand_field_descriptors, unknown_byte_count
from .parser import parse_container_to_model
from .model import GroundControlModel, GroundControlValidationReport
from .serializer import compile_model
from .sysex_container import GroundControlSysexContainer


def _is_ascii(value: str) -> bool:
    try:
        value.encode("ascii", errors="strict")
        return True
    except UnicodeEncodeError:
        return False


def validate_sysex_bytes(source_bytes: bytes, compiled_bytes: bytes | None = None) -> GroundControlValidationReport:
    candidate = compiled_bytes if compiled_bytes is not None else source_bytes
    errors: List[str] = []
    warnings: List[str] = []

    exact_size_ok = len(candidate) == SYSEX_NUM_BYTES
    preamble_ok = candidate.startswith(PREAMBLE)
    terminator_ok = candidate.endswith(TERMINATOR)
    offsets_ok = exact_size_ok and preamble_ok and terminator_ok

    if not exact_size_ok:
        errors.append(f"Expected {SYSEX_NUM_BYTES} bytes, received {len(candidate)}")
    if not preamble_ok:
        errors.append("Invalid Ground Control Pro preamble")
    if not terminator_ok:
        errors.append("Invalid Ground Control Pro terminator")

    changed_offsets = []
    if compiled_bytes is not None:
        limit = min(len(source_bytes), len(compiled_bytes))
        changed_offsets = [offset for offset in range(limit) if source_bytes[offset] != compiled_bytes[offset]]
        if len(source_bytes) != len(compiled_bytes):
            changed_offsets.extend(range(limit, max(len(source_bytes), len(compiled_bytes))))

    return GroundControlValidationReport(
        total_payload_size=len(candidate),
        exact_size_ok=exact_size_ok,
        preamble_ok=preamble_ok,
        terminator_ok=terminator_ok,
        offsets_ok=offsets_ok,
        field_ranges_ok=False,
        unknown_bytes_preserved=False,
        round_trip_identity=compiled_bytes is None or source_bytes == compiled_bytes,
        unknown_byte_count=unknown_byte_count(),
        errors=errors,
        warnings=warnings,
        changed_offsets=changed_offsets,
    )


def validate_model(model: GroundControlModel, base_bytes: bytes | None = None, compiled_bytes: bytes | None = None) -> GroundControlValidationReport:
    report = validate_sysex_bytes(base_bytes or compiled_bytes or b"", compiled_bytes)
    errors = list(report.errors)
    warnings = list(report.warnings)

    if len(model.global_config.devices) != NUM_DEVICES:
        errors.append(f"Expected {NUM_DEVICES} devices, received {len(model.global_config.devices)}")
    if len(model.global_config.pedals) != NUM_PEDALS:
        errors.append(f"Expected {NUM_PEDALS} pedals, received {len(model.global_config.pedals)}")
    if len(model.global_config.instant_access) != NUM_INSTANT_ACCESS:
        errors.append(f"Expected {NUM_INSTANT_ACCESS} instant-access definitions, received {len(model.global_config.instant_access)}")
    if len(model.presets) != NUM_PRESETS:
        errors.append(f"Expected {NUM_PRESETS} presets, received {len(model.presets)}")

    for index, device in enumerate(model.global_config.devices):
        if not _is_ascii(device.name):
            errors.append(f"Device {index + 1} name contains non-ASCII characters")
        if len(device.name.encode('ascii', errors='ignore')) > 8:
            errors.append(f"Device {index + 1} name exceeds 8 characters")
        if not 0 <= device.midi_channel <= 16:
            errors.append(f"Device {index + 1} MIDI channel {device.midi_channel} is out of range 0..16")
        if not 0 <= device.program_offset_mode <= 1:
            errors.append(f"Device {index + 1} program offset mode must be 0 or 1")

    if not 0 <= model.global_config.gcx.num_gcx <= NUM_GCX:
        errors.append(f"GCX expander count must be 0..{NUM_GCX}")
    if not 0 <= model.global_config.midi.link_mode <= 2:
        errors.append("Link mode must be 0, 1, or 2")
    if not 0 <= model.global_config.midi.program_change_receive_channel <= 16:
        errors.append("Program-change receive channel must be 0..16")

    for index, definition in enumerate(model.global_config.instant_access):
        if definition.transmit_cc not in (0, 1):
            errors.append(f"Instant Access {index + 1} transmit_cc must be 0 or 1")
        if definition.switch_type not in (0, 1):
            errors.append(f"Instant Access {index + 1} switch_type must be 0 or 1")

    for preset in model.presets:
        if not _is_ascii(preset.name):
            errors.append(f"Preset {preset.index} name contains non-ASCII characters")
        if len(preset.name.encode('ascii', errors='ignore')) > PRESET_NAME_LENGTH:
            errors.append(f"Preset {preset.index} name exceeds {PRESET_NAME_LENGTH} characters")
        if len(preset.device_program_changes) != NUM_DEVICES:
            errors.append(f"Preset {preset.index} must contain {NUM_DEVICES} device-program changes")
        if len(preset.gcx_loop_states) != NUM_GCX * NUM_GCX_LOOPS:
            errors.append(f"Preset {preset.index} must contain {NUM_GCX * NUM_GCX_LOOPS} GCX loop-state bytes")

    unknown_preserved = True
    if base_bytes is not None and compiled_bytes is not None:
        changed_offsets = set(report.changed_offsets)
        for descriptor in expand_field_descriptors():
            if descriptor.confidence != "unknown_reserved":
                continue
            for offset in range(descriptor.absolute_offset, descriptor.absolute_offset + descriptor.width):
                if offset in changed_offsets:
                    unknown_preserved = False
                    errors.append(f"Unknown-reserved byte changed at offset {offset} ({descriptor.path})")
                    break

    deterministic_round_trip = report.round_trip_identity
    candidate_bytes = compiled_bytes or base_bytes
    if candidate_bytes is not None:
        try:
            candidate_container = GroundControlSysexContainer.from_bytes(candidate_bytes)
            reparsed_model = parse_container_to_model(candidate_container)
            deterministic_round_trip = compile_model(reparsed_model, candidate_container) == candidate_bytes
        except Exception as exc:
            deterministic_round_trip = False
            errors.append(f"Round-trip validation failed: {exc}")

    return GroundControlValidationReport(
        total_payload_size=report.total_payload_size,
        exact_size_ok=report.exact_size_ok,
        preamble_ok=report.preamble_ok,
        terminator_ok=report.terminator_ok,
        offsets_ok=report.offsets_ok,
        field_ranges_ok=not errors,
        unknown_bytes_preserved=unknown_preserved,
        round_trip_identity=deterministic_round_trip,
        unknown_byte_count=report.unknown_byte_count,
        errors=errors,
        warnings=warnings,
        changed_offsets=report.changed_offsets,
    )
