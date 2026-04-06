from __future__ import annotations

import hashlib
import json

from app.services.state_authority_graph import (
    SNAPSHOT_GRAPH_SCHEMA_PATH,
    SNAPSHOT_GRAPH_VERSION,
    canonicalize_plugin_uri,
    extract_asset_references,
    load_snapshot_graph_schema,
    normalize_graph_document,
    register_asset_file,
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


def test_schema_file_is_valid_json():
    schema = json.loads(SNAPSHOT_GRAPH_SCHEMA_PATH.read_text(encoding="utf-8"))

    assert schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"
