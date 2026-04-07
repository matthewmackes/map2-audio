from __future__ import annotations

import asyncio

from app.middleware.cluster_proxy import ClusterProxyMiddleware
from app.services.cluster.heartbeat_monitor import HeartbeatMonitor
from app.services.event_bus import EventType


class _Registry:
    def __init__(self, nodes):
        self._nodes = list(nodes)
        self.updated: list[tuple[str, str]] = []

    def get_all_nodes(self):
        return list(self._nodes)

    def update_node_status(self, node_id: str, status: str):
        self.updated.append((node_id, status))


class _EventBus:
    def __init__(self):
        self.events: list[tuple[EventType, dict]] = []

    async def publish(self, event_type: EventType, data: dict):
        self.events.append((event_type, data))


class _Response:
    def raise_for_status(self):
        return None

    def json(self):
        return {"ok": True}


class _AsyncClient:
    def __init__(self):
        self.calls: list[str] = []
        self.closed = False

    async def get(self, url: str):
        self.calls.append(url)
        return _Response()

    async def aclose(self):
        self.closed = True


def test_heartbeat_monitor_skips_self_prunes_removed_nodes_and_emits_first_online():
    monitor = HeartbeatMonitor()
    monitor.registry = _Registry(
        [
            {"node_id": monitor._local_node_id, "ip_address": "127.0.0.1", "metadata": {"api_port": 8080}},
            {"node_id": "node-b", "ip_address": "10.0.0.2", "metadata": {"api_port": 8080}},
        ]
    )
    monitor.event_bus = _EventBus()
    monitor._client = _AsyncClient()
    monitor.node_health["stale-node"] = object()  # type: ignore[assignment]

    asyncio.run(monitor._monitor_loop_iteration_for_test())

    assert monitor._client.calls == ["http://10.0.0.2:8080/api/health"]
    assert "stale-node" not in monitor.node_health
    assert monitor.event_bus.events[0][0] == EventType.NODE_ONLINE
    assert monitor.event_bus.events[0][1]["first_seen"] is True


def test_heartbeat_monitor_stop_closes_shared_client():
    monitor = HeartbeatMonitor()
    monitor.is_running = True
    monitor._client = _AsyncClient()

    asyncio.run(monitor.stop())

    assert monitor._client is None


def test_cluster_proxy_aclose_closes_cached_clients():
    middleware = ClusterProxyMiddleware(lambda scope, receive, send: None)

    class _Client:
        def __init__(self):
            self.closed = False

        async def aclose(self):
            self.closed = True

    client_a = _Client()
    client_b = _Client()
    middleware.clients = {"a": client_a, "b": client_b}  # type: ignore[assignment]

    asyncio.run(middleware.aclose())

    assert client_a.closed is True
    assert client_b.closed is True
    assert middleware.clients == {}
