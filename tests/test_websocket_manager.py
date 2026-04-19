import asyncio
import time
import gzip

from app.services.websocket_manager import WebSocketManager


class _FakeWebSocket:
    def __init__(self, *, delay_seconds: float = 0.0, should_fail: bool = False) -> None:
        self.delay_seconds = delay_seconds
        self.should_fail = should_fail
        self.sent_messages: list[str] = []
        self.sent_binary_messages: list[bytes] = []
        self.received_at: float | None = None

    async def send_text(self, message: str) -> None:
        if self.delay_seconds:
            await asyncio.sleep(self.delay_seconds)
        if self.should_fail:
            raise RuntimeError("simulated send failure")
        self.received_at = time.perf_counter()
        self.sent_messages.append(message)

    async def send_bytes(self, message: bytes) -> None:
        if self.delay_seconds:
            await asyncio.sleep(self.delay_seconds)
        if self.should_fail:
            raise RuntimeError("simulated send failure")
        self.received_at = time.perf_counter()
        self.sent_binary_messages.append(message)


def test_broadcast_fans_out_in_parallel():
    manager = WebSocketManager()
    for idx in range(4):
        manager.active_connections[f"client-{idx}"] = _FakeWebSocket(delay_seconds=0.05)

    start = time.perf_counter()
    asyncio.run(manager.broadcast("payload"))
    elapsed = time.perf_counter() - start

    # Parallel fan-out should complete near single-send delay, not sum of delays.
    assert elapsed < 0.14
    for websocket in manager.active_connections.values():
        assert websocket.sent_messages == ["payload"]


def test_broadcast_removes_failed_clients():
    manager = WebSocketManager()
    ok_ws = _FakeWebSocket()
    bad_ws = _FakeWebSocket(should_fail=True)
    manager.active_connections["ok"] = ok_ws
    manager.active_connections["bad"] = bad_ws

    asyncio.run(manager.broadcast("payload"))

    assert "ok" in manager.active_connections
    assert "bad" not in manager.active_connections
    assert ok_ws.sent_messages == ["payload"]


def test_broadcast_spread_under_five_ms_for_100_clients():
    manager = WebSocketManager()
    websockets: list[_FakeWebSocket] = []
    for idx in range(100):
        websocket = _FakeWebSocket(delay_seconds=0.001)
        manager.active_connections[f"client-{idx}"] = websocket
        websockets.append(websocket)

    asyncio.run(manager.broadcast("payload"))

    receive_times = [ws.received_at for ws in websockets if ws.received_at is not None]
    assert len(receive_times) == 100
    spread_ms = (max(receive_times) - min(receive_times)) * 1000.0
    assert spread_ms < 5.0


def test_broadcast_json_history_uses_bounded_queue():
    manager = WebSocketManager()
    manager.history_limit = 3

    for idx in range(5):
        asyncio.run(manager.broadcast_json({"idx": idx}, topic="meters"))

    history = manager.get_event_history("meters")
    assert [event["idx"] for event in history["events"]] == [2, 3, 4]


def test_broadcast_json_respects_topic_specific_history_limit():
    manager = WebSocketManager(topic_history_limits={"platform:events": 2})

    for idx in range(4):
        asyncio.run(manager.broadcast_json({"idx": idx}, topic="platform:events"))

    history = manager.get_event_history("platform:events")
    assert [event["idx"] for event in history["events"]] == [2, 3]


def test_broadcast_json_uses_binary_gzip_for_large_payloads():
    manager = WebSocketManager(enable_compression=True)
    websocket = _FakeWebSocket()
    manager.active_connections["client"] = websocket

    asyncio.run(manager.broadcast_json({"payload": "x" * 4096}))

    assert websocket.sent_messages == []
    assert len(websocket.sent_binary_messages) == 1
    assert gzip.decompress(websocket.sent_binary_messages[0]).decode("utf-8").startswith('{"payload":')
    assert manager.get_stats()["bytes_saved_by_compression"] > 0


def test_broadcast_disconnects_slow_clients_without_blocking_fast_clients():
    manager = WebSocketManager(send_timeout_seconds=0.01)
    fast_ws = _FakeWebSocket()
    slow_ws = _FakeWebSocket(delay_seconds=0.05)
    manager.active_connections["fast"] = fast_ws
    manager.active_connections["slow"] = slow_ws

    start = time.perf_counter()
    asyncio.run(manager.broadcast("payload"))
    elapsed = time.perf_counter() - start

    assert elapsed < 0.04
    assert "fast" in manager.active_connections
    assert "slow" not in manager.active_connections
    assert fast_ws.sent_messages == ["payload"]
    assert manager.get_stats()["slow_client_disconnects"] == 1


def test_disconnect_cleans_subscriptions_consistently_under_concurrent_broadcast():
    manager = WebSocketManager(send_timeout_seconds=0.05)
    websocket = _FakeWebSocket(delay_seconds=0.01)
    manager.active_connections["client"] = websocket
    manager.subscriptions["meters"] = {"client"}
    manager.connection_info["client"] = {"subscriptions": {"meters"}, "path": "/ws"}

    async def _run():
        async def _disconnect_later():
            await asyncio.sleep(0.001)
            await manager.disconnect("client")

        disconnect_task = asyncio.create_task(_disconnect_later())
        await manager.broadcast("payload", topic="meters")
        await disconnect_task

    asyncio.run(_run())

    assert "client" not in manager.active_connections
    assert manager.subscriptions == {}


def test_send_personal_message_disconnects_slow_client_after_timeout():
    manager = WebSocketManager(send_timeout_seconds=0.01)
    websocket = _FakeWebSocket(delay_seconds=0.05)
    manager.active_connections["client"] = websocket
    manager.connection_info["client"] = {"subscriptions": set(), "path": "/ws"}

    asyncio.run(manager.send_personal_message("payload", "client"))

    assert "client" not in manager.active_connections
    stats = manager.get_stats()
    assert stats["slow_client_disconnects"] == 1
    assert stats["send_failures"] == 1
