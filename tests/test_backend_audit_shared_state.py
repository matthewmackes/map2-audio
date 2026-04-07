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
