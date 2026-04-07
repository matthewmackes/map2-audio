from __future__ import annotations

from app.services.enriched_surface_runtime import (
    build_shared_operator_contract,
    build_surface_lab,
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


def test_mackie_surface_lab_exposes_protocol_and_motor_features():
    surface_lab = build_surface_lab("mackie-mcu-pro")

    assert surface_lab["enabled"] is True
    assert "mcu-protocol-inspector" in surface_lab["features"]
    assert "motor-fader-safety-tools" in surface_lab["features"]
