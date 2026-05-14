"""Run-13g cycle 3 — /peak-meters/cluster/stream WS fan-in tests.

Verifies the cluster WS handler:
- Sends an initial frame on connect with the documented envelope.
- Propagates include_snapshot to the per-peer fetch helper.
- Surfaces peer errors via the `errors` map in the frame data.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import device_meters as device_meters_module


@pytest.fixture
def app_with_router() -> FastAPI:
    app = FastAPI()
    app.include_router(device_meters_module.router)
    return app


def test_initial_frame_envelope(
    app_with_router: FastAPI, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Frame must carry the documented type + schema_version + data
    shape (local + peers + errors)."""

    class _StubDiscovery:
        async def _load_peer_records(self):
            return []

    from app.services import node_discovery_service

    monkeypatch.setattr(
        node_discovery_service,
        "get_node_discovery_service",
        lambda: _StubDiscovery(),
    )

    client = TestClient(app_with_router)
    with client.websocket_connect(
        "/api/v1/devices/peak-meters/cluster/stream"
    ) as ws:
        frame = ws.receive_json()
    assert frame["type"] == "device_peak_meters:cluster_registry"
    assert frame["schema_version"] == 1
    data = frame["data"]
    assert "local" in data
    assert "peers" in data
    assert "errors" in data


def test_include_snapshot_query_propagates(
    app_with_router: FastAPI, monkeypatch: pytest.MonkeyPatch
) -> None:
    """`?include_snapshot=true` must propagate into the cluster registry
    helper so every device entry carries an inline snapshot."""
    captured: list[bool] = []

    real_helper = device_meters_module.get_cluster_peak_meters_registry

    async def _spy(include_snapshot: bool = False):
        captured.append(include_snapshot)
        return await real_helper(include_snapshot=include_snapshot)

    monkeypatch.setattr(
        device_meters_module,
        "get_cluster_peak_meters_registry",
        _spy,
    )

    class _StubDiscovery:
        async def _load_peer_records(self):
            return []

    from app.services import node_discovery_service

    monkeypatch.setattr(
        node_discovery_service,
        "get_node_discovery_service",
        lambda: _StubDiscovery(),
    )

    client = TestClient(app_with_router)
    with client.websocket_connect(
        "/api/v1/devices/peak-meters/cluster/stream?include_snapshot=true"
    ) as ws:
        ws.receive_json()
    assert captured and captured[0] is True


