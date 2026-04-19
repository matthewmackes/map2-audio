import asyncio
import threading
from pathlib import Path
from tempfile import TemporaryDirectory

from app.services.graceful_degradation import Feature, FeatureAvailabilityManager, FeatureLevel
from app.services.platform_event.bus import PlatformEventBus, PlatformEventFilter
from app.services.platform_event.factories import make_node_online
from app.services.platform_event.replay import PlatformEventReplayBuffer
from app.services.platform_event.store import PlatformEventStore
from app.services.websocket_manager import WebSocketManager


def _make_bus(tmp_dir: str) -> PlatformEventBus:
    store = PlatformEventStore(
        db_path=Path(tmp_dir) / "platform-events.db",
        legacy_db_path=Path(tmp_dir) / "cluster-events.db",
    )
    return PlatformEventBus(
        store=store,
        websocket_manager=WebSocketManager(enable_compression=False),
        replay_buffer=PlatformEventReplayBuffer(session_limit=10),
        enabled=True,
    )


def test_platform_event_bus_publish_uses_callback_snapshot_during_close():
    PlatformEventStore.reset_instance()
    with TemporaryDirectory() as tmp_dir:
        bus = _make_bus(tmp_dir)
        observed: list[str] = []
        subscription_b = None

        async def scenario():
            nonlocal subscription_b
            event_filter = PlatformEventFilter(kinds=frozenset({"node.online"}))

            async def first_callback(event):
                subscription_b.close()
                observed.append(f"first:{event.source_node}")

            async def second_callback(event):
                observed.append(f"second:{event.source_node}")

            await bus.subscribe_callback(first_callback, event_filter)
            subscription_b = await bus.subscribe_callback(second_callback, event_filter)
            await bus.emit(make_node_online(node_id="node-a", source_service="audit_test", first_seen=True))

        asyncio.run(scenario())

        assert observed == ["first:node-a", "second:node-a"]


def test_platform_event_bus_sync_callbacks_run_off_event_loop_thread():
    PlatformEventStore.reset_instance()
    with TemporaryDirectory() as tmp_dir:
        bus = _make_bus(tmp_dir)
        callback_thread_ids: list[int] = []
        event_loop_thread_ids: list[int] = []

        def callback(event):
            callback_thread_ids.append(threading.get_ident())

        async def scenario():
            event_loop_thread_ids.append(threading.get_ident())
            await bus.subscribe_callback(
                callback,
                PlatformEventFilter(kinds=frozenset({"node.online"})),
            )
            await bus.emit(make_node_online(node_id="node-a", source_service="audit_test", first_seen=True))

        asyncio.run(scenario())

        assert callback_thread_ids
        assert callback_thread_ids[0] != event_loop_thread_ids[0]


def test_platform_event_bus_replay_returns_latest_event_at_limit():
    PlatformEventStore.reset_instance()
    with TemporaryDirectory() as tmp_dir:
        bus = _make_bus(tmp_dir)

        async def scenario():
            await bus.emit(make_node_online(node_id="node-a", source_service="audit_test", first_seen=True))
            await bus.emit(make_node_online(node_id="node-b", source_service="audit_test"))
            await bus.emit(make_node_online(node_id="node-c", source_service="audit_test"))
            return await bus.replay(limit=10)

        replayed = asyncio.run(scenario())

        assert [event.source_node for event in replayed] == ["node-a", "node-b", "node-c"]


def test_feature_manager_register_and_read_are_lock_safe():
    manager = FeatureAvailabilityManager()

    def _register(start: int):
        for index in range(start, start + 50):
            manager.register_feature(Feature(name=f"feature-{index}", level=FeatureLevel.STANDARD))

    threads = [threading.Thread(target=_register, args=(offset,)) for offset in (0, 50)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=1.0)

    health = manager.get_system_health()

    assert health["total_features"] == 100
    assert manager.get_feature_status("feature-0") is not None
