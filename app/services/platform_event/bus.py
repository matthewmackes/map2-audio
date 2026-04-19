"""PlatformEvent bus backed by a dedicated PlatformEventStore."""

from __future__ import annotations

import asyncio
import contextlib
import inspect
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from threading import RLock
from typing import Any, AsyncIterator, Awaitable, Callable

from app.config import config_get
from app.services.alert_services import AlertGrouper, AlertPrioritizer
from app.services.websocket_manager import WebSocketManager, ws_manager
from app.utils.singleton import Singleton

from .envelope import PlatformEvent
from .factories import make_event
from .replay import PlatformEventReplayBuffer
from .store import PlatformEventStore

logger = logging.getLogger(__name__)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _coerce_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _flag(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class PlatformEventFilter:
    kinds: frozenset[str] | None = None
    severities: frozenset[str] | None = None
    nodes: frozenset[str] | None = None
    surfaces: frozenset[str] | None = None
    min_priority: float | None = None

    def matches(self, event: PlatformEvent) -> bool:
        if self.kinds is not None and event.kind not in self.kinds:
            return False
        if self.severities is not None and event.severity.value not in self.severities:
            return False
        if self.nodes is not None and event.source_node not in self.nodes:
            return False
        if self.surfaces is not None:
            targets = set(event.target_surfaces or [])
            if targets and targets.isdisjoint(self.surfaces):
                return False
        if self.min_priority is not None and event.priority < self.min_priority:
            return False
        if event.expires_at is not None and _coerce_utc(event.expires_at) <= _utc_now():
            return False
        return True


@dataclass
class Subscription:
    callback: Callable[[PlatformEvent], Awaitable[None] | None]
    event_filter: PlatformEventFilter
    active: bool = True

    def close(self) -> None:
        self.active = False


class PlatformEventBus(Singleton):
    """Async-first bus for the canonical PlatformEvent control-plane."""

    def __init__(
        self,
        *,
        store: PlatformEventStore | None = None,
        websocket_manager: WebSocketManager | None = None,
        replay_buffer: PlatformEventReplayBuffer | None = None,
        enabled: bool | None = None,
    ) -> None:
        super().__init__()
        self._store = store or PlatformEventStore.get_instance()
        self._websocket_manager = websocket_manager or ws_manager
        self._prioritizer = AlertPrioritizer()
        self._grouper = AlertGrouper()
        self._replay = replay_buffer or PlatformEventReplayBuffer(
            session_limit=int(config_get("platform_event.session_replay_limit", 1000) or 1000)
        )
        self._enabled = _flag("PLATFORM_EVENT_BUS_ENABLED", False) if enabled is None else bool(enabled)
        self._lock = RLock()
        self._subscriptions: dict[int, tuple[PlatformEventFilter, asyncio.Queue[PlatformEvent | None]]] = {}
        self._callbacks: dict[int, Subscription] = {}
        self._dedupe_latest: dict[str, tuple[str, int]] = {}
        self._subscription_counter = 0
        self._configure_websocket_history()

    @property
    def enabled(self) -> bool:
        return self._enabled

    @property
    def store(self) -> PlatformEventStore:
        return self._store

    def _configure_websocket_history(self) -> None:
        limit = int(config_get("platform_event.websocket_topic_history_limit", 200) or 200)
        self._websocket_manager.topic_history_limits.setdefault("platform:events", limit)

    def _set_websocket_history_limit(self, topic: str) -> None:
        if not topic.startswith("platform:events"):
            return
        limit = int(config_get("platform_event.websocket_topic_history_limit", 200) or 200)
        self._websocket_manager.topic_history_limits.setdefault(topic, limit)

    async def emit(self, event: PlatformEvent | dict[str, Any]) -> str:
        platform_event = event if isinstance(event, PlatformEvent) else PlatformEvent.model_validate(event)
        if not self._enabled:
            return platform_event.event_id
        enriched_event = self._prepare_event(platform_event)
        inserted = self._store.persist_event(enriched_event)
        if not inserted:
            return enriched_event.event_id
        await self._fanout(enriched_event)
        return enriched_event.event_id

    async def ingest_remote(self, event: PlatformEvent | dict[str, Any], *, via_node: str) -> str:
        platform_event = event if isinstance(event, PlatformEvent) else PlatformEvent.model_validate(event)
        context = dict(platform_event.context or {})
        if context.get("federated_from"):
            return platform_event.event_id
        context["federated_from"] = str(via_node)
        remote_event = platform_event.model_copy(update={"context": context})
        return await self.emit(remote_event)

    def emit_threadsafe(self, event: PlatformEvent | dict[str, Any]) -> None:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            asyncio.run(self.emit(event))
            return
        loop.create_task(self.emit(event))

    async def subscribe(
        self,
        kinds: list[str] | None = None,
        severities: list[str] | None = None,
        nodes: list[str] | None = None,
        surfaces: list[str] | None = None,
        min_priority: float | None = None,
    ) -> AsyncIterator[PlatformEvent]:
        event_filter = PlatformEventFilter(
            kinds=frozenset(kinds) if kinds else None,
            severities=frozenset(severities) if severities else None,
            nodes=frozenset(nodes) if nodes else None,
            surfaces=frozenset(surfaces) if surfaces else None,
            min_priority=min_priority,
        )
        queue: asyncio.Queue[PlatformEvent | None] = asyncio.Queue()
        with self._lock:
            subscription_id = self._next_subscription_id()
            self._subscriptions[subscription_id] = (event_filter, queue)
        try:
            while True:
                event = await queue.get()
                if event is None:
                    break
                yield event
        finally:
            with self._lock:
                self._subscriptions.pop(subscription_id, None)

    async def subscribe_callback(
        self,
        cb: Callable[[PlatformEvent], Awaitable[None] | None],
        event_filter: PlatformEventFilter | None = None,
    ) -> Subscription:
        subscription = Subscription(callback=cb, event_filter=event_filter or PlatformEventFilter())
        with self._lock:
            self._callbacks[self._next_subscription_id()] = subscription
        return subscription

    async def replay(
        self,
        cursor: str | None = None,
        event_filter: PlatformEventFilter | None = None,
        session_id: str | None = None,
        limit: int = 100,
    ) -> list[PlatformEvent]:
        matches = self._store.load_replay_events(cursor=cursor, limit=limit)
        if session_id:
            recent = self._replay.get_since(session_id, cursor)
            for event in recent:
                if event_filter is None or event_filter.matches(event):
                    matches.append(event)
        latest_by_dedupe: dict[str, PlatformEvent] = {}
        ordered: list[PlatformEvent] = []
        for event in matches:
            dedupe_key = event.dedupe_key or event.event_id
            latest_by_dedupe[dedupe_key] = event
        seen_ids = {event.event_id for event in latest_by_dedupe.values()}
        for event in matches:
            if event.event_id in seen_ids:
                ordered.append(event)
                seen_ids.remove(event.event_id)
        return ordered

    async def ack(self, session_id: str, event_id: str) -> None:
        normalized_session = str(session_id or "").strip()
        normalized_event_id = str(event_id or "").strip()
        if not normalized_session or not normalized_event_id:
            return
        self._store.ack(normalized_session, normalized_event_id)

    def _next_subscription_id(self) -> int:
        self._subscription_counter += 1
        return self._subscription_counter

    def _prepare_event(self, event: PlatformEvent) -> PlatformEvent:
        payload = event.model_dump()
        payload["occurred_at"] = _coerce_utc(event.occurred_at)
        payload["expires_at"] = _coerce_utc(event.expires_at) if event.expires_at else None
        priority = self._prioritizer.calculate_priority(
            {
                "event_id": event.event_id,
                "severity": event.severity.value.upper(),
                "source_node": event.source_node,
                "event_type": event.kind,
                "timestamp": event.occurred_at,
            }
        )
        payload["priority"] = priority.final_score
        self._grouper.add_event(
            {
                "event_id": event.event_id,
                "event_type": event.kind,
                "severity": event.severity.value.upper(),
                "source_node": event.source_node,
            }
        )
        dedupe_key = event.dedupe_key
        if dedupe_key:
            current_rank = self._severity_rank(event.severity.value)
            previous = self._dedupe_latest.get(dedupe_key)
            if previous and current_rank >= previous[1] and previous[0] != event.event_id:
                payload["supersedes"] = previous[0]
            self._dedupe_latest[dedupe_key] = (event.event_id, current_rank)
        return PlatformEvent.model_validate(payload)

    def _severity_rank(self, value: str) -> int:
        return {"info": 1, "warning": 2, "error": 3, "critical": 4}.get(str(value), 0)

    async def _fanout(self, event: PlatformEvent) -> None:
        await self._fanout_subscribers(event)
        await self._fanout_callbacks(event)
        await self._fanout_websocket(event)

    async def _fanout_subscribers(self, event: PlatformEvent) -> None:
        with self._lock:
            subscriptions = list(self._subscriptions.values())
        for event_filter, queue in subscriptions:
            if event_filter.matches(event):
                await queue.put(event)

    async def _fanout_callbacks(self, event: PlatformEvent) -> None:
        with self._lock:
            stale_subscription_ids = [
                subscription_id
                for subscription_id, subscription in self._callbacks.items()
                if not subscription.active
            ]
            callbacks = [
                (subscription_id, subscription)
                for subscription_id, subscription in self._callbacks.items()
                if subscription.active and subscription.event_filter.matches(event)
            ]
            for subscription_id in stale_subscription_ids:
                self._callbacks.pop(subscription_id, None)
        for _, subscription in callbacks:
            if inspect.iscoroutinefunction(subscription.callback):
                await subscription.callback(event)
                continue
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, subscription.callback, event)

    async def _fanout_websocket(self, event: PlatformEvent) -> None:
        payload = {"type": "platform_event", "data": event.model_dump(mode="json")}
        topics = ["platform:events", f"platform:events:{event.severity.value}"]
        topics.extend(self._kind_topics(event.kind))
        for topic in topics:
            self._set_websocket_history_limit(topic)
            await self._websocket_manager.broadcast_json(payload, topic=topic)

    def _kind_topics(self, kind: str) -> list[str]:
        pieces = kind.split(".")
        topics: list[str] = []
        for index in range(1, len(pieces) + 1):
            prefix = ".".join(pieces[:index])
            topics.append(f"platform:events:kind:{prefix}")
        return topics

def get_platform_event_bus() -> PlatformEventBus:
    return PlatformEventBus.get_instance()


__all__ = ["PlatformEventBus", "PlatformEventFilter", "Subscription", "get_platform_event_bus", "make_event"]
