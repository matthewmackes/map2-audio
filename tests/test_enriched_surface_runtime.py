from __future__ import annotations

from app.services.enriched_surface_runtime import (
    build_shared_operator_contract,
    build_surface_lab,
    build_surface_lab_snapshot,
    build_unit_view_state,
)


def test_shared_operator_contract_tracks_synth_first_surface_rules():
    contract = build_shared_operator_contract()

    assert contract["primary_role"] == "synth_control"
    assert contract["multi_synth_mode"] == "parallel"
    assert contract["view_sync"] == "independent-per-surface"
    assert contract["community_firmware_support"] == "first-class"


def test_maschine_view_state_promotes_parameter_page_when_audio_grid_has_selection():
    view_state = build_unit_view_state(
        "maschine-mk1",
        service_state={
            "websocket_connected": True,
            "audio_grid": {"selected_block_id": "node-42"},
        },
        host_detected=True,
    )

    assert view_state["current_view_id"] == "synth-parameters-primary"
    assert view_state["current_view_source"] == "maschine-audio-grid-selection"


def test_push_view_state_maps_active_page_into_shared_view_contract():
    view_state = build_unit_view_state(
        "ableton-push",
        service_state={
            "running": True,
            "snapshot_state": {"active_page": "diagnostics"},
        },
        host_detected=True,
    )

    assert view_state["current_view_id"] == "surface-lab"
    assert view_state["current_view_source"] == "push-active-page"


def test_ground_control_view_state_promotes_surface_lab_when_sessions_are_active():
    view_state = build_unit_view_state(
        "ground-control-pro",
        service_state={
            "session_count": 2,
        },
        host_detected=True,
    )

    assert view_state["current_view_id"] == "surface-lab"
    assert view_state["current_view_source"] == "ground-control-pro-session"


def test_launch_control_view_state_uses_midi_hub_detection_for_templates():
    view_state = build_unit_view_state(
        "novation-launch-control",
        service_state={
            "detected_device_count": 1,
        },
        host_detected=True,
    )

    assert view_state["current_view_id"] == "templates"
    assert view_state["current_view_source"] == "midi-hub-profile-detected"


def test_surface_lab_snapshot_exposes_meloaudio_profile_runtime():
    snapshot = build_surface_lab_snapshot(
        "meloaudio-midi-commander",
        {
            "active_profile_id": "meloaudio_commander",
            "current_bank": 2,
            "calibration_count": 2,
            "detected_device_count": 1,
            "profile": {
                "footswitches": [{}, {}, {}],
                "expression_pedals": [{}, {}],
                "supports_firmware_update": True,
            },
        },
    )

    assert snapshot["active_profile_id"] == "meloaudio_commander"
    assert snapshot["current_bank"] == 2
    assert snapshot["calibration_count"] == 2
    assert snapshot["footswitch_count"] == 3
    assert snapshot["expression_pedal_count"] == 2
    assert snapshot["supports_firmware_update"] is True


def test_surface_lab_snapshot_exposes_mackie_display_transport_metadata():
    snapshot = build_surface_lab_snapshot(
        "mackie-mcu-pro",
        {
            "detected_device_count": 1,
            "display_capabilities": {
                "transport": "mcu_scribble_strip",
                "motor_faders": 9,
                "supports_channel_labels": True,
            },
        },
    )

    assert snapshot["detected_device_count"] == 1
    assert snapshot["motor_faders"] == 9
    assert snapshot["scribble_strip_transport"] == "mcu_scribble_strip"
    assert snapshot["supports_channel_labels"] is True


def test_mackie_surface_lab_exposes_protocol_and_motor_features():
    surface_lab = build_surface_lab("mackie-mcu-pro")

    assert surface_lab["enabled"] is True
    assert "mcu-protocol-inspector" in surface_lab["features"]
    assert "motor-fader-safety-tools" in surface_lab["features"]
