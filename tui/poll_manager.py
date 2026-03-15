"""Centralized subscription polling for the unified console."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Awaitable, Callable

from textual.message import Message


Fetcher = Callable[[], Awaitable[object]]


@dataclass(frozen=True)
class PollResult:
    """Normalized poll result payload."""

    name: str
    data: object | None
    error: str | None = None
    fetched_at: float = 0.0


class SubscriptionUpdated(Message):
    """Textual event emitted when subscription data changes."""

    def __init__(self, result: PollResult) -> None:
        super().__init__()
        self.result = result


class PollManager:
    """Own cadence rules and fetch dispatch for the active route only."""

    def __init__(self, fetchers: dict[str, Fetcher], cadence: dict[str, int] | None = None) -> None:
        self._fetchers = fetchers
        self._cadence = cadence or {}
        self._last_fetch: dict[str, float] = {}
        self._inflight: set[str] = set()

    def get_inflight_count(self) -> int:
        return len(self._inflight)

    def reset(self) -> None:
        self._last_fetch.clear()
        self._inflight.clear()

    def cadence_for(self, subscription: str) -> int:
        return self._cadence.get(subscription, 5)

    def due(self, subscriptions: list[str], now: float | None = None) -> list[str]:
        current_time = now if now is not None else time.time()
        due: list[str] = []
        for subscription in subscriptions:
            if subscription in self._inflight:
                continue
            cadence = self.cadence_for(subscription)
            last_fetch = self._last_fetch.get(subscription, 0.0)
            if current_time - last_fetch >= cadence:
                due.append(subscription)
        return due

    async def fetch(self, subscription: str) -> PollResult:
        self._inflight.add(subscription)
        self._last_fetch[subscription] = time.time()
        fetcher = self._fetchers[subscription]
        try:
            data = await fetcher()
            return PollResult(name=subscription, data=data, fetched_at=time.time())
        except Exception as exc:
            return PollResult(
                name=subscription,
                data=None,
                error=str(exc),
                fetched_at=time.time(),
            )
        finally:
            self._inflight.discard(subscription)
