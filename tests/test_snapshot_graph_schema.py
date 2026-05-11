"""Schema-level tests for the MAP2 Snapshot Graph v2026.05 monolithic schema.

These tests exercise the `schemas/snapshot-graph-v1.schema.json` file directly,
confirming that every locked design decision from the State Authority plan
(Q1–Q100) is captured by a discoverable, enforceable rule in the schema
definition itself. They are intentionally schema-structure tests, not
validator-behavior tests — the validator tests live in
`tests/test_state_authority_graph.py` and exercise runtime acceptance/rejection.
"""

from __future__ import annotations

import json

from app.services.state_authority_graph import (
    SNAPSHOT_GRAPH_SCHEMA_PATH,
    SNAPSHOT_GRAPH_VERSION,
    load_snapshot_graph_schema,
)


def _schema() -> dict:
    return load_snapshot_graph_schema()


def test_schema_version_constant_matches_module_constant():
    schema = _schema()
    assert schema["properties"]["version"]["const"] == SNAPSHOT_GRAPH_VERSION


def test_schema_declares_top_level_required_fields():
    schema = _schema()
    assert sorted(schema["required"]) == ["graph", "meta", "version"]


def test_schema_meta_includes_community_envelope():
    meta = _schema()["properties"]["meta"]["properties"]
    assert "community" in meta
    community = meta["community"]["properties"]
    for field in ("uuid", "shared", "author", "download_count", "rating_sum", "rating_count"):
        assert field in community, f"meta.community.{field} missing from schema"


def test_schema_meta_includes_identity_and_ordering_fields():
    meta = _schema()["properties"]["meta"]["properties"]
    for field in (
        "name",
        "description",
        "tags",
        "program_number",
        "type",
        "is_favorite",
        "is_locked",
        "display_order",
        "derived_from_snapshot_id",
        "io_bindings",
    ):
        assert field in meta, f"meta.{field} missing from schema"


def test_schema_graph_requires_nodes_and_edges():
    graph = _schema()["properties"]["graph"]
    assert sorted(graph["required"]) == ["edges", "nodes"]


def test_schema_graph_nodes_enforce_map2_uri_pattern_with_third_party_fallback():
    uri_pattern = _schema()["properties"]["graph"]["properties"]["nodes"]["items"]["properties"]["uri"]["pattern"]
    import re
    compiled = re.compile(uri_pattern)
    assert compiled.fullmatch("map2:fx:nam")
    assert compiled.fullmatch("map2:io:input")
    assert compiled.fullmatch("map2:sys:output-limiter")
    assert compiled.fullmatch("map2:ctrl:morph")
    assert compiled.fullmatch("http://distrho.sf.net/plugins/MVerb")
    assert compiled.fullmatch("urn:test:plugin")
    assert compiled.fullmatch("map2:fx:nam") is not None
    # Invalid URIs must not match
    assert not compiled.fullmatch("not-a-uri")
    assert not compiled.fullmatch("map2:unknown:x")


def test_schema_graph_edge_port_kind_enum_covers_audio_sidechain_control():
    edges_item = _schema()["properties"]["graph"]["properties"]["edges"]["items"]
    port_kinds = edges_item["properties"]["port_kind"]["enum"]
    assert sorted(port_kinds) == ["audio", "control", "sidechain"]


def test_schema_graph_groups_support_parallel_and_series():
    groups = _schema()["properties"]["graph"]["properties"]["groups"]
    items = groups["items"]
    assert sorted(items["required"]) == ["branches", "id", "type"]
    assert sorted(items["properties"]["type"]["enum"]) == ["parallel", "series"]


def test_schema_graph_channels_restrict_keys_to_a_through_f():
    channels = _schema()["properties"]["graph"]["properties"]["channels"]["items"]
    assert channels["properties"]["key"]["pattern"] == "^[A-F]$"


def test_schema_morph_mode_includes_quad_for_abcd_workflow():
    morph = _schema()["properties"]["graph"]["properties"]["morph"]["properties"]
    modes = morph["mode"]["enum"]
    assert "quad" in modes
    assert "off" in modes
    # Legacy modes preserved for backward compatibility
    assert "intra_snapshot" in modes
    assert "cross_snapshot" in modes


