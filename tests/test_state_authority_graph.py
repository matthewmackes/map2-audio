from __future__ import annotations

import hashlib
import json

from app.services.state_authority_graph import (
    GraphDocumentValidationError,
    SNAPSHOT_GRAPH_SCHEMA_PATH,
    SNAPSHOT_GRAPH_VERSION,
    canonicalize_plugin_uri,
    extract_asset_references,
    load_snapshot_graph_schema,
    normalize_and_validate_graph_document,
    normalize_graph_document,
    register_asset_file,
    validate_graph_document,
)


def test_load_snapshot_graph_schema_reads_monolithic_schema_file():
    schema = load_snapshot_graph_schema()

    assert SNAPSHOT_GRAPH_SCHEMA_PATH.exists()
    assert schema["title"] == "MAP2 Snapshot Graph v2026.04"
    assert schema["properties"]["graph"]["properties"]["nodes"]["items"]["properties"]["uri"]["pattern"].startswith("^")


def test_canonicalize_plugin_uri_maps_legacy_map2_and_urn_variants():
    assert canonicalize_plugin_uri("map2://juce/nam") == "map2:fx:nam"
    assert canonicalize_plugin_uri("map2://juce/convolution/cabinet") == "map2:fx:cabinet-ir"
    assert canonicalize_plugin_uri("map2://juce/modulation/phaser") == "map2:fx:phaser"
    assert canonicalize_plugin_uri("map2://io/input") == "map2:io:input"
    assert canonicalize_plugin_uri("urn:map2:ir-reverb") == "map2:fx:reverb-ir"
    assert canonicalize_plugin_uri("urn:test:plugin") == "urn:test:plugin"


def test_register_asset_file_builds_content_addressed_entry(tmp_path):
    asset_path = tmp_path / "Mesa_Boogie_DC5.nam"
    asset_path.write_text("amp-model", encoding="utf-8")

    entry = register_asset_file(asset_path, asset_type="nam-model")

    assert entry.file_name == "Mesa_Boogie_DC5.nam"
    assert entry.asset_type == "nam-model"
    assert entry.size_bytes == len("amp-model")
    assert entry.asset_hash == f"sha256:{hashlib.sha256(b'amp-model').hexdigest()}"


def test_normalize_graph_document_canonicalizes_uris_and_asset_paths(tmp_path):
    asset_path = tmp_path / "Mesa_4x12.wav"
    asset_path.write_bytes(b"ir-data")
    expected_hash = f"sha256:{hashlib.sha256(b'ir-data').hexdigest()}"

    document = {
        "meta": {"name": "Lead", "type": "snapshot"},
        "graph": {
            "nodes": [
                {
                    "id": "node-1",
                    "uri": "map2://juce/convolution/cabinet",
                    "name": "Cab",
                    "parameters": {"mix": 1.0},
                    "state": {"map2:state:ir_path": str(asset_path)},
                }
            ],
            "edges": [],
        },
    }

    normalized = normalize_graph_document(document)

    assert normalized["version"] == SNAPSHOT_GRAPH_VERSION
    assert normalized["graph"]["nodes"][0]["uri"] == "map2:fx:cabinet-ir"
    assert normalized["graph"]["nodes"][0]["state"]["map2:state:ir_path"] == expected_hash
    assert normalized["assets"] == [
        {
            "hash": expected_hash,
            "name": "Mesa_4x12.wav",
            "path": str(asset_path.resolve()),
            "size_bytes": len(b"ir-data"),
            "type": "impulse-response",
        }
    ]
    assert extract_asset_references(normalized) == {expected_hash}
    assert normalized["graph"]["morph"] == {
        "mode": "off",
        "position": 0.5,
        "source_channel_key": None,
        "target_channel_key": None,
    }


def test_normalize_graph_document_clamps_and_normalizes_morph_block():
    document = {
        "meta": {"name": "Lead", "type": "snapshot"},
        "graph": {
            "nodes": [],
            "edges": [],
            "morph": {
                "mode": "Intra_Snapshot",
                "position": 2.0,
                "source_channel_key": " channel-a ",
                "target_channel_key": "",
            },
        },
    }

    normalized = normalize_graph_document(document)

    assert normalized["graph"]["morph"] == {
        "mode": "intra_snapshot",
        "position": 1.0,
        "source_channel_key": "channel-a",
        "target_channel_key": None,
    }


def test_schema_file_is_valid_json():
    schema = json.loads(SNAPSHOT_GRAPH_SCHEMA_PATH.read_text(encoding="utf-8"))

    assert schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"


def test_normalize_and_validate_graph_document_rejects_invalid_uri_with_guidance():
    document = {
        "version": SNAPSHOT_GRAPH_VERSION,
        "meta": {"name": "Broken", "type": "snapshot"},
        "graph": {
            "nodes": [
                {
                    "id": "node-1",
                    "uri": "not-a-valid-uri",
                    "name": "Broken Node",
                    "parameters": {},
                    "state": {},
                }
            ],
            "edges": [],
        },
    }

    try:
        normalize_and_validate_graph_document(document)
    except GraphDocumentValidationError as exc:
        assert exc.path == "$.graph.nodes[0].uri"
        assert "locked schema pattern" in str(exc)
        assert "canonical map2:{type}:{name}" in exc.guidance
    else:
        raise AssertionError("Invalid graph document should fail validation")


def test_validate_graph_document_rejects_invalid_morph_position():
    document = {
        "version": SNAPSHOT_GRAPH_VERSION,
        "meta": {"name": "Broken Morph", "type": "snapshot"},
        "graph": {
            "nodes": [],
            "edges": [],
            "morph": {
                "mode": "cross_snapshot",
                "position": "far",
                "source_channel_key": "channel-a",
                "target_channel_key": "channel-b",
            },
        },
    }

    try:
        validate_graph_document(document)
    except GraphDocumentValidationError as exc:
        assert exc.path == "$.graph.morph.position"
        assert "0.0 and 1.0" in str(exc)
    else:
        raise AssertionError("Expected morph validation failure")
