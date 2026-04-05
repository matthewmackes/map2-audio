from pathlib import Path

from app.services.performance_brain_service import (
    BrainStateUpdateModel,
    BrainTransportUpdateModel,
    PerformanceBrainService,
)


def make_service(tmp_path: Path) -> PerformanceBrainService:
    return PerformanceBrainService(root_path=tmp_path / "brain-service")


def test_brain_service_isolates_instance_state(tmp_path):
    service = make_service(tmp_path)

    service.update_state(BrainStateUpdateModel(set_name="Stage Rig", active_slot=3), instance_id="101")
    service.update_transport(BrainTransportUpdateModel(bpm=132, pattern=7), instance_id="101")

    left = service.get_state(instance_id="101")
    right = service.get_state(instance_id="202")

    assert left["set_name"] == "Stage Rig"
    assert left["active_slot"] == 3
    assert left["transport"]["bpm"] == 132
    assert left["transport"]["pattern"] == 7
    assert right["set_name"] != "Stage Rig"
    assert right["transport"]["bpm"] == 120
    assert right["instance_id"] != left["instance_id"]


def test_brain_service_isolates_duplicate_instance_ids_by_plugin_position(tmp_path):
    service = make_service(tmp_path)

    service.update_state(
        BrainStateUpdateModel(set_name="Rig A", active_slot=1),
        instance_id="101",
        plugin_position=0,
    )
    service.update_state(
        BrainStateUpdateModel(set_name="Rig B", active_slot=7),
        instance_id="101",
        plugin_position=1,
    )

    left = service.get_state(instance_id="101", plugin_position=0)
    right = service.get_state(instance_id="101", plugin_position=1)

    assert left["instance_id"] == "instance-101__position-0"
    assert right["instance_id"] == "instance-101__position-1"
    assert left["set_name"] == "Rig A"
    assert right["set_name"] == "Rig B"
    assert left["active_slot"] == 1
    assert right["active_slot"] == 7


def test_brain_service_builds_scoped_runtime_events(tmp_path):
    service = make_service(tmp_path)

    service.update_transport(
        BrainTransportUpdateModel(bpm=131, pattern=4),
        instance_id="101",
        plugin_position=3,
    )

    event = service.get_runtime_event("transport", instance_id="101", plugin_position=3)

    assert event["resource"] == "transport"
    assert event["scope"] == {
        "runtime_instance_id": "instance-101__position-3",
        "instance_id": "101",
        "plugin_position": 3,
    }
    assert event["state"]["instance_id"] == "instance-101__position-3"
    assert event["state"]["transport"]["bpm"] == 131
    assert event["state"]["transport"]["pattern"] == 4