def test_peer_failure_appears_in_errors(
    app_with_router: FastAPI, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A peer that fails to respond shows up under data.errors keyed by
    node_id — and the connection keeps streaming."""

    class _StubPeer:
        node_id = "node-bad"
        hostname = "bad.local"
        host = "10.255.255.254"
        api_url = "http://10.255.255.254:8080"

    class _StubDiscovery:
        async def _load_peer_records(self):
            return [_StubPeer()]

    class _StubHealth:
        async def get_remote_health(self, host):
            class _S:
                status = "offline"

            return _S()

    from app.services import node_discovery_service, node_health_service

    monkeypatch.setattr(
        node_discovery_service,
        "get_node_discovery_service",
        lambda: _StubDiscovery(),
    )
    monkeypatch.setattr(
        node_health_service,
        "get_node_health_service",
        lambda: _StubHealth(),
    )

    async def _fail_fetch(**kwargs):
        return None, "stubbed peer failure"

    monkeypatch.setattr(
        device_meters_module,
        "_fetch_peer_device_registry",
        _fail_fetch,
    )

    client = TestClient(app_with_router)
    with client.websocket_connect(
        "/api/v1/devices/peak-meters/cluster/stream"
    ) as ws:
        frame = ws.receive_json()
    assert frame["data"]["errors"] == {"node-bad": "stubbed peer failure"}


def test_node_ids_filter_restricts_peers(
    app_with_router: FastAPI, monkeypatch: pytest.MonkeyPatch
) -> None:
    """`?node_ids=peer-A` restricts the frame to that peer (plus local
    only when 'local' is in the filter)."""

    class _PeerA:
        node_id = "peer-A"
        hostname = "a.local"
        host = "10.0.0.5"
        api_url = "http://10.0.0.5:8080"

    class _PeerB:
        node_id = "peer-B"
        hostname = "b.local"
        host = "10.0.0.6"
        api_url = "http://10.0.0.6:8080"

    class _StubDiscovery:
        async def _load_peer_records(self):
            return [_PeerA(), _PeerB()]

    class _StubHealth:
        async def get_remote_health(self, host):
            class _S:
                status = "ok"

            return _S()

    from app.services import node_discovery_service, node_health_service
    from app.routes.device_meters import ClusterDeviceRegistryPeer

    monkeypatch.setattr(
        node_discovery_service,
        "get_node_discovery_service",
        lambda: _StubDiscovery(),
    )
    monkeypatch.setattr(
        node_health_service,
        "get_node_health_service",
        lambda: _StubHealth(),
    )

    async def _fetch(**kwargs):
        return (
            ClusterDeviceRegistryPeer(
                node_id=kwargs["node_id"],
                hostname=kwargs["hostname"],
                devices=[],
                health=kwargs.get("health", "offline"),
            ),
            None,
        )

    monkeypatch.setattr(
        device_meters_module,
        "_fetch_peer_device_registry",
        _fetch,
    )

    client = TestClient(app_with_router)
    with client.websocket_connect(
        "/api/v1/devices/peak-meters/cluster/stream?node_ids=peer-A"
    ) as ws:
        frame = ws.receive_json()
    # Only peer-A in the frame; local is blanked when "local" is
    # not in the filter.
    peer_node_ids = [p["node_id"] for p in frame["data"]["peers"]]
    assert peer_node_ids == ["peer-A"]
    assert frame["data"]["local"]["devices"] == []


def test_node_ids_filter_keyword_local_keeps_local_devices(
    app_with_router: FastAPI, monkeypatch: pytest.MonkeyPatch
) -> None:
    """`?node_ids=local,peer-A` keeps local and peer-A; drops peer-B."""

    class _PeerA:
        node_id = "peer-A"
        hostname = "a.local"
        host = "10.0.0.5"
        api_url = "http://10.0.0.5:8080"

    class _PeerB:
        node_id = "peer-B"
        hostname = "b.local"
        host = "10.0.0.6"
        api_url = "http://10.0.0.6:8080"

    class _StubDiscovery:
        async def _load_peer_records(self):
            return [_PeerA(), _PeerB()]

    class _StubHealth:
        async def get_remote_health(self, host):
            class _S:
                status = "ok"

            return _S()

    from app.services import node_discovery_service, node_health_service
    from app.routes.device_meters import ClusterDeviceRegistryPeer

    monkeypatch.setattr(
        node_discovery_service,
        "get_node_discovery_service",
        lambda: _StubDiscovery(),
    )
    monkeypatch.setattr(
        node_health_service,
        "get_node_health_service",
        lambda: _StubHealth(),
    )

    async def _fetch(**kwargs):
        return (
            ClusterDeviceRegistryPeer(
                node_id=kwargs["node_id"],
                hostname=kwargs["hostname"],
                devices=[],
                health=kwargs.get("health", "offline"),
            ),
            None,
        )

    monkeypatch.setattr(
        device_meters_module,
        "_fetch_peer_device_registry",
        _fetch,
    )

    client = TestClient(app_with_router)
    with client.websocket_connect(
        "/api/v1/devices/peak-meters/cluster/stream?node_ids=local,peer-A"
    ) as ws:
        frame = ws.receive_json()
    peer_node_ids = [p["node_id"] for p in frame["data"]["peers"]]
    assert peer_node_ids == ["peer-A"]
    # local key still present.
    assert "devices" in frame["data"]["local"]


def test_node_ids_filter_unknown_ids_silently_dropped(
    app_with_router: FastAPI, monkeypatch: pytest.MonkeyPatch
) -> None:
    """An unknown node_id in the filter doesn't 5xx — it just yields
    no peer rows."""

    class _PeerA:
        node_id = "peer-A"
        hostname = "a.local"
        host = "10.0.0.5"
        api_url = "http://10.0.0.5:8080"

    class _StubDiscovery:
        async def _load_peer_records(self):
            return [_PeerA()]

    class _StubHealth:
        async def get_remote_health(self, host):
            class _S:
                status = "ok"

            return _S()

    from app.services import node_discovery_service, node_health_service
    from app.routes.device_meters import ClusterDeviceRegistryPeer

    monkeypatch.setattr(
        node_discovery_service,
        "get_node_discovery_service",
        lambda: _StubDiscovery(),
    )
    monkeypatch.setattr(
        node_health_service,
        "get_node_health_service",
        lambda: _StubHealth(),
    )

    async def _fetch(**kwargs):
        return (
            ClusterDeviceRegistryPeer(
                node_id=kwargs["node_id"],
                hostname=kwargs["hostname"],
                devices=[],
                health="ok",
            ),
            None,
        )

    monkeypatch.setattr(
        device_meters_module,
        "_fetch_peer_device_registry",
        _fetch,
    )

    client = TestClient(app_with_router)
    with client.websocket_connect(
        "/api/v1/devices/peak-meters/cluster/stream?node_ids=not-a-node"
    ) as ws:
        frame = ws.receive_json()
    assert frame["data"]["peers"] == []
    assert frame["data"]["local"]["devices"] == []


def test_second_frame_arrives_after_cadence_tick(
    app_with_router: FastAPI, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Override the cadence constant so the test doesn't burn 200 ms
    waiting on the second frame."""
    monkeypatch.setattr(
        device_meters_module,
        "CLUSTER_WS_BROADCAST_INTERVAL_SECONDS",
        0.005,
    )

    class _StubDiscovery:
        async def _load_peer_records(self):
            return []

    from app.services import node_discovery_service

    monkeypatch.setattr(
        node_discovery_service,
        "get_node_discovery_service",
        lambda: _StubDiscovery(),
    )

    client = TestClient(app_with_router)
    with client.websocket_connect(
        "/api/v1/devices/peak-meters/cluster/stream"
    ) as ws:
        first = ws.receive_json()
        second = ws.receive_json()
    assert first["type"] == "device_peak_meters:cluster_registry"
    assert second["type"] == "device_peak_meters:cluster_registry"
