"""T2484 loop 19 / iter 183 — backend tests for the new
GET /api/midi/cluster/bindings/matrix route (T2484-1).

Pattern: monkeypatch the discovery service's _load_peer_records
to control peer fan-out; mock httpx.AsyncClient.get for the
per-peer fetch path.
"""

from __future__ import annotations

import asyncio
from datetime import datetime
from pathlib import Path

import pytest

from app import database as database_module
from app.services.midi.routes import (
    ClusterBindingsMatrixResponse,
    get_cluster_bindings_matrix,
)
from app.services.node_discovery_service import PeerRecord


def _init_temp_db(tmp_path: Path) -> None:
    asyncio.run(database_module.dispose_async_db())
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module._sync_migrations_applied = False
    database_module.init_async_db(
        f"sqlite+aiosqlite:///{tmp_path / 'cluster-matrix.db'}"
    )


@pytest.fixture(autouse=True)
def _dispose_async_db_after_test():
    yield
    asyncio.run(database_module.dispose_async_db())


def _make_peer(node_id: str, host: str = "127.0.0.1") -> PeerRecord:
    return PeerRecord(
        node_id=node_id,
        host=host,
        hostname=f"{node_id}.local",
        node_mode="all-in-one",
        last_seen=datetime.now(),
        latency_ms=None,
        api_url=f"http://{host}:8080",
    )


def test_route_response_model():
    from app.services.midi.routes import router

    matrix_route = next(
        r
        for r in router.routes
        if getattr(r, "path", "") == "/api/midi/cluster/bindings/matrix"
    )
    assert matrix_route.response_model is ClusterBindingsMatrixResponse


def test_empty_cluster_returns_local_only(tmp_path, monkeypatch):
    """No peers: the response carries the local matrix + empty peers/errors."""
    _init_temp_db(tmp_path)

    async def _no_peers(self):
        return []

    from app.services.node_discovery_service import NodeDiscoveryService

    monkeypatch.setattr(
        NodeDiscoveryService, "_load_peer_records", _no_peers
    )

    async def _run():
        await database_module._ensure_tables_created()
        return await get_cluster_bindings_matrix()

    response = asyncio.run(_run())
    assert response.peers == []
    assert response.errors == {}
    assert response.local.total_bindings == 0


def test_one_healthy_peer_aggregates(tmp_path, monkeypatch):
    """One peer responds with a small matrix → its slice appears in `peers`."""
    _init_temp_db(tmp_path)

    async def _one_peer(self):
        return [_make_peer("peer-a")]

    class _MockResponse:
        status_code = 200

        @staticmethod
        def json():
            return {
                "matrix": {
                    "midi_cc": {
                        "plugin_param": {"count": 3, "enabled_count": 2}
                    }
                },
                "total_bindings": 3,
            }

    class _MockAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def get(self, url):
            return _MockResponse()

    import httpx

    monkeypatch.setattr(httpx, "AsyncClient", _MockAsyncClient)

    from app.services.node_discovery_service import NodeDiscoveryService

    monkeypatch.setattr(NodeDiscoveryService, "_load_peer_records", _one_peer)

    async def _run():
        await database_module._ensure_tables_created()
        return await get_cluster_bindings_matrix()

    response = asyncio.run(_run())
    assert len(response.peers) == 1
    assert response.peers[0].node_id == "peer-a"
    assert response.peers[0].total_bindings == 3
    assert response.peers[0].matrix["midi_cc"]["plugin_param"].count == 3
    assert response.errors == {}


def test_unreachable_peer_populates_errors(tmp_path, monkeypatch):
    """A peer whose httpx call raises → errors map populated, peers empty."""
    _init_temp_db(tmp_path)

    async def _one_peer(self):
        return [_make_peer("peer-a")]

    class _BlowupAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def get(self, url):
            raise RuntimeError("network down")

    import httpx

    monkeypatch.setattr(httpx, "AsyncClient", _BlowupAsyncClient)

    from app.services.node_discovery_service import NodeDiscoveryService

    monkeypatch.setattr(NodeDiscoveryService, "_load_peer_records", _one_peer)

    async def _run():
        await database_module._ensure_tables_created()
        return await get_cluster_bindings_matrix()

    response = asyncio.run(_run())
    assert response.peers == []
    assert "peer-a" in response.errors
    assert "network down" in response.errors["peer-a"]


def test_peer_health_field_propagates(tmp_path, monkeypatch):
    """T2484-4 iter 196 — health from NodeHealthService surfaces on
    each peer entry."""
    _init_temp_db(tmp_path)

    async def _one_peer(self):
        return [_make_peer("peer-a")]

    class _MockResponse:
        status_code = 200

        @staticmethod
        def json():
            return {"matrix": {}, "total_bindings": 0}

    class _MockAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def get(self, url):
            return _MockResponse()

    import httpx

    monkeypatch.setattr(httpx, "AsyncClient", _MockAsyncClient)

    from app.services.node_discovery_service import NodeDiscoveryService

    monkeypatch.setattr(NodeDiscoveryService, "_load_peer_records", _one_peer)

    # Mock NodeHealthService.get_remote_health to return 'warn' for the peer.
    class _MockHealth:
        status = "warn"

    from app.services.node_health_service import NodeHealthService

    async def _mock_remote(self, host):
        return _MockHealth()

    monkeypatch.setattr(NodeHealthService, "get_remote_health", _mock_remote)

    async def _run():
        await database_module._ensure_tables_created()
        return await get_cluster_bindings_matrix()

    response = asyncio.run(_run())
    assert len(response.peers) == 1
    assert response.peers[0].health == "warn"


def test_peer_health_falls_back_to_offline_on_exception(tmp_path, monkeypatch):
    """T2484-4 iter 196 — health fetch failure degrades silently."""
    _init_temp_db(tmp_path)

    async def _one_peer(self):
        return [_make_peer("peer-a")]

    class _MockResponse:
        status_code = 200

        @staticmethod
        def json():
            return {"matrix": {}, "total_bindings": 0}

    class _MockAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def get(self, url):
            return _MockResponse()

    import httpx

    monkeypatch.setattr(httpx, "AsyncClient", _MockAsyncClient)

    from app.services.node_discovery_service import NodeDiscoveryService

    monkeypatch.setattr(NodeDiscoveryService, "_load_peer_records", _one_peer)

    from app.services.node_health_service import NodeHealthService

    async def _blowup_remote(self, host):
        raise RuntimeError("health probe down")

    monkeypatch.setattr(NodeHealthService, "get_remote_health", _blowup_remote)

    async def _run():
        await database_module._ensure_tables_created()
        return await get_cluster_bindings_matrix()

    response = asyncio.run(_run())
    assert len(response.peers) == 1
    # Health probe blew up but matrix succeeded → health='offline',
    # peer still in the list.
    assert response.peers[0].health == "offline"


def test_peer_returning_non_200_populates_errors(tmp_path, monkeypatch):
    """HTTP 500 from a peer surfaces in the errors map."""
    _init_temp_db(tmp_path)

    async def _one_peer(self):
        return [_make_peer("peer-a")]

    class _500Response:
        status_code = 500

    class _500AsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def get(self, url):
            return _500Response()

    import httpx

    monkeypatch.setattr(httpx, "AsyncClient", _500AsyncClient)

    from app.services.node_discovery_service import NodeDiscoveryService

    monkeypatch.setattr(NodeDiscoveryService, "_load_peer_records", _one_peer)

    async def _run():
        await database_module._ensure_tables_created()
        return await get_cluster_bindings_matrix()

    response = asyncio.run(_run())
    assert response.peers == []
    assert response.errors["peer-a"] == "http 500"
