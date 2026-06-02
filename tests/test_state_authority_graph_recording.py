"""Snapshot graph `recording` block — T2506 (phase 2 of T2504).

Covers:
  * v2026.04 → current-version migration injects `recording=None`.
  * Schema title pins to the current SNAPSHOT_GRAPH_VERSION (v2026.06 as of T2510-0).
  * `normalize_graph_document` produces the canonical 6-field `recording`
    layout when supplied a partial dict.
  * `validate_graph_document` accepts both `null` and the full-shape
    `recording` block (post-migration).
  * `compile_snapshot_detail_to_intent` surfaces `record_session_id` and
    `tap_matrix` on the compiled intent so the JUCE engine + recorder
    service can install/uninstall T2507 taps.

This file is filed under T2506-5 of the T2504 Multi-Track Recorder epic.
"""

from __future__ import annotations

from app.models.audio_state import CompiledSnapshotIntent
from app.services.audio_state_snapshot_compiler import compile_snapshot_detail_to_intent
from app.services.state_authority_graph import (
    ACCEPTED_LEGACY_GRAPH_VERSIONS,
    SNAPSHOT_GRAPH_VERSION,
    load_snapshot_graph_schema,
    normalize_and_validate_graph_document,
    normalize_graph_document,
    validate_graph_document,
)


# ---------------------------------------------------------------------------
# Schema version + title (T2506-1 acceptance)
# ---------------------------------------------------------------------------


def test_schema_version_pinned_to_2026_06():
    # T2510-0 bumped 2026.05 → 2026.06 (channel.cluster_owner_node_id). Per the
    # pre-release no-migration directive, 2026.05 is intentionally NOT a legacy
    # input version — there are no documents to migrate.
    assert SNAPSHOT_GRAPH_VERSION == "2026.06"


def test_legacy_graph_versions_accept_2026_04():
    assert "2026.04" in ACCEPTED_LEGACY_GRAPH_VERSIONS
    # 2026.05 is NOT carried as a legacy input (no migration; see T2510-0).
    assert "2026.05" not in ACCEPTED_LEGACY_GRAPH_VERSIONS


def test_schema_title_pins_to_v2026_06():
    schema = load_snapshot_graph_schema()
    assert schema["title"] == "MAP2 Snapshot Graph v2026.06"
    assert schema["properties"]["version"]["const"] == "2026.06"


def test_schema_has_top_level_recording_block_with_oneof_null_or_object():
    schema = load_snapshot_graph_schema()
    recording = schema["properties"]["recording"]
    assert "oneOf" in recording
    assert {"type": "null"} in recording["oneOf"]
    object_branch = next(
        branch for branch in recording["oneOf"] if branch.get("type") == "object"
    )
    required = set(object_branch["required"])
    assert {
        "armed",
        "rolling",
        "session_id",
        "started_at",
        "participating_nodes",
        "tap_matrix",
    } == required


# ---------------------------------------------------------------------------
# Migration: v2026.04 → current version (T2506-2 acceptance). The only accepted
# legacy input is 2026.04; it upcasts to whatever SNAPSHOT_GRAPH_VERSION is now.
# ---------------------------------------------------------------------------


def test_v2026_04_document_migrates_to_current_version_with_recording_null():
    document = {
        "version": "2026.04",
        "meta": {"name": "Legacy Tone", "type": "snapshot"},
        "graph": {"nodes": [], "edges": []},
    }

    normalized = normalize_graph_document(document)

    assert normalized["version"] == SNAPSHOT_GRAPH_VERSION
    assert normalized["recording"] is None


def test_v2026_04_document_round_trips_through_validate():
    document = {
        "version": "2026.04",
        "meta": {"name": "Legacy Tone", "type": "snapshot"},
        "graph": {"nodes": [], "edges": []},
    }

    normalized = normalize_and_validate_graph_document(document)

    assert normalized["version"] == SNAPSHOT_GRAPH_VERSION
    assert normalized["recording"] is None


def test_current_version_document_with_existing_recording_passes_through():
    document = {
        "version": SNAPSHOT_GRAPH_VERSION,
        "meta": {"name": "Recording Tone", "type": "snapshot"},
        "graph": {"nodes": [], "edges": []},
        "recording": {
            "session_id": "sess-7f2a",
            "armed": True,
            "rolling": False,
            "started_at": "2026-05-11T18:00:00Z",
            "participating_nodes": ["map2-prod-01"],
            "tap_matrix": {
                "chain-rhythm": {"pre_fx": True, "post_fx": True},
            },
        },
    }

    normalized = normalize_and_validate_graph_document(document)

    assert normalized["version"] == SNAPSHOT_GRAPH_VERSION
    assert normalized["recording"]["session_id"] == "sess-7f2a"
    assert normalized["recording"]["armed"] is True
    assert normalized["recording"]["rolling"] is False
    assert normalized["recording"]["tap_matrix"]["chain-rhythm"] == {
        "pre_fx": True,
        "post_fx": True,
    }


