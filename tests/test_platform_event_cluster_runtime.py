from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from app.services.cluster.failover_monitor import FailoverMonitor
from app.services.cluster.heartbeat_monitor import HeartbeatMonitor, NodeHealthStatus
from app.services.platform_event.envelope import PlatformEvent


class _Subscription:
    def __init__(self) -> None:
        self.closed = False

    def close(self) -> None:
        self.closed = True


class _PlatformEventBus:
    def __init__(self) -> None:
        self.emitted: list[PlatformEvent] = []
        self.filter = None
        self.callback = None
        self.subscription = _Subscription()

    async def emit(self, event: PlatformEvent) -> None:
        self.emitted.append(event)

    async def subscribe_callback(self, callback, event_filter=None):
        self.callback = callback
        self.filter = event_filter
        return self.subscription


def test_failover_monitor_start_and_stop_use_platform_event_subscription():
    monitor = FailoverMonitor()
    fake_bus = _PlatformEventBus()
    monitor.event_bus = fake_bus

    asyncio.run(monitor.start())

    assert fake_bus.filter is not None
    assert fake_bus.filter.kinds == frozenset({"node.offline"})
    assert monitor._subscription is fake_bus.subscription

    asyncio.run(monitor.stop())

    assert fake_bus.subscription.closed is True


def test_heartbeat_monitor_offline_emits_canonical_platform_event():
    monitor = HeartbeatMonitor()
    monitor.event_bus = _PlatformEventBus()
    monitor.failure_threshold = 3
    monitor.node_health["node-a"] = NodeHealthStatus(
        node_id="node-a",
        is_online=True,
        last_seen=datetime.now(timezone.utc),
        consecutive_failures=2,
    )

    asyncio.run(monitor._mark_node_failure("node-a", "timeout"))

    emitted = monitor.event_bus.emitted
    assert len(emitted) == 1
    assert emitted[0].kind == "node.offline"
    assert emitted[0].source_node == "node-a"
    assert emitted[0].context["consecutive_failures"] == 3
    assert emitted[0].context["last_error"] == "timeout"
