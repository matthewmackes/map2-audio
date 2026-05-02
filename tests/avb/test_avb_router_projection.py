"""T2490-3a — read-side router projection unit tests.

Validates the deterministic synthetic id, projection shape, and the
detection helper. Live router state is mocked so the test doesn't
depend on JUCE / AVDECC bindings being available.
"""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

from app.services.avb.router_projection import (
    _project_one_connection,
    _projected_binding_id,
    is_projected_binding_id,
)


def _fake_endpoint(**overrides):
    base = dict(
        entity_id="001122FFFE334455",
        unique_id=0,
        device_type="map2",
        device_name="local-talker",
        channels=8,
        sample_rate=48000,
        format="24-bit PCM",
        node_id=None,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def _fake_connection(**overrides):
    talker = _fake_endpoint()
    listener = _fake_endpoint(
        entity_id="001122FFFE667788",
        device_name="remote-listener",
        node_id="node-B",
    )
    state = SimpleNamespace(value="connected")
    base = dict(
        talker=talker,
        listener=listener,
        state=state,
        established_time=datetime(2026, 5, 1, 0, 0, 0, tzinfo=timezone.utc),
        connection_role="general_route",
        loop_id=None,
        srp_admission_id=None,
    )
    base.update(overrides)
    cn = SimpleNamespace(**base)
    cn.connection_id = lambda: f"{cn.talker.entity_id}:{cn.talker.unique_id}->{cn.listener.entity_id}:{cn.listener.unique_id}"
    return cn


def test_projected_binding_id_is_deterministic_36_char_proj_prefix():
    a = _projected_binding_id("conn-A")
    b = _projected_binding_id("conn-A")
    c = _projected_binding_id("conn-B")
    assert a == b
    assert a != c
    assert a.startswith("proj-")
    assert len(a) == 36


def test_is_projected_binding_id_recognizes_proj_prefix():
    assert is_projected_binding_id("proj-aaaaaaaaaaaa-1111-2222-3333-444444")
    assert not is_projected_binding_id("00000000-0000-0000-0000-000000000001")


def test_project_one_connection_renders_canonical_avb_binding():
    conn = _fake_connection()
    projected = _project_one_connection(conn)

    assert projected is not None
    assert projected.consumer_type == "avdecc_stream"
    assert projected.source_type == "avdecc_talker"
    assert projected.target_type == "avdecc_listener"
    assert projected.stream_id == "001122FFFE334455:0"
    assert projected.stream_format == "24-bit PCM"
    # Cluster scope when listener has node_id.
    assert projected.scope == "cluster"
    assert projected.listener_node_id == "node-B"
    assert projected.talker_node_id is None
    # Connected state → enabled=True.
    assert projected.enabled is True
    # Synthetic id starts with proj-.
    assert projected.binding_id.startswith("proj-")
    # Provenance flag for downstream filtering.
    assert projected.metadata["projection_source"] == "avb_router"
    assert projected.metadata["connection_state"] == "connected"


def test_project_one_connection_marks_disconnected_as_not_enabled():
    conn = _fake_connection(state=SimpleNamespace(value="disconnected"))
    projected = _project_one_connection(conn)
    assert projected is not None
    assert projected.enabled is False


def test_project_one_connection_returns_none_on_bad_input():
    # Pass a SimpleNamespace missing .talker — coercion should fail
    # gracefully.
    bad = SimpleNamespace()
    bad.connection_id = lambda: "bad-conn"
    projected = _project_one_connection(bad)
    assert projected is None


def test_global_scope_when_no_node_ids():
    talker = _fake_endpoint(node_id=None)
    listener = _fake_endpoint(node_id=None, entity_id="001122FFFE667788")
    state = SimpleNamespace(value="connected")
    conn = SimpleNamespace(
        talker=talker,
        listener=listener,
        state=state,
        established_time=None,
        connection_role="general_route",
        loop_id=None,
        srp_admission_id=None,
    )
    conn.connection_id = lambda: "global-1"
    projected = _project_one_connection(conn)
    assert projected is not None
    assert projected.scope == "global"
