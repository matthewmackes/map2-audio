"""Tests for T2510-4 cluster session-assembly tool.

No live server, no real cluster, no wall-clock dependency. The pure
builder is tested directly; the network shells are tested against a
hand-rolled fake httpx client that records the URLs it was asked for.
"""

from __future__ import annotations

import json
from typing import Any

import pytest

from scripts.recorder_assemble_session import (
    assemble_session,
    build_session_manifest,
    fetch_cluster_nodes,
    fetch_node_recordings,
    proxied_metadata_url,
    proxied_recordings_url,
    proxied_wav_url,
)

BASE_URL = "http://localhost:8080"
FIXED_TS = "2026-06-02T12:00:00+00:00"


# ---------------------------------------------------------------------------
# Fake httpx client
# ---------------------------------------------------------------------------


class _FakeResponse:
    def __init__(self, payload: Any, status_code: int = 200) -> None:
        self._payload = payload
        self.status_code = status_code

    def json(self) -> Any:
        return self._payload

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class _FakeClient:
    """Maps exact URLs → payloads. Records every requested URL.

    A payload of ``RuntimeError`` (or any exception instance) is raised
    when that URL is fetched, so failure paths can be exercised. An
    unmapped URL returns a 404 response.
    """

    def __init__(self, routes: dict[str, Any]) -> None:
        self._routes = routes
        self.requested: list[str] = []

    def get(self, url: str, **_: Any) -> _FakeResponse:
        self.requested.append(url)
        if url not in self._routes:
            return _FakeResponse({"detail": "not found"}, status_code=404)
        value = self._routes[url]
        if isinstance(value, Exception):
            raise value
        if isinstance(value, _FakeResponse):
            return value
        return _FakeResponse(value)


def _take_row(asset_hash: str, file_name: str, metadata: dict[str, Any]) -> dict[str, Any]:
    """RecordingSummary-shaped row with sidecar attached under _metadata."""
    return {
        "asset_hash": asset_hash,
        "file_name": file_name,
        "size_bytes": 1024,
        "source_path": f"/var/lib/map2/recordings/{file_name}",
        "created_at": "2026-06-02T11:59:00+00:00",
        "updated_at": "2026-06-02T11:59:00+00:00",
        "_metadata": metadata,
    }


# ---------------------------------------------------------------------------
# URL helpers
# ---------------------------------------------------------------------------


def test_proxied_urls_match_per_node_proxy_contract():
    assert (
        proxied_recordings_url(BASE_URL, "node-2")
        == "http://localhost:8080/api/node/node-2/proxy/api/recordings"
    )
    assert (
        proxied_wav_url(BASE_URL, "node-2", "abc123")
        == "http://localhost:8080/api/node/node-2/proxy/api/recordings/abc123/wav"
    )
    assert (
        proxied_metadata_url(BASE_URL, "node-2", "abc123")
        == "http://localhost:8080/api/node/node-2/proxy/api/recordings/abc123/metadata"
    )


def test_proxied_urls_normalize_trailing_slash_in_base():
    assert (
        proxied_wav_url("http://localhost:8080/", "n1", "h1")
        == "http://localhost:8080/api/node/n1/proxy/api/recordings/h1/wav"
    )


# ---------------------------------------------------------------------------
# build_session_manifest — pure
# ---------------------------------------------------------------------------


