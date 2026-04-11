import asyncio
import json

from app.services import ws_federation
from app.services.ws_federation import FederatedConnection, WebSocketFederator


class _FakeNode:
    def __init__(self, node_id: str, host: str = "127.0.0.1", port: int = 8080) -> None:
        self.node_id = node_id
        self.addresses = [host]
        self.port = port


class _FakeDiscovery:
    def __init__(self, nodes: list[_FakeNode]) -> None:
        self._nodes = nodes

    def get_discovered_nodes(self, online_only: bool = True):
        return list(self._nodes)

    def get_discovered_node(self, node_id: str):
        for node in self._nodes:
            if node.node_id == node_id:
                return node
        return None


class _FakeWebSocket:
    def __init__(self, conn: FederatedConnection, message: str) -> None:
        self.conn = conn
        self.message = message
        self.sent_messages: list[str] = []
        self._delivered = False

    async def send(self, message: str) -> None:
        self.sent_messages.append(message)

    def __aiter__(self):
        return self

    async def __anext__(self) -> str:
        if self._delivered:
            raise StopAsyncIteration
        self._delivered = True
        self.conn.stop_event.set()
        return self.message


class _FakeConnectContext:
    def __init__(self, websocket: _FakeWebSocket) -> None:
        self.websocket = websocket

    async def __aenter__(self) -> _FakeWebSocket:
        return self.websocket

    async def __aexit__(self, exc_type, exc, tb) -> bool:
        return False


def test_subscribe_remote_skips_local_node_and_deduplicates(monkeypatch):
    async def _run() -> None:
        federator = WebSocketFederator()
        federator.local_node_id = "node-local"
        federator.discovery = _FakeDiscovery([_FakeNode("node-local"), _FakeNode("node-remote")])
        started: list[tuple[str, str]] = []

        async def _fake_run(conn: FederatedConnection) -> None:
            started.append((conn.node_id, conn.topic))
            await conn.stop_event.wait()

        monkeypatch.setattr(federator, "_run_connection", _fake_run)

        await federator.subscribe_remote("node-local", "meters")
        await federator.subscribe_remote("node-remote", "meters")
        await federator.subscribe_remote("node-remote", "meters")
        await asyncio.sleep(0)

        assert ("node-local", "meters") not in federator.connections
        assert list(federator.connections) == [("node-remote", "meters")]
        assert started == [("node-remote", "meters")]

        connection = federator.connections[("node-remote", "meters")]
        await federator.unsubscribe_remote("node-remote", "meters")
        await asyncio.sleep(0)

        assert connection.stop_event.is_set()
        assert federator.connections == {}

    asyncio.run(_run())


def test_subscribe_all_targets_only_remote_nodes(monkeypatch):
    async def _run() -> None:
        federator = WebSocketFederator()
        federator.local_node_id = "node-local"
        federator.discovery = _FakeDiscovery(
            [_FakeNode("node-local"), _FakeNode("node-a"), _FakeNode("node-b")]
        )
        subscriptions: list[tuple[str, str]] = []

        async def _fake_subscribe_remote(node_id: str, topic: str) -> None:
            subscriptions.append((node_id, topic))

        monkeypatch.setattr(federator, "subscribe_remote", _fake_subscribe_remote)

        await federator.subscribe_all("meters")

        assert subscriptions == [("node-a", "meters"), ("node-b", "meters")]

    asyncio.run(_run())


def test_run_connection_rebroadcasts_remote_messages_with_node_prefixed_topic(monkeypatch):
    async def _run() -> None:
        federator = WebSocketFederator()
        federator.local_node_id = "node-local"
        federator.discovery = _FakeDiscovery([_FakeNode("node-remote", host="10.1.2.3", port=9090)])
        conn = FederatedConnection(node_id="node-remote", topic="meters")
        websocket = _FakeWebSocket(conn, '{"type":"meter","value":0.75}')
        connect_calls: list[tuple[str, int]] = []
        broadcasts: list[tuple[str, str]] = []

        def _fake_connect(url: str, ping_interval: int = 30):
            connect_calls.append((url, ping_interval))
            return _FakeConnectContext(websocket)

        async def _fake_broadcast(message: str, topic: str | None = None) -> None:
            broadcasts.append((message, topic or ""))

        monkeypatch.setattr(ws_federation.websockets, "connect", _fake_connect)
        monkeypatch.setattr(ws_federation.ws_manager, "broadcast", _fake_broadcast)

        await federator._run_connection(conn)

        assert connect_calls == [("ws://10.1.2.3:9090/ws", 30)]
        assert websocket.sent_messages == [
            json.dumps({"action": "subscribe", "topic": "meters"})
        ]
        assert broadcasts == [
            ('{"type":"meter","value":0.75}', "node:node-remote/meters")
        ]

    asyncio.run(_run())


def test_unsubscribe_remote_is_safe_when_connection_is_missing():
    async def _run() -> None:
        federator = WebSocketFederator()
        await federator.unsubscribe_remote("missing-node", "meters")
        assert federator.connections == {}

    asyncio.run(_run())


def test_get_ws_federator_uses_shared_singleton_registry():
    ws_federation.WebSocketFederator.reset_instance()
    try:
        first = ws_federation.get_ws_federator()
        second = ws_federation.get_ws_federator()
        assert first is second
    finally:
        ws_federation.WebSocketFederator.reset_instance()


def test_run_connection_retries_after_connect_failure_with_backoff(monkeypatch):
    async def _run() -> None:
        federator = WebSocketFederator()
        federator.local_node_id = "node-local"
        federator.discovery = _FakeDiscovery([_FakeNode("node-remote", host="10.9.8.7", port=9001)])
        conn = FederatedConnection(node_id="node-remote", topic="cpu")
        websocket = _FakeWebSocket(conn, '{"type":"cpu","value":11.0}')
        connect_attempts: list[str] = []
        delays: list[float] = []
        broadcasts: list[tuple[str, str]] = []

        def _fake_connect(url: str, ping_interval: int = 30):
            connect_attempts.append(url)
            if len(connect_attempts) == 1:
                raise RuntimeError("simulated disconnect")
            return _FakeConnectContext(websocket)

        async def _fake_sleep(delay: float) -> None:
            delays.append(delay)

        async def _fake_broadcast(message: str, topic: str | None = None) -> None:
            broadcasts.append((message, topic or ""))

        monkeypatch.setattr(ws_federation.websockets, "connect", _fake_connect)
        monkeypatch.setattr(ws_federation.asyncio, "sleep", _fake_sleep)
        monkeypatch.setattr(ws_federation.ws_manager, "broadcast", _fake_broadcast)

        await federator._run_connection(conn)

        assert connect_attempts == [
            "ws://10.9.8.7:9001/ws",
            "ws://10.9.8.7:9001/ws",
        ]
        assert delays == [1.0]
        assert broadcasts == [
            ('{"type":"cpu","value":11.0}', "node:node-remote/cpu")
        ]

    asyncio.run(_run())
