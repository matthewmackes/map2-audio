"""Runtime validator tests for the full v2026.04 graph document schema.

Companion to `tests/test_state_authority_graph.py` (which exercises the pre-rollout
validator surface) and `tests/test_snapshot_graph_schema.py` (which asserts
structural properties of the schema file). This module exercises the extended
validator in `app/services/state_authority_graph.py` against the new sections
added in Phase 1b: meta.community, graph.groups, graph.channels, morph.quad,
routing, effects_loops, controls (mappings + footswitch_labels), io, tempo,
output_safety, deployment, templates.
"""

from __future__ import annotations

import pytest

from app.services.state_authority_graph import (
    GraphDocumentValidationError,
    SNAPSHOT_GRAPH_VERSION,
    normalize_and_validate_graph_document,
    normalize_graph_document,
    validate_graph_document,
)


def _base_document(**overrides):
    doc = {
        "version": SNAPSHOT_GRAPH_VERSION,
        "meta": {"name": "Tonechaser", "type": "snapshot"},
        "graph": {
            "nodes": [],
            "edges": [],
            "morph": {
                "mode": "off",
                "position": 0.5,
                "source_channel_key": None,
                "target_channel_key": None,
            },
        },
    }
    doc.update(overrides)
    return doc


# --- morph.quad ---------------------------------------------------------------


def test_morph_quad_mode_requires_endpoints():
    doc = _base_document()
    doc["graph"]["morph"] = {"mode": "quad", "position": {"x": 0.5, "y": 0.5}}
    with pytest.raises(GraphDocumentValidationError) as exc_info:
        validate_graph_document(doc)
    assert "graph.morph.endpoints" in exc_info.value.path


def test_morph_quad_mode_accepts_abcd_endpoints_and_xy_position():
    doc = _base_document()
    doc["graph"]["morph"] = {
        "mode": "quad",
        "position": {"x": 0.25, "y": 0.75},
        "endpoints": {
            "A": {"node-1": {"gain": 0.3}},
            "B": {"node-1": {"gain": 0.9}},
            "C": {"node-1": {"gain": 0.5}},
            "D": {"node-1": {"gain": 0.7}},
        },
    }
    validate_graph_document(doc)  # does not raise


def test_morph_position_xy_must_be_in_range():
    doc = _base_document()
    doc["graph"]["morph"] = {
        "mode": "quad",
        "position": {"x": 1.5, "y": 0.5},
        "endpoints": {"A": {}},
    }
    with pytest.raises(GraphDocumentValidationError) as exc_info:
        validate_graph_document(doc)
    assert exc_info.value.path == "$.graph.morph.position.x"


def test_morph_endpoint_must_be_mapping_when_present():
    doc = _base_document()
    doc["graph"]["morph"] = {
        "mode": "quad",
        "position": {"x": 0.5, "y": 0.5},
        "endpoints": {"A": {"ok": {}}, "B": "not-a-map"},
    }
    with pytest.raises(GraphDocumentValidationError) as exc_info:
        validate_graph_document(doc)
    assert exc_info.value.path == "$.graph.morph.endpoints.B"


def test_normalize_preserves_quad_morph_endpoints_and_xy():
    doc = _base_document()
    doc["graph"]["morph"] = {
        "mode": "quad",
        "position": {"x": 0.1, "y": 0.9},
        "endpoints": {"A": {"node-1": {"gain": 0.3}}, "B": {"node-1": {"gain": 0.7}}},
        "source_mode": "intra",
    }
    normalized = normalize_graph_document(doc)
    morph = normalized["graph"]["morph"]
    assert morph["mode"] == "quad"
    assert morph["position"] == {"x": 0.1, "y": 0.9}
    assert morph["endpoints"] == {"A": {"node-1": {"gain": 0.3}}, "B": {"node-1": {"gain": 0.7}}}
    assert morph["source_mode"] == "intra"


# --- graph.groups -------------------------------------------------------------


def test_groups_type_must_be_parallel_or_series():
    doc = _base_document()
    doc["graph"]["groups"] = [{"id": "g1", "type": "invalid", "branches": [["n1"]]}]
    with pytest.raises(GraphDocumentValidationError) as exc_info:
        validate_graph_document(doc)
    assert exc_info.value.path == "$.graph.groups[0].type"


def test_groups_branches_must_be_list_of_node_arrays():
    doc = _base_document()
    doc["graph"]["groups"] = [{"id": "g1", "type": "parallel", "branches": "not-a-list"}]
    with pytest.raises(GraphDocumentValidationError) as exc_info:
        validate_graph_document(doc)
    assert exc_info.value.path == "$.graph.groups[0].branches"


