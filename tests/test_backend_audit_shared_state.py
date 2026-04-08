import asyncio
import threading

from app.services.event_bus import EventBus, EventType
from app.services.graceful_degradation import Feature, FeatureAvailabilityManager, FeatureLevel


def test_event_bus_publish_uses_subscriber_snapshot_during_unsubscribe():
    bus = EventBus()
    observed: list[dict] = []
    started = threading.Event()

    async def callback(data):
        started.set()
        await asyncio.sleep(0.01)
        observed.append(data)

    async def scenario():
        await bus.subscribe(EventType.NODE_ONLINE, callback)

        publish_task = asyncio.create_task(bus.publish(EventType.NODE_ONLINE, {"node": "a"}))
        await asyncio.sleep(0)

        def _unsubscribe():
            asyncio.run(bus.unsubscribe(EventType.NODE_ONLINE, callback))

        thread = threading.Thread(target=_unsubscribe)
        thread.start()
        await publish_task
        thread.join(timeout=0.5)

    asyncio.run(scenario())

    assert started.is_set()
    assert observed == [{"node": "a"}]


def test_event_bus_sync_callbacks_run_off_event_loop_thread():
    bus = EventBus()
    callback_thread_ids: list[int] = []
    event_loop_thread_ids: list[int] = []

    def callback(data):
        callback_thread_ids.append(threading.get_ident())

    async def scenario():
        event_loop_thread_ids.append(threading.get_ident())
        await bus.subscribe(EventType.NODE_ONLINE, callback)
        await bus.publish(EventType.NODE_ONLINE, {"node": "a"})

    asyncio.run(scenario())

    assert callback_thread_ids
    assert callback_thread_ids[0] != event_loop_thread_ids[0]


def test_event_bus_history_uses_bounded_deque():
    bus = EventBus()

    async def scenario():
        for index in range(1005):
            await bus.publish(EventType.NODE_ONLINE, {"node": f"node-{index}"})

    asyncio.run(scenario())

    assert bus._event_history.maxlen == 1000
    assert len(bus._event_history) == 1000
    assert bus.get_history(limit=1)[0]["data"]["node"] == "node-1004"


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