def test_schema_morph_position_accepts_scalar_and_xy_object():
    position = _schema()["properties"]["graph"]["properties"]["morph"]["properties"]["position"]
    oneof = position["oneOf"]
    assert len(oneof) == 2
    scalar = next(branch for branch in oneof if branch.get("type") == "number")
    xy_object = next(branch for branch in oneof if branch.get("type") == "object")
    assert scalar["minimum"] == 0.0 and scalar["maximum"] == 1.0
    assert sorted(xy_object["required"]) == ["x", "y"]
    assert xy_object["properties"]["x"]["maximum"] == 1.0
    assert xy_object["properties"]["y"]["maximum"] == 1.0


def test_schema_morph_endpoints_expose_abcd_parameter_maps():
    morph = _schema()["properties"]["graph"]["properties"]["morph"]["properties"]
    endpoints = morph["endpoints"]["properties"]
    assert sorted(endpoints.keys()) == ["A", "B", "C", "D"]


def test_schema_routing_modes_cover_parallel_series_single():
    routing = _schema()["properties"]["routing"]["properties"]
    assert sorted(routing["mode"]["enum"]) == ["parallel_blend", "series", "single"]


def test_schema_effects_loops_require_id_and_support_insertions():
    loop = _schema()["properties"]["effects_loops"]["items"]
    assert sorted(loop["required"]) == ["id"]
    insertion = loop["properties"]["insertions"]["items"]
    assert sorted(insertion["required"]) == ["after_node", "enabled"]
    assert sorted(insertion["properties"]["mode"]["enum"]) == ["parallel_send", "serial_insert"]
    assert insertion["properties"]["crossfade_ms"]["maximum"] == 500


def test_schema_controls_mapping_source_covers_all_day1_types():
    source_types = _schema()["properties"]["controls"]["properties"]["mappings"]["items"]["properties"]["source"]["properties"]["type"]["enum"]
    for required_type in (
        "midi_cc",
        "midi_pc",
        "midi_note",
        "expression",
        "maschine_encoder",
        "maschine_pad",
        "osc",
        "gpio",
    ):
        assert required_type in source_types, f"control source '{required_type}' missing"


def test_schema_controls_mapping_target_is_osc_path_string():
    target = _schema()["properties"]["controls"]["properties"]["mappings"]["items"]["properties"]["target"]
    assert target["type"] == "string"
    assert target["minLength"] == 1


def test_schema_controls_curve_enum_is_complete():
    curve = _schema()["properties"]["controls"]["properties"]["mappings"]["items"]["properties"]["curve"]
    assert sorted(curve["enum"]) == [
        "exponential",
        "linear",
        "logarithmic",
        "stepped",
        "toggle",
    ]


def test_schema_io_section_includes_input_output_monitoring():
    io = _schema()["properties"]["io"]["properties"]
    for field in ("input_device", "output_device", "monitoring_output_index"):
        assert field in io, f"io.{field} missing from schema"


def test_schema_tempo_bpm_bounded_to_musical_range():
    bpm = _schema()["properties"]["tempo"]["properties"]["bpm"]
    assert bpm["minimum"] == 20.0
    assert bpm["maximum"] == 300.0


def test_schema_output_safety_rejects_non_negative_reference_dbfs():
    ref = _schema()["properties"]["output_safety"]["properties"]["reference_dbfs"]
    assert ref["maximum"] == 0.0


def test_schema_deployment_status_covers_lifecycle_phases():
    status = _schema()["properties"]["deployment"]["properties"]["status"]
    assert sorted(status["enum"]) == ["active", "draft", "failing", "retired", "staged"]


def test_schema_deployment_history_capped_at_twenty_entries():
    history = _schema()["properties"]["deployment"]["properties"]["history"]
    assert history["maxItems"] == 20


def test_schema_templates_support_base_overlays_and_linked_flag():
    templates = _schema()["properties"]["templates"]["properties"]
    for field in ("base", "overlays", "linked"):
        assert field in templates, f"templates.{field} missing from schema"


def test_schema_assets_require_sha256_hash_pattern():
    asset = _schema()["properties"]["assets"]["items"]
    hash_pattern = asset["properties"]["hash"]["pattern"]
    assert hash_pattern == "^sha256:[a-f0-9]{64}$"
    assert sorted(asset["required"]) == ["hash", "name", "path", "size_bytes", "type"]


def test_schema_file_passes_draft_2020_12_declaration():
    schema = json.loads(SNAPSHOT_GRAPH_SCHEMA_PATH.read_text(encoding="utf-8"))
    assert schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"
    assert schema["title"] == "MAP2 Snapshot Graph v2026.05"
