"""Run-13f cycle 1 — /peak-meters/cluster/registry fan-out tests.

The cluster route mirrors the AVB/SonoBus cluster matrix shape.
We stub out node discovery + health + per-peer fetch so the route can
be exercised in isolation.
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


def test_returns_local_only_when_no_peers(
    app_with_router: FastAPI, monkeypatch: pytest.MonkeyPatch
) -> None:
    """No discovered peers → response is local-only, peers/errors empty."""

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
    r = client.get("/api/v1/devices/peak-meters/cluster/registry")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["peers"] == []
    assert body["errors"] == {}
    assert "devices" in body["local"]
    assert len(body["local"]["devices"]) >= 2


def test_failed_peer_populates_errors(
    app_with_router: FastAPI, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A peer that fails to respond shows up under errors but doesn't
    break the overall request."""

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
    r = client.get("/api/v1/devices/peak-meters/cluster/registry")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["peers"] == []
    assert body["errors"] == {"node-bad": "stubbed peer failure"}
    assert "devices" in body["local"]


def test_successful_peer_populates_peers(
    app_with_router: FastAPI, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A peer that returns 200 surfaces under peers with health tag."""

    class _StubPeer:
        node_id = "node-good"
        hostname = "good.local"
        host = "10.0.0.5"
        api_url = "http://10.0.0.5:8080"

    class _StubDiscovery:
        async def _load_peer_records(self):
            return [_StubPeer()]

    class _StubHealth:
        async def get_remote_health(self, host):
            class _S:
                status = "ok"

            return _S()

    from app.services import node_discovery_service, node_health_service
    from app.routes.device_meters import (
        ClusterDeviceRegistryPeer,
        DeviceRegistryEntry,
    )

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

    async def _ok_fetch(**kwargs):
        return (
            ClusterDeviceRegistryPeer(
                node_id=kwargs["node_id"],
                hostname=kwargs["hostname"],
                devices=[
                    DeviceRegistryEntry(
                        device_id="remote-device",
                        input_channels=2,
                        output_channels=2,
                        has_engine_source=True,
                    )
                ],
                health=kwargs.get("health", "offline"),
            ),
            None,
        )

    monkeypatch.setattr(
        device_meters_module,
        "_fetch_peer_device_registry",
        _ok_fetch,
    )

    client = TestClient(app_with_router)
    r = client.get("/api/v1/devices/peak-meters/cluster/registry")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["errors"] == {}
    assert len(body["peers"]) == 1
    peer = body["peers"][0]
    assert peer["node_id"] == "node-good"
    assert peer["health"] == "ok"
    assert peer["devices"][0]["device_id"] == "remote-device"


def test_include_snapshot_propagates_to_peer_fetch(
    app_with_router: FastAPI, monkeypatch: pytest.MonkeyPatch
) -> None:
    """`?include_snapshot=true` on the cluster route must propagate to
    every per-peer fetch so the response carries inline snapshots."""

    class _StubPeer:
        node_id = "node-x"
        hostname = "x.local"
        host = "10.0.0.6"
        api_url = "http://10.0.0.6:8080"

    class _StubDiscovery:
        async def _load_peer_records(self):
            return [_StubPeer()]

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

    captured: dict[str, object] = {}

    async def _spy_fetch(**kwargs):
        captured.update(kwargs)
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
        _spy_fetch,
    )

    client = TestClient(app_with_router)
    r = client.get(
        "/api/v1/devices/peak-meters/cluster/registry?include_snapshot=true"
    )
    assert r.status_code == 200
    assert captured.get("include_snapshot") is True


def test_discovery_unavailable_returns_local_only(
    app_with_router: FastAPI, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A discovery service that blows up should not break the cluster
    route — we still return local + empty peers + empty errors."""

    def _boom():
        raise RuntimeError("discovery service down")

    from app.services import node_discovery_service

    monkeypatch.setattr(
        node_discovery_service,
        "get_node_discovery_service",
        _boom,
    )

    client = TestClient(app_with_router)
    r = client.get("/api/v1/devices/peak-meters/cluster/registry")
    assert r.status_code == 200
    body = r.json()
    assert body["peers"] == []
    assert body["errors"] == {}