def test_groups_blend_clamped_to_unit_interval():
    doc = _base_document()
    doc["graph"]["groups"] = [
        {"id": "g1", "type": "parallel", "branches": [["n1"]], "blend": 1.5}
    ]
    with pytest.raises(GraphDocumentValidationError):
        validate_graph_document(doc)


def test_groups_accept_well_formed_entry():
    doc = _base_document()
    doc["graph"]["groups"] = [
        {"id": "g1", "type": "parallel", "branches": [["n1"], ["n2"]], "blend": 0.5, "bypass": False}
    ]
    validate_graph_document(doc)


# --- graph.channels -----------------------------------------------------------


def test_channel_key_must_be_non_empty_string():
    """Runtime validator accepts any non-empty key for backward compatibility
    with legacy UUID-keyed channels. The schema file still documents ^[A-F]$
    as the preferred pattern for new tonechaser snapshots (tested in
    tests/test_snapshot_graph_schema.py)."""
    doc = _base_document()
    doc["graph"]["channels"] = [{"key": ""}]
    with pytest.raises(GraphDocumentValidationError) as exc_info:
        validate_graph_document(doc)
    assert exc_info.value.path == "$.graph.channels[0].key"


def test_channel_key_accepts_a_through_f_preferred_form():
    doc = _base_document()
    doc["graph"]["channels"] = [{"key": "A"}, {"key": "B"}, {"key": "C"}, {"key": "D"}, {"key": "E"}, {"key": "F"}]
    validate_graph_document(doc)


def test_channel_keys_must_be_unique():
    doc = _base_document()
    doc["graph"]["channels"] = [{"key": "A"}, {"key": "A"}]
    with pytest.raises(GraphDocumentValidationError) as exc_info:
        validate_graph_document(doc)
    assert "duplicate channel key" in str(exc_info.value)


def test_channel_dry_wet_mix_is_percentage():
    doc = _base_document()
    doc["graph"]["channels"] = [{"key": "A", "dry_wet_mix": 150.0}]
    with pytest.raises(GraphDocumentValidationError):
        validate_graph_document(doc)


def test_channel_chain_nodes_must_be_strings():
    doc = _base_document()
    doc["graph"]["channels"] = [{"key": "A", "chain_nodes": ["n1", 42]}]
    with pytest.raises(GraphDocumentValidationError) as exc_info:
        validate_graph_document(doc)
    assert exc_info.value.path == "$.graph.channels[0].chain_nodes[1]"


# --- routing ------------------------------------------------------------------


def test_routing_mode_enum_enforced():
    doc = _base_document(routing={"mode": "weird"})
    with pytest.raises(GraphDocumentValidationError) as exc_info:
        validate_graph_document(doc)
    assert exc_info.value.path == "$.routing.mode"


def test_routing_blend_positions_values_clamped_to_unit():
    doc = _base_document(
        routing={"mode": "parallel_blend", "blend_positions": {"A": 0.5, "B": 1.7}}
    )
    with pytest.raises(GraphDocumentValidationError):
        validate_graph_document(doc)


def test_routing_accepts_well_formed_payload():
    doc = _base_document(
        routing={
            "mode": "parallel_blend",
            "active_channel_key": "A",
            "blend_positions": {"A": 1.0, "B": 0.3},
            "series_order": ["A", "B"],
        }
    )
    validate_graph_document(doc)


# --- effects_loops ------------------------------------------------------------


def test_effects_loop_requires_id():
    doc = _base_document(effects_loops=[{}])
    with pytest.raises(GraphDocumentValidationError):
        validate_graph_document(doc)


def test_effects_loop_insertion_crossfade_ms_capped_at_500():
    doc = _base_document(
        effects_loops=[
            {
                "id": "loop_1",
                "insertions": [{"after_node": "n1", "enabled": True, "crossfade_ms": 1000}],
            }
        ]
    )
    with pytest.raises(GraphDocumentValidationError) as exc_info:
        validate_graph_document(doc)
    assert "crossfade_ms" in exc_info.value.path


def test_effects_loop_insertion_mode_enum():
    doc = _base_document(
        effects_loops=[
            {
                "id": "loop_1",
                "insertions": [{"after_node": "n1", "enabled": True, "mode": "chaos"}],
            }
        ]
    )
    with pytest.raises(GraphDocumentValidationError):
        validate_graph_document(doc)


def test_effects_loop_accepts_valid_entry():
    doc = _base_document(
        effects_loops=[
            {
                "id": "loop_1",
                "label": "External Loop 1",
                "send_device": "dev:uuid:abc",
                "send_channel": 3,
                "return_device": "dev:uuid:abc",
                "return_channel": 4,
                "insertions": [
                    {
                        "after_node": "n1",
                        "enabled": True,
                        "mode": "serial_insert",
                        "blend_pct": 100.0,
                        "send_gain_db": 0.0,
                        "return_gain_db": 0.0,
                        "crossfade_ms": 10,
                    }
                ],
            }
        ]
    )
    validate_graph_document(doc)


