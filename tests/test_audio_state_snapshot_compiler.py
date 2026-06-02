from app.services.audio_state_snapshot_compiler import (
    _coerce_snapshot_paths,
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
        "name": "Sequencer Snapshot",
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
            "sequencer": {
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

    assert state.extensions["sequencer"]["instances"]["instance-17__position-3"]["instance_id"] == "17"
    assert state.desired.extensions["sequencer"]["instances"]["instance-17__position-3"]["plugin_position"] == 3


# --- T2510-0: per-chain cluster owner resolution -----------------------------


def test_channel_with_null_owner_resolves_to_deployment_primary_node_id():
    detail = {
        "id": 11,
        "name": "Cluster Snapshot",
        "deployments": [{"primary_node_id": "MANAGEMENT-NODE-1"}],
        "channels": [
            {"channel_key": "A"},  # no cluster_owner_node_id — inherit primary
        ],
    }

    paths = _coerce_snapshot_paths(detail)

    assert paths[0]["id"] == "A"
    assert paths[0]["cluster_owner_node_id"] == "MANAGEMENT-NODE-1"


def test_channel_with_explicit_owner_keeps_it_over_deployment_primary():
    detail = {
        "id": 12,
        "name": "Cluster Snapshot",
        "deployments": [{"primary_node_id": "MANAGEMENT-NODE-1"}],
        "channels": [
            {"channel_key": "A", "cluster_owner_node_id": "AUDIO-NODE-7"},
        ],
    }

    paths = _coerce_snapshot_paths(detail)

    assert paths[0]["cluster_owner_node_id"] == "AUDIO-NODE-7"


def test_channel_owner_stays_none_when_no_deployment_primary_bound():
    detail = {
        "id": 13,
        "name": "Local-Only Snapshot",
        "channels": [
            {"channel_key": "A"},
        ],
    }

    paths = _coerce_snapshot_paths(detail)

    assert paths[0]["cluster_owner_node_id"] is None


def test_channel_blank_owner_falls_back_to_deployment_primary():
    detail = {
        "id": 14,
        "name": "Cluster Snapshot",
        "deployments": [{"primary_node_id": "MANAGEMENT-NODE-1"}],
        "channels": [
            {"channel_key": "A", "cluster_owner_node_id": "   "},  # blank — inherit
        ],
    }

    paths = _coerce_snapshot_paths(detail)

    assert paths[0]["cluster_owner_node_id"] == "MANAGEMENT-NODE-1"


def test_mixed_channel_owners_resolve_per_chain():
    detail = {
        "id": 15,
        "name": "Mixed Cluster Snapshot",
        "deployments": [{"primary_node_id": "MANAGEMENT-NODE-1"}],
        "channels": [
            {"channel_key": "A", "cluster_owner_node_id": "AUDIO-NODE-7"},
            {"channel_key": "B"},  # inherit primary
        ],
    }

    paths = _coerce_snapshot_paths(detail)

    owners = {path["id"]: path["cluster_owner_node_id"] for path in paths}
    assert owners == {"A": "AUDIO-NODE-7", "B": "MANAGEMENT-NODE-1"}


def test_overlay_audio_state_extensions_replaces_snapshot_owned_namespace():
    merged = overlay_audio_state_extensions(
        {
            "sequencer": {
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
            "sequencer": {
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

    assert "instance-17__position-3" not in merged["sequencer"]["instances"]
    assert merged["sequencer"]["instances"]["instance-18__position-4"]["instance_id"] == "18"
    assert merged["transport"]["tempo"] == 128.0