def test_build_manifest_two_nodes_three_takes_with_alignment():
    takes_by_node = {
        "node-a": [
            _take_row(
                "hashA1",
                "sess-1_chain-1_pre.wav",
                {
                    "session_id": "sess-1",
                    "chain_id": "chain-1",
                    "tap": "pre_fx",
                    "sample_rate": 48000,
                    "sample_count": 96000,
                    "start_sample_offset": 128,
                },
            ),
            _take_row(
                "hashA2",
                "sess-1_chain-2_post.wav",
                {
                    "session_id": "sess-1",
                    "chain_id": "chain-2",
                    "tap": "post_fx",
                    "sample_rate": 48000,
                    "sample_count": 96000,
                    "start_sample_offset": 256,
                },
            ),
        ],
        "node-b": [
            _take_row(
                "hashB1",
                "sess-1_chain-3_post.wav",
                {
                    "session_id": "sess-1",
                    "chain_id": "chain-3",
                    "tap": "post_fx",
                    "sample_rate": 48000,
                    "sample_count": 95872,
                    "start_sample_offset": 512,
                },
            ),
        ],
    }

    manifest = build_session_manifest(
        "sess-1", takes_by_node, assembled_at=FIXED_TS, base_url=BASE_URL
    )

    assert manifest["session_id"] == "sess-1"
    assert manifest["assembled_at"] == FIXED_TS
    assert manifest["total_takes"] == 3
    assert manifest["base_url"] == BASE_URL
    assert "schema_version" in manifest

    # Node summaries (sorted, with per-node take counts).
    assert manifest["nodes"] == [
        {"node_id": "node-a", "take_count": 2},
        {"node_id": "node-b", "take_count": 1},
    ]

    by_hash = {t["asset_hash"]: t for t in manifest["takes"]}
    assert set(by_hash) == {"hashA1", "hashA2", "hashB1"}

    a1 = by_hash["hashA1"]
    assert a1["node_id"] == "node-a"
    assert a1["chain_id"] == "chain-1"
    assert a1["tap"] == "pre_fx"
    assert a1["sample_rate"] == 48000
    assert a1["sample_count"] == 96000
    assert a1["start_sample_offset"] == 128
    assert a1["offset_source"] == "avb"
    assert (
        a1["wav_ref"]
        == "http://localhost:8080/api/node/node-a/proxy/api/recordings/hashA1/wav"
    )

    b1 = by_hash["hashB1"]
    assert b1["node_id"] == "node-b"
    assert b1["start_sample_offset"] == 512
    assert (
        b1["wav_ref"]
        == "http://localhost:8080/api/node/node-b/proxy/api/recordings/hashB1/wav"
    )


def test_build_manifest_offset_fallback_when_alignment_absent():
    """T2510-3 not shipped → no offset in sidecar → graceful fallback."""
    takes_by_node = {
        "node-a": [
            _take_row(
                "hashNoOffset",
                "sess-9_chain-1_pre.wav",
                {
                    "session_id": "sess-9",
                    "chain_id": "chain-1",
                    "tap": "pre_fx",
                    "sample_rate": 48000,
                    "sample_count": 48000,
                    # No start_sample_offset / sample_offset / start_sample.
                },
            )
        ]
    }

    manifest = build_session_manifest(
        "sess-9", takes_by_node, assembled_at=FIXED_TS, base_url=BASE_URL
    )

    take = manifest["takes"][0]
    assert take["start_sample_offset"] == 0
    assert take["offset_source"] == "absent"
    # Other sidecar fields still pass through.
    assert take["sample_rate"] == 48000
    assert take["sample_count"] == 48000
    assert manifest["total_takes"] == 1


def test_build_manifest_lists_polled_node_with_no_takes():
    """A node polled but contributing nothing is still in `nodes`."""
    takes_by_node = {"node-a": [], "node-b": []}
    manifest = build_session_manifest(
        "sess-empty", takes_by_node, assembled_at=FIXED_TS, base_url=BASE_URL
    )
    assert manifest["total_takes"] == 0
    assert manifest["takes"] == []
    assert manifest["nodes"] == [
        {"node_id": "node-a", "take_count": 0},
        {"node_id": "node-b", "take_count": 0},
    ]


def test_build_manifest_empty_cluster():
    manifest = build_session_manifest(
        "sess-none", {}, assembled_at=FIXED_TS, base_url=BASE_URL
    )
    assert manifest["total_takes"] == 0
    assert manifest["takes"] == []
    assert manifest["nodes"] == []
    assert manifest["session_id"] == "sess-none"


def test_build_manifest_is_json_serializable():
    takes_by_node = {
        "node-a": [
            _take_row("h1", "f1.wav", {"session_id": "s", "sample_rate": 48000})
        ]
    }
    manifest = build_session_manifest(
        "s", takes_by_node, assembled_at=FIXED_TS, base_url=BASE_URL
    )
    # Round-trips cleanly — manifest is the deliverable artifact.
    assert json.loads(json.dumps(manifest))["total_takes"] == 1