# --- controls -----------------------------------------------------------------


def test_control_mapping_source_type_must_be_known():
    doc = _base_document(
        controls={
            "mappings": [
                {"source": {"type": "telepathy"}, "target": "/morph/x"}
            ]
        }
    )
    with pytest.raises(GraphDocumentValidationError) as exc_info:
        validate_graph_document(doc)
    assert exc_info.value.path == "$.controls.mappings[0].source.type"


def test_control_mapping_target_required():
    doc = _base_document(
        controls={
            "mappings": [{"source": {"type": "midi_cc", "channel": 1, "cc": 74}, "target": ""}]
        }
    )
    with pytest.raises(GraphDocumentValidationError):
        validate_graph_document(doc)


def test_control_mapping_curve_enum_enforced():
    doc = _base_document(
        controls={
            "mappings": [
                {
                    "source": {"type": "midi_cc", "channel": 1, "cc": 74},
                    "target": "/morph/x",
                    "curve": "quadratic",
                }
            ]
        }
    )
    with pytest.raises(GraphDocumentValidationError):
        validate_graph_document(doc)


def test_controls_accept_full_set_of_day1_sources():
    doc = _base_document(
        controls={
            "mappings": [
                {"source": {"type": "midi_cc", "channel": 1, "cc": 74}, "target": "/a", "curve": "linear"},
                {"source": {"type": "expression", "pedal": 0}, "target": "/b", "curve": "logarithmic"},
                {"source": {"type": "osc", "path": "/1/fader1"}, "target": "/morph/x"},
                {"source": {"type": "gpio", "pin": 4, "mode": "momentary"}, "target": "/c", "curve": "toggle"},
                {"source": {"type": "maschine_encoder", "encoder": 1}, "target": "/d"},
            ],
            "footswitch_labels": {"1": "Boost", "2": "Delay"},
            "controller_display": {"layout": "4x2", "pages": []},
        }
    )
    validate_graph_document(doc)


def test_footswitch_labels_must_be_strings():
    doc = _base_document(controls={"footswitch_labels": {"1": 42}})
    with pytest.raises(GraphDocumentValidationError):
        validate_graph_document(doc)


# --- io, tempo, output_safety -------------------------------------------------


def test_io_monitoring_output_index_must_be_int():
    doc = _base_document(io={"monitoring_output_index": "first"})
    with pytest.raises(GraphDocumentValidationError):
        validate_graph_document(doc)


def test_tempo_bpm_must_be_in_musical_range():
    doc = _base_document(tempo={"bpm": 10.0})
    with pytest.raises(GraphDocumentValidationError):
        validate_graph_document(doc)


def test_tempo_bpm_accepts_typical_gig_range():
    for bpm in (60.0, 90.0, 120.0, 180.0, 240.0):
        doc = _base_document(tempo={"bpm": bpm})
        validate_graph_document(doc)


def test_output_safety_reference_dbfs_must_be_non_positive():
    doc = _base_document(output_safety={"reference_dbfs": 1.0})
    with pytest.raises(GraphDocumentValidationError):
        validate_graph_document(doc)


def test_output_safety_accepts_well_formed():
    doc = _base_document(output_safety={"reference_dbfs": -18.0, "warning_threshold_db": 3.0})
    validate_graph_document(doc)


# --- deployment ---------------------------------------------------------------


def test_deployment_status_enum_enforced():
    doc = _base_document(deployment={"status": "on-fire"})
    with pytest.raises(GraphDocumentValidationError):
        validate_graph_document(doc)


def test_deployment_strategy_enum_enforced():
    doc = _base_document(deployment={"strategy": "chaotic"})
    with pytest.raises(GraphDocumentValidationError):
        validate_graph_document(doc)


def test_deployment_history_capped_at_twenty_entries():
    doc = _base_document(
        deployment={
            "history": [
                {"timestamp": f"2026-04-{22 + i:02d}T12:00:00Z", "action": "deployed"}
                for i in range(21)
            ]
        }
    )
    with pytest.raises(GraphDocumentValidationError) as exc_info:
        validate_graph_document(doc)
    assert exc_info.value.path == "$.deployment.history"