def test_brain_service_imports_drum_machine_payloads(tmp_path):
    service = make_service(tmp_path)
    empty_step = {"velocity": 0, "accent": False}
    pattern_rows = [[dict(empty_step) for _ in range(64)] for _ in range(16)]
    pattern_rows[0][0] = {"velocity": 127, "accent": True, "lock_volume": 0.75}
    pattern_rows[0][4] = {"velocity": 96, "accent": False}
    pattern_rows[1][8] = {"velocity": 110, "accent": False, "lock_filter_cutoff": 840.0}

    imported = service.import_from_drums(
        drum_state={
            "transport": True,
            "bpm": 126,
            "swing": 17,
            "pattern": 5,
            "variation": 2,
            "volume": 88,
            "midi_output_enabled": True,
            "midi_clock_output_enabled": True,
            "program_change_enabled": True,
            "track_swing": [0] * 16,
            "pad_sound_sources": ["sample"] * 16,
            "pad_filters": [{"type": "lowpass"} for _ in range(16)],
            "pad_synth_params": [{"tone_amount": 0.55} for _ in range(16)],
            "pad_cv_gate_configs": [{"enabled": False} for _ in range(16)],
        },
        pad_controls=[
            {
                "pad_id": index,
                "volume": 90 - index,
                "pan": 0,
                "tune": float(index),
                "mute": False,
                "solo": False,
                "bus_assignment": index % 8,
            }
            for index in range(16)
        ],
        bus_mixers=[
            {
                "bus_id": index,
                "name": f"Bus {index + 1}",
                "level": 80,
                "pan": 0,
                "mute": False,
                "solo": False,
                "output_pair": index % 4,
                "reverb_send": 10,
            }
            for index in range(8)
        ],
        master_fx={"drive_db": 3.0, "compressor_ratio": 4.0, "reverb_mix": 0.25, "limiter_threshold": -0.3},
        midi_mapping={
            "pads": [{"pad": pad, "notes": [36 + pad], "midi_channel": 0} for pad in range(16)]
        },
        velocity_curves={"pads": [{"pad": pad, "curve_type": "dynamic"} for pad in range(16)]},
        zones={"pads": [{"pad": pad, "zones": []} for pad in range(16)]},
        active_kit={
            "name": "Arena Kit",
            "instruments": [
                {"name": "Kick" if index == 0 else f"Pad {index + 1}", "sfz_path": f"/kits/pad-{index + 1}.sfz"}
                for index in range(16)
            ],
        },
        song=[{"pattern": 5, "repeat_count": 4}],
        song_loop=True,
        song_transport={"active_pattern": 5, "pending_pattern": 9, "switch_quantization_beats": 2},
        midi_output_config={
            "midi_output_enabled": True,
            "midi_clock_output_enabled": True,
            "midi_output_channel": 9,
            "program_change_enabled": True,
        },
        patterns=[
            {
                "pattern_id": 5,
                "length": 16,
                "track_lengths": [16, 16] + [0] * 14,
                "steps": pattern_rows,
            }
        ],
        instance_id="drums-import",
    )

    assert imported["transport"]["is_playing"] is True
    assert imported["transport"]["bpm"] == 126
    assert imported["transport"]["pattern"] == 5
    assert imported["transport"]["pending_pattern"] == 9
    assert imported["transport"]["switch_quantization_beats"] == 2
    assert imported["set_name"] == "Arena Kit Brain Import"
    assert imported["slots"][0]["name"] == "Kick"
    assert imported["slots"][0]["mode"] == "drum"
    assert imported["slots"][0]["status"] == "imported-drums:sample"
    assert imported["mixer"]["master"]["master_volume"] == 0.88
    assert imported["sequence"]["patterns"][0] == {
        "pattern_id": 5,
        "name": "Pattern 6",
        "length": 16,
        "active_lane_count": 2,
        "fill_enabled": False,
        "variation_count": 3,
        "summary": "2 lanes · 3 active steps · locks: filter, volume",
    }
    assert imported["sequence"]["lanes"][0]["active_steps"] == 2
    assert imported["sequence"]["lanes"][0]["step_lock_targets"] == ["volume"]
    assert imported["sequence"]["lanes"][1]["step_lock_targets"] == ["filter"]
    assert imported["song"]["loop"] is True
    assert imported["song"]["entries"][0]["pattern_id"] == 5
    assert imported["inputs"]["controller_assignments"][0] == {
        "source": "note:36",
        "target": "slot:0:trigger",
        "mode": "note",
        "enabled": True,
    }
    assert any(
        assignment["target"] == "transport:midi-clock"
        for assignment in imported["inputs"]["controller_assignments"]
    )
    assert "Imported Drum Machine MIDI clock output remains a legacy transport feature." in imported["diagnostics"]["warnings"]
    assert imported["diagnostics"]["last_import_source"] == "drums"


def test_brain_service_imports_synthforge_payloads(tmp_path):
    service = make_service(tmp_path)

    imported = service.import_from_synthforge(
        parts=[
            {
                "part_index": index,
                "midi_channel": index + 1,
                "output_bus": "main",
                "level": 1.0,
                "pan": 0.0,
                "mute": False,
                "solo": False,
            }
            for index in range(16)
        ],
        sample_statuses=[
            {
                "loaded": True,
                "sampler_mode": True,
                "sfz_path": f"/sfz/part-{index + 1}.sfz",
                "soundfont_path": "",
                "active_preset_name": f"Layer {index + 1}",
                "engine": "sfizz",
            }
            for index in range(16)
        ],
        parameters=[{"global.transpose": 12 if index == 0 else 0} for index in range(16)],
        voice_metrics={"active_voices": 11, "peak_voices": 27, "voices_per_part": [2] * 16},
        instance_id="synthforge-import",
    )

    assert imported["slots"][0]["name"] == "Layer 1"
    assert imported["slots"][0]["asset_type"] == "sfz"
    assert imported["slots"][0]["transpose"] == 12
    assert imported["diagnostics"]["active_voices"] == 11
    assert imported["diagnostics"]["peak_voices"] == 27
    assert imported["diagnostics"]["last_import_source"] == "synthforge"
