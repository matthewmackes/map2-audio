from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict
import hashlib

import yaml

from .constants import (
    NUM_DEVICES,
    NUM_GCX,
    NUM_GCX_LOOPS,
    NUM_GCX_SWITCHES,
    NUM_INSTANT_ACCESS,
    NUM_PEDALS,
    NUM_PRESETS,
    PREAMBLE,
    PROFILE_ID,
    SYSEX_NUM_BYTES,
    TERMINATOR,
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
from .serializer import compile_model
from .sysex_container import GroundControlSysexContainer


def build_blank_container() -> GroundControlSysexContainer:
    payload = bytearray(SYSEX_NUM_BYTES)
    payload[: len(PREAMBLE)] = PREAMBLE
    payload[-len(TERMINATOR):] = TERMINATOR
    return GroundControlSysexContainer.from_bytes(bytes(payload))


def build_reference_model() -> GroundControlModel:
    devices = [
        DeviceConfig(
            name=f"DEV{index + 1}",
            midi_channel=(index % 8) + 1,
            program_offset_mode=index % 2,
            definition_raw=16 + index,
        )
        for index in range(NUM_DEVICES)
    ]
    pedals = [PedalConfig(exists=1) for _ in range(NUM_PEDALS)]
    gcx = GCXConfig(
        num_gcx=2,
        vca_exists=1,
        switch_types=[(index % 2) for index in range(NUM_GCX * NUM_GCX_SWITCHES)],
    )
    midi = MidiSettings(
        soft_options_raw=0,
        global_program=True,
        link_mode=1,
        respond_to_program_change=True,
        program_change_receive_channel=8,
    )
    instant_access = [
        InstantAccessDefinition(
            function=index,
            detail=(index * 3) % 128,
            transmit_cc=index % 2,
            switch_type=index % 2,
        )
        for index in range(NUM_INSTANT_ACCESS)
    ]
    utility = UtilitySettings(
        directory_speed=3,
        program_access_mode=1,
        extended_memory_raw=2,
    )

    presets = []
    for preset_index in range(NUM_PRESETS):
        presets.append(
            PresetModel(
                index=preset_index,
                name=f"P{preset_index:03d}",
                device_program_changes=[
                    PresetDeviceProgramChange(
                        enabled=(preset_index + device_index) % 2,
                        program=(preset_index + (device_index * 7)) % 128,
                    )
                    for device_index in range(NUM_DEVICES)
                ],
                device_program_banks_raw=[(preset_index + device_index) % 8 for device_index in range(NUM_DEVICES)],
                pedal_definitions=[(preset_index + pedal_index) % 32 for pedal_index in range(NUM_PEDALS)],
                pedal_device_assignments=[pedal_index + 1 for pedal_index in range(NUM_PEDALS)],
                gcx_loop_states=[(preset_index + loop_index) % 2 for loop_index in range(NUM_GCX * NUM_GCX_LOOPS)],
                gcx_toggles=[(preset_index + gcx_index) % 2 for gcx_index in range(NUM_GCX)],
                instant_access_state=[(preset_index + ia_index) % 2 for ia_index in range(NUM_INSTANT_ACCESS)],
            )
        )

    return GroundControlModel(
        profile_id=PROFILE_ID,
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


def build_fixture_payloads() -> Dict[str, Dict[str, Any]]:
    base_container = build_blank_container()
    reference_model = build_reference_model()

    variants: Dict[str, tuple[GroundControlModel, Dict[str, Any]]] = {
        "factory_default_v113.syx": (
            reference_model,
            {
                "firmware_version": "1.13",
                "source_device": "synthetic-reference",
                "state": "factory-default approximation",
                "change_intent": [],
            },
        ),
    }

    single_name_change = deepcopy(reference_model)
    single_name_change.presets[0].name = "LEAD A"
    variants["single_name_change_v113.syx"] = (
        single_name_change,
        {
            "firmware_version": "1.13",
            "source_device": "synthetic-reference",
            "state": "single controlled delta",
            "change_intent": ["presets[0].name"],
        },
    )

    single_channel_change = deepcopy(reference_model)
    single_channel_change.global_config.devices[0].midi_channel = 7
    variants["single_channel_change_v113.syx"] = (
        single_channel_change,
        {
            "firmware_version": "1.13",
            "source_device": "synthetic-reference",
            "state": "single controlled delta",
            "change_intent": ["global_config.devices[0].midi_channel"],
        },
    )

    single_ia_change = deepcopy(reference_model)
    single_ia_change.global_config.instant_access[0].function = 41
    variants["single_ia_change_v113.syx"] = (
        single_ia_change,
        {
            "firmware_version": "1.13",
            "source_device": "synthetic-reference",
            "state": "single controlled delta",
            "change_intent": ["global_config.instant_access[0].function"],
        },
    )

    single_pedal_change = deepcopy(reference_model)
    single_pedal_change.presets[0].pedal_device_assignments[0] = 2
    variants["single_pedal_change_v113.syx"] = (
        single_pedal_change,
        {
            "firmware_version": "1.13",
            "source_device": "synthetic-reference",
            "state": "single controlled delta",
            "change_intent": ["presets[0].pedal_device_assignments[0]"],
        },
    )

    single_program_change = deepcopy(reference_model)
    single_program_change.presets[0].device_program_changes[0].program = 99
    variants["single_program_change_v113.syx"] = (
        single_program_change,
        {
            "firmware_version": "1.13",
            "source_device": "synthetic-reference",
            "state": "single controlled delta",
            "change_intent": ["presets[0].device_program_changes[0].program"],
        },
    )

    payloads: Dict[str, Dict[str, Any]] = {}
    for filename, (model, metadata) in variants.items():
        data = compile_model(model, base_container)
        payloads[filename] = {
            "bytes": data,
            "metadata": {
                **metadata,
                "profile_id": PROFILE_ID,
                "synthetic": True,
                "hardware_verified": False,
                "sha256": hashlib.sha256(data).hexdigest(),
                "size_bytes": len(data),
            },
        }
    return payloads


def write_fixture_bundle(output_dir: Path) -> Dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    payloads = build_fixture_payloads()
    fixtures = []
    for filename, payload in payloads.items():
        path = output_dir / filename
        path.write_bytes(payload["bytes"])
        fixtures.append(
            {
                "filename": filename,
                **payload["metadata"],
            }
        )

    manifest = {
        "profile_id": PROFILE_ID,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generator": "app.services.ground_control_pro.fixtures.write_fixture_bundle",
        "fixtures": fixtures,
    }
    (output_dir / "manifest.yml").write_text(yaml.safe_dump(manifest, sort_keys=False), encoding="utf-8")
    return manifest