def test_deployment_accepts_full_envelope():
    doc = _base_document(
        deployment={
            "primary_node_id": "node-001",
            "standby_node_ids": ["node-002"],
            "status": "active",
            "strategy": "manual",
            "redundancy_enabled": True,
            "history": [
                {
                    "timestamp": "2026-04-22T12:00:00Z",
                    "action": "deployed",
                    "node_id": "node-001",
                    "status": "success",
                }
            ],
        }
    )
    validate_graph_document(doc)


# --- templates ----------------------------------------------------------------


def test_templates_overlays_must_be_string_array():
    doc = _base_document(templates={"overlays": [42]})
    with pytest.raises(GraphDocumentValidationError):
        validate_graph_document(doc)


def test_templates_accept_well_formed():
    doc = _base_document(templates={"base": "tmpl-001", "overlays": ["ov-1"], "linked": True})
    validate_graph_document(doc)


# --- canonical example from the plan round-trips through the validator --------


def test_canonical_plan_example_normalizes_and_validates():
    """Sanity check — the graph-doc example from the plan must pass validation
    end-to-end once normalized."""
    doc = {
        "version": "2026.04",
        "meta": {
            "name": "Sunday Worship Lead",
            "description": "Clean tone with ambient reverb",
            "tags": ["nam", "reverb", "worship"],
            "program_number": 1,
            "type": "snapshot",
            "is_favorite": True,
            "is_locked": False,
            "display_order": 0,
            "community": {
                "uuid": "550e8400-e29b-41d4-a716-446655440000",
                "shared": False,
                "author": "Anonymous",
                "download_count": 0,
                "rating_sum": 0.0,
                "rating_count": 0,
            },
        },
        "graph": {
            "nodes": [
                {
                    "id": "node-1",
                    "uri": "map2:fx:nam",
                    "name": "NAM Mesa Boogie",
                    "parameters": {"gain": 0.7},
                    "state": {},
                    "bypass": False,
                }
            ],
            "edges": [
                {"from": "input:audio_out_0", "to": "node-1:audio_in_0", "port_kind": "audio"}
            ],
            "groups": [
                {"id": "g1", "type": "parallel", "branches": [["node-1"]], "blend": 0.5, "bypass": False}
            ],
            "channels": [
                {"key": "A", "label": "Clean Lead", "color": "#2563eb", "muted": False, "solo": False, "dry_wet_mix": 100.0, "chain_nodes": ["node-1"]}
            ],
            "morph": {
                "mode": "quad",
                "position": {"x": 0.5, "y": 0.5},
                "endpoints": {
                    "A": {"node-1": {"gain": 0.3}},
                    "B": {"node-1": {"gain": 0.9}},
                    "C": {"node-1": {"gain": 0.5}},
                    "D": {"node-1": {"gain": 0.7}},
                },
                "source_mode": "intra",
            },
        },
        "routing": {
            "mode": "parallel_blend",
            "active_channel_key": "A",
            "blend_positions": {"A": 1.0},
            "series_order": ["A"],
        },
        "effects_loops": [
            {
                "id": "loop_1",
                "label": "External Loop 1",
                "send_device": "dev:uuid:abc",
                "send_channel": 3,
                "return_device": "dev:uuid:abc",
                "return_channel": 4,
                "insertions": [
                    {
                        "after_node": "node-1",
                        "enabled": True,
                        "mode": "serial_insert",
                        "blend_pct": 100.0,
                        "crossfade_ms": 10,
                    }
                ],
            }
        ],
        "controls": {
            "mappings": [
                {
                    "source": {"type": "midi_cc", "channel": 1, "cc": 74},
                    "target": "/channel/A/node/node-1/param/gain",
                    "range": [0.0, 1.0],
                    "curve": "linear",
                }
            ],
            "footswitch_labels": {"1": "Boost", "2": "Delay"},
            "controller_display": {"layout": "4x2", "pages": []},
        },
        "io": {"input_device": "dev:uuid:ua1000-in", "output_device": "dev:uuid:ua1000-out", "monitoring_output_index": 0},
        "tempo": {"bpm": 120.0},
        "output_safety": {"reference_dbfs": -18.0, "warning_threshold_db": 3.0},
        "deployment": {
            "primary_node_id": "node-001",
            "standby_node_ids": ["node-002"],
            "status": "active",
            "strategy": "manual",
            "redundancy_enabled": True,
            "history": [{"timestamp": "2026-04-22T12:00:00Z", "action": "deployed"}],
        },
        "templates": {"base": None, "overlays": [], "linked": True},
    }
    normalized = normalize_and_validate_graph_document(doc)
    assert normalized["graph"]["morph"]["mode"] == "quad"
    assert normalized["graph"]["morph"]["position"] == {"x": 0.5, "y": 0.5}
    assert normalized["routing"]["active_channel_key"] == "A"
    assert normalized["tempo"]["bpm"] == 120.0
