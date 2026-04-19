"""Session replay ring buffer for PlatformEvent streams."""

from __future__ import annotations

from collections import deque
from threading import RLock

from .envelope import PlatformEvent


class PlatformEventReplayBuffer:
    """Bounded per-session replay buffer keyed by session id."""

    def __init__(self, *, session_limit: int = 1000) -> None:
        self._session_limit = max(1, int(session_limit))
        self._lock = RLock()
        self._sessions: dict[str, deque[PlatformEvent]] = {}

    def record(self, session_id: str, event: PlatformEvent) -> None:
        normalized = str(session_id or "").strip()
        if not normalized:
            return
        with self._lock:
            bucket = self._sessions.get(normalized)
            if bucket is None:
                bucket = deque(maxlen=self._session_limit)
                self._sessions[normalized] = bucket
            bucket.append(event)

    def get_since(self, session_id: str, cursor: str | None = None) -> list[PlatformEvent]:
        normalized = str(session_id or "").strip()
        if not normalized:
            return []
        with self._lock:
            bucket = list(self._sessions.get(normalized, ()))
        if not cursor:
            return bucket
        seen = False
        replay: list[PlatformEvent] = []
        for event in bucket:
            if seen:
                replay.append(event)
            elif event.event_id == cursor:
                seen = True
        return replay