def test_build_manifest_offset_coerces_string_and_float():
    takes_by_node = {
        "node-a": [
            _take_row("hStr", "a.wav", {"session_id": "s", "start_sample_offset": "320"}),
            _take_row("hFloat", "b.wav", {"session_id": "s", "start_sample_offset": 640.0}),
        ]
    }
    manifest = build_session_manifest(
        "s", takes_by_node, assembled_at=FIXED_TS, base_url=BASE_URL
    )
    by_hash = {t["asset_hash"]: t for t in manifest["takes"]}
    assert by_hash["hStr"]["start_sample_offset"] == 320
    assert by_hash["hStr"]["offset_source"] == "avb"
    assert by_hash["hFloat"]["start_sample_offset"] == 640
    assert by_hash["hFloat"]["offset_source"] == "avb"


# ---------------------------------------------------------------------------
# fetch_cluster_nodes
# ---------------------------------------------------------------------------


def test_fetch_cluster_nodes_returns_node_dicts():
    client = _FakeClient(
        {
            f"{BASE_URL}/api/cluster/nodes": {
                "nodes": [
                    {"id": "node-a", "hostname": "a.local", "status": "online"},
                    {"id": "node-b", "hostname": "b.local", "status": "online"},
                ],
                "count": 2,
            }
        }
    )
    nodes = fetch_cluster_nodes(client, BASE_URL)
    assert [n["id"] for n in nodes] == ["node-a", "node-b"]
    assert client.requested == [f"{BASE_URL}/api/cluster/nodes"]


def test_fetch_cluster_nodes_empty_cluster():
    client = _FakeClient({f"{BASE_URL}/api/cluster/nodes": {"nodes": [], "count": 0}})
    assert fetch_cluster_nodes(client, BASE_URL) == []


# ---------------------------------------------------------------------------
# fetch_node_recordings
# ---------------------------------------------------------------------------


def test_fetch_node_recordings_builds_proxy_url_and_filters_by_session():
    list_url = proxied_recordings_url(BASE_URL, "node-a")
    meta_match = proxied_metadata_url(BASE_URL, "node-a", "matchHash")
    meta_other = proxied_metadata_url(BASE_URL, "node-a", "otherHash")

    client = _FakeClient(
        {
            list_url: {
                "recordings": [
                    {"asset_hash": "matchHash", "file_name": "m.wav", "size_bytes": 10},
                    {"asset_hash": "otherHash", "file_name": "o.wav", "size_bytes": 20},
                ],
                "count": 2,
            },
            meta_match: {"session_id": "sess-1", "sample_rate": 48000},
            meta_other: {"session_id": "sess-OTHER", "sample_rate": 48000},
        }
    )

    takes = fetch_node_recordings(client, BASE_URL, "node-a", "sess-1")

    # Only the take whose sidecar session_id matches is returned.
    assert len(takes) == 1
    assert takes[0]["asset_hash"] == "matchHash"
    assert takes[0]["_metadata"]["session_id"] == "sess-1"

    # It hit the proxy list URL and both candidate metadata URLs.
    assert list_url in client.requested
    assert meta_match in client.requested
    assert meta_other in client.requested


def test_fetch_node_recordings_no_takes_for_session():
    list_url = proxied_recordings_url(BASE_URL, "node-a")
    meta = proxied_metadata_url(BASE_URL, "node-a", "h1")
    client = _FakeClient(
        {
            list_url: {
                "recordings": [{"asset_hash": "h1", "file_name": "x.wav", "size_bytes": 1}],
                "count": 1,
            },
            meta: {"session_id": "some-other-session"},
        }
    )
    assert fetch_node_recordings(client, BASE_URL, "node-a", "sess-1") == []


def test_fetch_node_recordings_skips_take_with_unreadable_sidecar():
    list_url = proxied_recordings_url(BASE_URL, "node-a")
    bad_meta = proxied_metadata_url(BASE_URL, "node-a", "bad")
    good_meta = proxied_metadata_url(BASE_URL, "node-a", "good")
    client = _FakeClient(
        {
            list_url: {
                "recordings": [
                    {"asset_hash": "bad", "file_name": "bad.wav", "size_bytes": 1},
                    {"asset_hash": "good", "file_name": "good.wav", "size_bytes": 1},
                ],
                "count": 2,
            },
            bad_meta: RuntimeError("sidecar 500"),
            good_meta: {"session_id": "sess-1", "sample_rate": 48000},
        }
    )
    takes = fetch_node_recordings(client, BASE_URL, "node-a", "sess-1")
    assert [t["asset_hash"] for t in takes] == ["good"]