def test_normalize_coerces_partial_recording_dict_to_canonical_six_fields():
    document = {
        "version": SNAPSHOT_GRAPH_VERSION,
        "meta": {"name": "Partial Recording", "type": "snapshot"},
        "graph": {"nodes": [], "edges": []},
        # Only `armed` supplied — every other field must default safely.
        "recording": {"armed": True},
    }

    normalized = normalize_graph_document(document)

    recording = normalized["recording"]
    assert recording == {
        "session_id": None,
        "armed": True,
        "rolling": False,
        "started_at": None,
        "participating_nodes": [],
        "tap_matrix": {},
    }


def test_normalize_drops_malformed_tap_matrix_entries():
    document = {
        "version": SNAPSHOT_GRAPH_VERSION,
        "meta": {"name": "Dirty Matrix", "type": "snapshot"},
        "graph": {"nodes": [], "edges": []},
        "recording": {
            "session_id": "sess-1",
            "armed": True,
            "rolling": True,
            "started_at": "2026-05-11T18:30:00Z",
            "participating_nodes": ["map2-prod-01", "", "  ", "map2-prod-02"],
            "tap_matrix": {
                "chain-rhythm": {"pre_fx": True, "post_fx": False},
                "": {"pre_fx": True, "post_fx": True},  # blank chain id — drop
                "chain-bad": "not-a-mapping",  # wrong shape — drop
                "chain-defaults": {},  # both default False
            },
        },
    }

    normalized = normalize_graph_document(document)

    recording = normalized["recording"]
    assert recording["participating_nodes"] == ["map2-prod-01", "map2-prod-02"]
    assert recording["tap_matrix"] == {
        "chain-rhythm": {"pre_fx": True, "post_fx": False},
        "chain-defaults": {"pre_fx": False, "post_fx": False},
    }


def test_validate_rejects_recording_when_required_field_missing_post_migration():
    # Migration injects `recording=None` when source is v2026.04, but if a
    # caller hand-builds a current-version doc with a malformed recording
    # mapping, the canonicalization fills in the 6 required fields. A truly
    # invalid doc (e.g. an int) is coerced back to None.
    document = {
        "version": SNAPSHOT_GRAPH_VERSION,
        "meta": {"name": "Garbage Recording", "type": "snapshot"},
        "graph": {"nodes": [], "edges": []},
        "recording": 42,  # not a Mapping
    }

    normalized = normalize_and_validate_graph_document(document)

    assert normalized["recording"] is None


# ---------------------------------------------------------------------------
# CompiledSnapshotIntent surfacing (T2506-3 acceptance)
# ---------------------------------------------------------------------------


def _minimal_snapshot_detail(*, recording: dict | None = None) -> dict:
    detail: dict = {
        "id": 7,
        "revision_number": 1,
        "name": "Recording Snapshot",
        "io_bindings": {"input_device": "Edirol", "output_device": "Edirol"},
        "routing": {"mode": "series", "active_channel_key": "A"},
        "chains": [{"id": "chain-rhythm"}],
    }
    if recording is not None:
        detail["recording"] = recording
    return detail


def test_compile_intent_defaults_record_session_id_and_tap_matrix_to_none_and_empty():
    intent = compile_snapshot_detail_to_intent(_minimal_snapshot_detail())

    assert isinstance(intent, CompiledSnapshotIntent)
    assert intent.record_session_id is None
    assert intent.tap_matrix == {}


def test_compile_intent_surfaces_record_session_id_and_tap_matrix_from_recording_block():
    detail = _minimal_snapshot_detail(
        recording={
            "session_id": "sess-42",
            "armed": True,
            "rolling": True,
            "started_at": "2026-05-11T19:00:00Z",
            "participating_nodes": ["map2-prod-01"],
            "tap_matrix": {
                "chain-rhythm": {"pre_fx": True, "post_fx": True},
                "chain-lead": {"pre_fx": False, "post_fx": True},
            },
        }
    )

    intent = compile_snapshot_detail_to_intent(detail)

    assert intent.record_session_id == "sess-42"
    assert intent.tap_matrix == {
        "chain-rhythm": {"pre_fx": True, "post_fx": True},
        "chain-lead": {"pre_fx": False, "post_fx": True},
    }


def test_compile_intent_ignores_non_dict_tap_matrix_entries():
    detail = _minimal_snapshot_detail(
        recording={
            "session_id": "sess-99",
            "armed": False,
            "rolling": False,
            "started_at": None,
            "participating_nodes": [],
            "tap_matrix": {
                "chain-rhythm": {"pre_fx": True, "post_fx": False},
                "": {"pre_fx": True, "post_fx": True},  # blank id — drop
                "chain-bad": "not-a-mapping",  # bad shape — drop
            },
        }
    )

    intent = compile_snapshot_detail_to_intent(detail)

    assert intent.record_session_id == "sess-99"
    assert intent.tap_matrix == {"chain-rhythm": {"pre_fx": True, "post_fx": False}}


def test_compile_intent_strips_blank_session_id_to_none():
    detail = _minimal_snapshot_detail(
        recording={
            "session_id": "   ",
            "armed": True,
            "rolling": False,
            "started_at": None,
            "participating_nodes": [],
            "tap_matrix": {},
        }
    )

    intent = compile_snapshot_detail_to_intent(detail)

    assert intent.record_session_id is None
    assert intent.tap_matrix == {}
