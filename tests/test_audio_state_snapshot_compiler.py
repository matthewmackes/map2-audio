from app.services.audio_state_snapshot_compiler import (
    build_initial_authoritative_audio_state,
    compile_snapshot_detail_to_intent,
    overlay_audio_state_extensions,
)


def test_compile_snapshot_detail_to_intent_preserves_saved_snapshot_bindings_and_routing():
    detail = {
        "id": 84,
        "name": "Rig20260402b",
        "input_device": "Stage Input",
        "output_device": "House Left/Right",
        "io_bindings": {
            "input_device": "Stage Input",
            "output_device": "House Left/Right",
        },
        "controls": {
            "monitoring_output_index": 2,
        },
        "routing": {
            "mode": "series",
            "active_channel_key": "ch_a",
            "series_order": ["ch_a", "ch_b"],
        },
        "paths": [
            {"id": "ch_a", "label": "A", "snapshot_chain_id": 201},
            {"id": "ch_b", "label": "B", "snapshot_chain_id": 202},
        ],
        "chains": [
            {"id": 201, "name": "Drive", "plugins": [{"uri": "plugin://drive"}]},
        ],
        "deployments": [
            {"primary_node_id": "MANAGEMENT-NODE-1"},
        ],
    }

    compiled = compile_snapshot_detail_to_intent(detail)

    assert compiled.snapshot_id == 84
    assert compiled.io.requested_input_device == "Stage Input"
    assert compiled.io.requested_output_device == "House Left/Right"
    assert compiled.io.monitoring_output_index == 2
    assert compiled.routing.mode == "series"
    assert compiled.routing.active_path_ids == ["ch_a"]
    assert compiled.routing.path_order == ["ch_a", "ch_b"]
    assert compiled.deployment.placement_mode == "cluster_deployed"
    assert compiled.deployment.preferred_nodes == ["MANAGEMENT-NODE-1"]


def test_build_initial_authoritative_audio_state_marks_paths_pending_until_nodes_observe_apply():
    detail = {
        "id": 7,
        "name": "Pending Snapshot",
        "routing": {"mode": "series", "series_order": ["ch_a"]},
        "paths": [
            {"id": "ch_a", "label": "A", "snapshot_chain_id": 101},
        ],
        "chains": [],
    }

    state = build_initial_authoritative_audio_state(
        detail,
        origin_node_id="MANAGEMENT-NODE-1",
        state_version=1,
        leader_epoch=3,
    )

    assert state.state_version == 1
    assert state.leader_epoch == 3
    assert state.source_snapshot is not None
    assert state.source_snapshot.snapshot_id == 7
    assert state.cluster.sync_status == "pending_apply"
    assert state.paths[0].status == "pending"
    assert state.paths[0].status_reason == "Awaiting node observation after desired-state publish"
    assert state.derived.inactive_messages == ["Channel A pending apply."]


def test_build_initial_authoritative_audio_state_preserves_existing_extensions():
    detail = {
        "id": 9,
        "name": "Brain Snapshot",
        "routing": {"mode": "series", "series_order": ["ch_a"]},
        "paths": [
            {"id": "ch_a", "label": "A", "snapshot_chain_id": 301},
        ],
        "chains": [],
    }

    state = build_initial_authoritative_audio_state(
        detail,
        origin_node_id="MANAGEMENT-NODE-1",
        state_version=4,
        leader_epoch=7,
        extensions={
            "performance_brain": {
                "instances": {
                    "instance-17__position-3": {
                        "runtime_instance_id": "instance-17__position-3",
                        "instance_id": "17",
                        "plugin_position": 3,
                    }
                }
            }
        },
    )

    assert state.extensions["performance_brain"]["instances"]["instance-17__position-3"]["instance_id"] == "17"
    assert state.desired.extensions["performance_brain"]["instances"]["instance-17__position-3"]["plugin_position"] == 3


def test_overlay_audio_state_extensions_replaces_snapshot_owned_namespace():
    merged = overlay_audio_state_extensions(
        {
            "performance_brain": {
                "instances": {
                    "instance-17__position-3": {
                        "runtime_instance_id": "instance-17__position-3",
                        "instance_id": "17",
                        "plugin_position": 3,
                    }
                }
            },
            "transport": {
                "tempo": 128.0,
            },
        },
        {
            "performance_brain": {
                "instances": {
                    "instance-18__position-4": {
                        "runtime_instance_id": "instance-18__position-4",
                        "instance_id": "18",
                        "plugin_position": 4,
                    }
                }
            }
        },
    )

    assert "instance-17__position-3" not in merged["performance_brain"]["instances"]
    assert merged["performance_brain"]["instances"]["instance-18__position-4"]["instance_id"] == "18"
    assert merged["transport"]["tempo"] == 128.0