def test_fetch_node_recordings_empty_registry():
    list_url = proxied_recordings_url(BASE_URL, "node-a")
    client = _FakeClient({list_url: {"recordings": [], "count": 0}})
    assert fetch_node_recordings(client, BASE_URL, "node-a", "sess-1") == []


# ---------------------------------------------------------------------------
# assemble_session — end-to-end through the fake client
# ---------------------------------------------------------------------------


def test_assemble_session_end_to_end():
    list_a = proxied_recordings_url(BASE_URL, "node-a")
    list_b = proxied_recordings_url(BASE_URL, "node-b")
    meta_a = proxied_metadata_url(BASE_URL, "node-a", "hA")
    meta_b = proxied_metadata_url(BASE_URL, "node-b", "hB")

    client = _FakeClient(
        {
            f"{BASE_URL}/api/cluster/nodes": {
                "nodes": [
                    {"id": "node-a", "hostname": "a.local"},
                    {"id": "node-b", "hostname": "b.local"},
                ],
                "count": 2,
            },
            list_a: {
                "recordings": [{"asset_hash": "hA", "file_name": "a.wav", "size_bytes": 1}],
                "count": 1,
            },
            list_b: {
                "recordings": [{"asset_hash": "hB", "file_name": "b.wav", "size_bytes": 1}],
                "count": 1,
            },
            meta_a: {"session_id": "sess-1", "chain_id": "c1", "tap": "pre_fx", "sample_rate": 48000},
            meta_b: {"session_id": "sess-1", "chain_id": "c2", "tap": "post_fx", "sample_rate": 48000},
        }
    )

    manifest = assemble_session(
        client, session_id="sess-1", base_url=BASE_URL, assembled_at=FIXED_TS
    )

    assert manifest["total_takes"] == 2
    assert manifest["nodes"] == [
        {"node_id": "node-a", "take_count": 1},
        {"node_id": "node-b", "take_count": 1},
    ]
    hashes = {t["asset_hash"] for t in manifest["takes"]}
    assert hashes == {"hA", "hB"}
    # Both fell back to absent offset (T2510-3 not shipped in this fixture).
    assert all(t["offset_source"] == "absent" for t in manifest["takes"])


def test_assemble_session_node_filter():
    list_a = proxied_recordings_url(BASE_URL, "node-a")
    meta_a = proxied_metadata_url(BASE_URL, "node-a", "hA")
    client = _FakeClient(
        {
            f"{BASE_URL}/api/cluster/nodes": {
                "nodes": [{"id": "node-a"}, {"id": "node-b"}],
                "count": 2,
            },
            list_a: {
                "recordings": [{"asset_hash": "hA", "file_name": "a.wav", "size_bytes": 1}],
                "count": 1,
            },
            meta_a: {"session_id": "sess-1"},
        }
    )

    manifest = assemble_session(
        client,
        session_id="sess-1",
        base_url=BASE_URL,
        assembled_at=FIXED_TS,
        node_filter="node-a",
    )

    # Only node-a was assembled; node-b was filtered out entirely.
    assert [n["node_id"] for n in manifest["nodes"]] == ["node-a"]
    assert manifest["total_takes"] == 1
    assert proxied_recordings_url(BASE_URL, "node-b") not in client.requested


def test_assemble_session_empty_cluster_does_not_crash():
    client = _FakeClient({f"{BASE_URL}/api/cluster/nodes": {"nodes": [], "count": 0}})
    manifest = assemble_session(
        client, session_id="sess-1", base_url=BASE_URL, assembled_at=FIXED_TS
    )
    assert manifest["total_takes"] == 0
    assert manifest["nodes"] == []


def test_assemble_session_skips_unreachable_node():
    client = _FakeClient(
        {
            f"{BASE_URL}/api/cluster/nodes": {
                "nodes": [{"id": "node-down"}],
                "count": 1,
            },
            proxied_recordings_url(BASE_URL, "node-down"): RuntimeError("504 unreachable"),
        }
    )
    manifest = assemble_session(
        client, session_id="sess-1", base_url=BASE_URL, assembled_at=FIXED_TS
    )
    # Node listed with zero takes; no crash.
    assert manifest["nodes"] == [{"node_id": "node-down", "take_count": 0}]
    assert manifest["total_takes"] == 0


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-q"]))
