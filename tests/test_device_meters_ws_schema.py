"""Run-13i pick #1 — canonical WS frame envelope schema tests.

The handoff names this as next-session order-1: "OpenAPI generation for
the shared WS frame envelope — every WS endpoint in `device_meters.py`
emits a `device_peak_meters:*` versioned frame. A single dataclass +
schema export would let backend tests assert the frame shape against
a single source of truth."

These tests verify:

1. The canonical Pydantic models in `_meter_ws_schema.py` cover both
   frame topics + every field the route handlers emit.
2. The schema-export route at `GET /api/v1/devices/peak-meters/ws-schema`
   returns valid JSON Schema for both frame variants.
3. Convenience builders (`build_registry_frame`, `build_cluster_registry_frame`)
   round-trip through `validate_*_frame` so route handlers + tests both
   speak the same shape.
4. Schema-version invariant: `schema_version=1` is locked; bumping it
   requires deliberate human review of every downstream consumer.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes.device_meters import router as device_meters_router
from app.services.devices._meter_ws_schema import (
    ClusterMeterRegistryData,
    ClusterMeterRegistryFrame,
    ClusterPeerSlice,
    DeviceMeterRegistryData,
    DeviceMeterRegistryFrame,
    DeviceMeterRow,
    MeterSnapshotPayload,
    build_cluster_registry_frame,
    build_registry_frame,
    validate_cluster_registry_frame,
    validate_registry_frame,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(device_meters_router)
    return TestClient(app)


# ---------------------------------------------------------------------------
# Schema-export route
# ---------------------------------------------------------------------------


def test_ws_schema_route_returns_200_and_canonical_shape() -> None:
    client = _client()
    resp = client.get("/api/v1/devices/peak-meters/ws-schema")
    assert resp.status_code == 200
    body: dict[str, Any] = resp.json()
    # Topics + version are the named canonical strings.
    assert body["registry_topic"] == "device_peak_meters:registry"
    assert body["cluster_topic"] == "device_peak_meters:cluster_registry"
    assert body["schema_version"] == 1
    # Both schemas are JSON Schema dicts with at least a $defs / properties.
    for key in ("registry_schema", "cluster_schema"):
        schema = body[key]
        assert isinstance(schema, dict), f"{key} must be a dict"
        assert "properties" in schema, f"{key} must declare properties"
        assert "type" in schema["properties"]
        assert "schema_version" in schema["properties"]
        assert "data" in schema["properties"]


def test_ws_schema_route_registry_schema_pins_type_literal() -> None:
    """The frame envelope's `type` field is a Literal — the JSON Schema
    output must reflect that as `const` or `enum` of exactly one value
    so a future operator-only edit cannot silently broaden it."""
    client = _client()
    resp = client.get("/api/v1/devices/peak-meters/ws-schema")
    schema = resp.json()["registry_schema"]
    type_schema = schema["properties"]["type"]
    # Pydantic emits Literal as `const` (or `enum: [single_value]` in some
    # versions). Either form must produce exactly one allowed value.
    if "const" in type_schema:
        assert type_schema["const"] == "device_peak_meters:registry"
    elif "enum" in type_schema:
        assert type_schema["enum"] == ["device_peak_meters:registry"]
    else:
        pytest.fail(
            f"`type` schema does not pin a literal: {type_schema!r}"
        )


def test_ws_schema_route_cluster_schema_includes_local_peers_errors() -> None:
    client = _client()
    schema = client.get("/api/v1/devices/peak-meters/ws-schema").json()[
        "cluster_schema"
    ]
    # Resolve $ref via $defs.
    data_schema = schema["properties"]["data"]
    if "$ref" in data_schema:
        ref = data_schema["$ref"].rsplit("/", 1)[-1]
        data_schema = schema["$defs"][ref]
    assert "local" in data_schema["properties"]
    assert "peers" in data_schema["properties"]
    assert "errors" in data_schema["properties"]


# ---------------------------------------------------------------------------
# Pydantic model coverage
# ---------------------------------------------------------------------------


def test_meter_snapshot_payload_defaults_match_silence_sentinel() -> None:
    """A default-constructed snapshot represents the silence baseline:
    empty channel lists + source='placeholder' + captured_at=None."""
    snap = MeterSnapshotPayload()
    assert snap.input_peak_db == []
    assert snap.output_peak_db == []
    assert snap.source == "placeholder"
    assert snap.captured_at is None


def test_meter_snapshot_payload_rejects_unknown_source() -> None:
    """`source` is a Literal — only 'engine' / 'placeholder' accepted."""
    with pytest.raises(ValueError):
        MeterSnapshotPayload(source="custom-thing")  # type: ignore[arg-type]


def test_device_meter_row_input_channels_must_be_non_negative() -> None:
    with pytest.raises(ValueError):
        DeviceMeterRow(
            device_id="test",
            input_channels=-1,
            output_channels=0,
            has_engine_source=False,
        )


def test_device_meter_registry_frame_locks_topic_and_version() -> None:
    """Constructing a frame without overriding `type` / `schema_version`
    must produce the canonical values."""
    frame = DeviceMeterRegistryFrame(data=DeviceMeterRegistryData())
    assert frame.type == "device_peak_meters:registry"
    assert frame.schema_version == 1


def test_device_meter_registry_frame_rejects_wrong_topic() -> None:
    with pytest.raises(ValueError):
        DeviceMeterRegistryFrame(
            type="device_peak_meters:cluster_registry",  # type: ignore[arg-type]
            data=DeviceMeterRegistryData(),
        )


def test_device_meter_registry_frame_rejects_wrong_schema_version() -> None:
    with pytest.raises(ValueError):
        DeviceMeterRegistryFrame(
            schema_version=2,  # type: ignore[arg-type]
            data=DeviceMeterRegistryData(),
        )


def test_cluster_frame_locks_topic_and_version() -> None:
    frame = ClusterMeterRegistryFrame(data=ClusterMeterRegistryData())
    assert frame.type == "device_peak_meters:cluster_registry"
    assert frame.schema_version == 1


# ---------------------------------------------------------------------------
# Builder round-trips (single source of truth for route emission)
# ---------------------------------------------------------------------------


def test_build_registry_frame_round_trips() -> None:
    rows = [
        DeviceMeterRow(
            device_id="tascam-us144mkii",
            input_channels=4,
            output_channels=4,
            has_engine_source=False,
            snapshot=MeterSnapshotPayload(
                input_peak_db=[-50.0, -45.0, -100.0, -100.0],
                output_peak_db=[-30.0, -30.0, -100.0, -100.0],
                source="engine",
                captured_at=1715731200.0,
            ),
        )
    ]
    frame = build_registry_frame(rows)
    assert frame["type"] == "device_peak_meters:registry"
    assert frame["schema_version"] == 1
    parsed = validate_registry_frame(frame)
    assert len(parsed.data.devices) == 1
    assert parsed.data.devices[0].device_id == "tascam-us144mkii"
    assert parsed.data.devices[0].snapshot.source == "engine"


def test_build_cluster_registry_frame_round_trips_with_peers() -> None:
    local_data = DeviceMeterRegistryData(
        devices=[
            DeviceMeterRow(
                device_id="local-device",
                input_channels=2,
                output_channels=2,
                has_engine_source=True,
            )
        ]
    )
    peers = [
        ClusterPeerSlice(
            node_id="peer-1",
            hostname="audio-node-1",
            devices=[
                DeviceMeterRow(
                    device_id="peer-device",
                    input_channels=4,
                    output_channels=4,
                    has_engine_source=False,
                )
            ],
            fetch_age_seconds=0.123,
        )
    ]
    errors = {"peer-2": "http 504"}
    frame = build_cluster_registry_frame(local=local_data, peers=peers, errors=errors)
    parsed = validate_cluster_registry_frame(frame)
    assert parsed.type == "device_peak_meters:cluster_registry"
    assert parsed.data.local.devices[0].device_id == "local-device"
    assert parsed.data.peers[0].node_id == "peer-1"
    assert parsed.data.peers[0].fetch_age_seconds == 0.123
    assert parsed.data.errors == {"peer-2": "http 504"}


def test_build_cluster_registry_frame_with_no_args_produces_empty_envelope() -> None:
    """Defensive case used by the cluster WS handler when fan-out raises."""
    frame = build_cluster_registry_frame()
    parsed = validate_cluster_registry_frame(frame)
    assert parsed.data.local.devices == []
    assert parsed.data.peers == []
    assert parsed.data.errors == {}


# ---------------------------------------------------------------------------
# Validate-frame catches drift
# ---------------------------------------------------------------------------


def test_validate_registry_frame_rejects_missing_data_field() -> None:
    with pytest.raises(ValueError):
        validate_registry_frame({
            "type": "device_peak_meters:registry",
            "schema_version": 1,
        })


def test_validate_registry_frame_rejects_unknown_top_level_topic() -> None:
    with pytest.raises(ValueError):
        validate_registry_frame({
            "type": "device_peak_meters:cluster_registry",
            "schema_version": 1,
            "data": {"devices": []},
        })


def test_validate_cluster_frame_rejects_missing_data_field() -> None:
    with pytest.raises(ValueError):
        validate_cluster_registry_frame({
            "type": "device_peak_meters:cluster_registry",
            "schema_version": 1,
        })


# ---------------------------------------------------------------------------
# Backward-compat: a frame emitted by the existing route shape must validate
# ---------------------------------------------------------------------------


def test_legacy_registry_frame_validates() -> None:
    """The shape currently emitted by the route handler (per its
    docstring at app/routes/device_meters.py:422-444) must pass
    validation. Drift in either direction breaks consumers."""
    legacy_frame = {
        "type": "device_peak_meters:registry",
        "schema_version": 1,
        "data": {
            "devices": [
                {
                    "device_id": "edirol-ua-1000",
                    "input_channels": 10,
                    "output_channels": 10,
                    "has_engine_source": False,
                    "snapshot": {
                        "input_peak_db": [-100.0] * 10,
                        "output_peak_db": [-100.0] * 10,
                        "source": "placeholder",
                        "captured_at": 1715731200.0,
                    },
                }
            ]
        },
    }
    parsed = validate_registry_frame(legacy_frame)
    assert parsed.data.devices[0].input_channels == 10


def test_legacy_cluster_frame_validates() -> None:
    """The shape currently emitted by the cluster route handler must
    pass validation against the canonical schema."""
    legacy_frame = {
        "type": "device_peak_meters:cluster_registry",
        "schema_version": 1,
        "data": {
            "local": {"devices": []},
            "peers": [
                {
                    "node_id": "node-a",
                    "hostname": "audio-a",
                    "devices": [],
                }
            ],
            "errors": {"node-b": "http 504"},
        },
    }
    parsed = validate_cluster_registry_frame(legacy_frame)
    assert parsed.data.peers[0].node_id == "node-a"
    assert parsed.data.errors == {"node-b": "http 504"}
