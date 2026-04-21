"""Outbound webhook dispatcher for PlatformEvents.

Subscribes to the PlatformEventBus with a per-target filter, POSTs matching
events as JSON to registered URLs, signs with HMAC-SHA256 when a secret is set,
retries with exponential backoff, and persists both targets and delivery logs
to SQLite under /var/lib/map2.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import sqlite3
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from typing import Any, Awaitable, Callable
from uuid import uuid4

import httpx

from app.services.platform_event.bus import (
    PlatformEventBus,
    PlatformEventFilter,
    get_platform_event_bus,
)
from app.services.platform_event.envelope import PlatformEvent

logger = logging.getLogger(__name__)

DEFAULT_DB_PATH = "/var/lib/map2/webhooks.db"
DEFAULT_DELIVERY_LIMIT = 200
MAX_ATTEMPTS = 3
BACKOFF_BASE_SECONDS = 0.5


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class WebhookFilter:
    kinds: list[str] = field(default_factory=list)
    severities: list[str] = field(default_factory=list)
    nodes: list[str] = field(default_factory=list)
    min_priority: float = 0.0

    def to_bus_filter(self) -> PlatformEventFilter:
        return PlatformEventFilter(
            kinds=frozenset(self.kinds) if self.kinds else None,
            severities=frozenset(self.severities) if self.severities else None,
            nodes=frozenset(self.nodes) if self.nodes else None,
            min_priority=self.min_priority if self.min_priority > 0 else None,
        )


@dataclass
class WebhookTarget:
    id: str
    url: str
    filter: WebhookFilter
    secret: str | None
    enabled: bool
    created_at: str
    last_attempt_at: str | None = None
    last_status: str | None = None

    def to_dict(self, include_secret: bool = False) -> dict[str, Any]:
        data = {
            "id": self.id,
            "url": self.url,
            "filter": asdict(self.filter),
            "enabled": self.enabled,
            "created_at": self.created_at,
            "last_attempt_at": self.last_attempt_at,
            "last_status": self.last_status,
            "has_secret": self.secret is not None,
        }
        if include_secret:
            data["secret"] = self.secret
        return data


@dataclass
class DeliveryAttempt:
    id: str
    target_id: str
    event_id: str
    attempt: int
    status_code: int | None
    ok: bool
    error: str | None
    duration_ms: int
    sent_at: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


HttpPoster = Callable[[str, dict[str, str], bytes], Awaitable["_PosterResult"]]


@dataclass
class _PosterResult:
    status_code: int | None
    ok: bool
    error: str | None


async def _default_poster(url: str, headers: dict[str, str], body: bytes) -> _PosterResult:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(url, headers=headers, content=body)
        return _PosterResult(status_code=resp.status_code, ok=resp.is_success, error=None)
    except httpx.HTTPError as exc:
        return _PosterResult(status_code=None, ok=False, error=str(exc))
    except Exception as exc:  # noqa: BLE001 — defensive: never crash the bus
        return _PosterResult(status_code=None, ok=False, error=f"{type(exc).__name__}: {exc}")


class WebhookDispatcherService:
    """Manages webhook targets, persists deliveries, and dispatches matching events."""

    def __init__(
        self,
        *,
        db_path: str = DEFAULT_DB_PATH,
        bus: PlatformEventBus | None = None,
        poster: HttpPoster | None = None,
        sleep: Callable[[float], Awaitable[None]] | None = None,
    ) -> None:
        self._db_path = Path(db_path)
        self._bus = bus
        self._poster = poster or _default_poster
        self._sleep = sleep or asyncio.sleep
        self._lock = RLock()
        self._targets: dict[str, WebhookTarget] = {}
        self._subscription = None
        self._started = False
        self._ensure_db()
        self._load_targets()

    def _ensure_db(self) -> None:
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self._db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS webhook_targets (
                    id TEXT PRIMARY KEY,
                    url TEXT NOT NULL,
                    filter_json TEXT NOT NULL,
                    secret TEXT,
                    enabled INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    last_attempt_at TEXT,
                    last_status TEXT
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS webhook_deliveries (
                    id TEXT PRIMARY KEY,
                    target_id TEXT NOT NULL,
                    event_id TEXT NOT NULL,
                    attempt INTEGER NOT NULL,
                    status_code INTEGER,
                    ok INTEGER NOT NULL,
                    error TEXT,
                    duration_ms INTEGER NOT NULL,
                    sent_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_deliveries_target "
                "ON webhook_deliveries(target_id, sent_at DESC)"
            )
            conn.commit()

    def _load_targets(self) -> None:
        with sqlite3.connect(self._db_path) as conn:
            cursor = conn.execute(
                "SELECT id, url, filter_json, secret, enabled, created_at, "
                "last_attempt_at, last_status FROM webhook_targets"
            )
            for row in cursor.fetchall():
                filter_obj = WebhookFilter(**json.loads(row[2]))
                target = WebhookTarget(
                    id=row[0],
                    url=row[1],
                    filter=filter_obj,
                    secret=row[3],
                    enabled=bool(row[4]),
                    created_at=row[5],
                    last_attempt_at=row[6],
                    last_status=row[7],
                )
                self._targets[target.id] = target

    def list_targets(self) -> list[WebhookTarget]:
        with self._lock:
            return list(self._targets.values())

    def get_target(self, target_id: str) -> WebhookTarget | None:
        with self._lock:
            return self._targets.get(target_id)

    def register_target(
        self,
        *,
        url: str,
        filter_spec: WebhookFilter | None = None,
        secret: str | None = None,
        enabled: bool = True,
    ) -> WebhookTarget:
        if not url or not url.startswith(("http://", "https://")):
            raise ValueError("url must be a valid http(s) URL")
        target = WebhookTarget(
            id=str(uuid4()),
            url=url,
            filter=filter_spec or WebhookFilter(),
            secret=secret or None,
            enabled=bool(enabled),
            created_at=_utc_now_iso(),
        )
        with self._lock, sqlite3.connect(self._db_path) as conn:
            conn.execute(
                "INSERT INTO webhook_targets (id, url, filter_json, secret, enabled, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (
                    target.id,
                    target.url,
                    json.dumps(asdict(target.filter)),
                    target.secret,
                    1 if target.enabled else 0,
                    target.created_at,
                ),
            )
            conn.commit()
            self._targets[target.id] = target
        return target

    def delete_target(self, target_id: str) -> bool:
        with self._lock, sqlite3.connect(self._db_path) as conn:
            cursor = conn.execute("DELETE FROM webhook_targets WHERE id = ?", (target_id,))
            conn.execute("DELETE FROM webhook_deliveries WHERE target_id = ?", (target_id,))
            conn.commit()
            self._targets.pop(target_id, None)
            return cursor.rowcount > 0

    def list_deliveries(
        self, target_id: str, limit: int = DEFAULT_DELIVERY_LIMIT
    ) -> list[DeliveryAttempt]:
        limit = max(1, min(int(limit), 1000))
        with sqlite3.connect(self._db_path) as conn:
            cursor = conn.execute(
                "SELECT id, target_id, event_id, attempt, status_code, ok, error, "
                "duration_ms, sent_at FROM webhook_deliveries "
                "WHERE target_id = ? ORDER BY sent_at DESC LIMIT ?",
                (target_id, limit),
            )
            return [
                DeliveryAttempt(
                    id=row[0],
                    target_id=row[1],
                    event_id=row[2],
                    attempt=row[3],
                    status_code=row[4],
                    ok=bool(row[5]),
                    error=row[6],
                    duration_ms=row[7],
                    sent_at=row[8],
                )
                for row in cursor.fetchall()
            ]

    def _record_delivery(self, attempt: DeliveryAttempt) -> None:
        with sqlite3.connect(self._db_path) as conn:
            conn.execute(
                "INSERT INTO webhook_deliveries (id, target_id, event_id, attempt, "
                "status_code, ok, error, duration_ms, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    attempt.id,
                    attempt.target_id,
                    attempt.event_id,
                    attempt.attempt,
                    attempt.status_code,
                    1 if attempt.ok else 0,
                    attempt.error,
                    attempt.duration_ms,
                    attempt.sent_at,
                ),
            )
            last_status = (
                f"{attempt.status_code}" if attempt.ok
                else (attempt.error or f"HTTP {attempt.status_code or 'error'}")
            )
            conn.execute(
                "UPDATE webhook_targets SET last_attempt_at = ?, last_status = ? WHERE id = ?",
                (attempt.sent_at, last_status, attempt.target_id),
            )
            conn.commit()
        target = self._targets.get(attempt.target_id)
        if target is not None:
            target.last_attempt_at = attempt.sent_at
            target.last_status = (
                f"{attempt.status_code}" if attempt.ok
                else (attempt.error or f"HTTP {attempt.status_code or 'error'}")
            )

    async def deliver_event(self, target: WebhookTarget, event: PlatformEvent) -> bool:
        """Attempt delivery of a single event to a single target with retries."""
        payload = event.model_dump(mode="json")
        body = json.dumps(payload, separators=(",", ":"), default=str).encode("utf-8")
        for attempt_num in range(1, MAX_ATTEMPTS + 1):
            headers = {
                "Content-Type": "application/json",
                "X-Map2-Event-Id": event.event_id,
                "X-Map2-Event-Kind": event.kind,
                "X-Map2-Attempt": str(attempt_num),
            }
            if target.secret:
                signature = hmac.new(
                    target.secret.encode("utf-8"), body, hashlib.sha256
                ).hexdigest()
                headers["X-Map2-Signature"] = f"sha256={signature}"
            t0 = time.monotonic()
            result = await self._poster(target.url, headers, body)
            duration_ms = int((time.monotonic() - t0) * 1000)
            attempt = DeliveryAttempt(
                id=str(uuid4()),
                target_id=target.id,
                event_id=event.event_id,
                attempt=attempt_num,
                status_code=result.status_code,
                ok=result.ok,
                error=result.error,
                duration_ms=duration_ms,
                sent_at=_utc_now_iso(),
            )
            self._record_delivery(attempt)
            if result.ok:
                return True
            if attempt_num < MAX_ATTEMPTS:
                await self._sleep(BACKOFF_BASE_SECONDS * (2 ** (attempt_num - 1)))
        return False

    async def _on_event(self, event: PlatformEvent) -> None:
        with self._lock:
            targets = [t for t in self._targets.values() if t.enabled]
        for target in targets:
            if not target.filter.to_bus_filter().matches(event):
                continue
            try:
                await self.deliver_event(target, event)
            except Exception as exc:  # noqa: BLE001 — isolate per-target failure
                logger.warning("Webhook dispatch to %s failed: %s", target.url, exc)

    async def start(self) -> None:
        if self._started:
            return
        bus = self._bus or get_platform_event_bus()
        self._bus = bus
        self._subscription = await bus.subscribe_callback(self._on_event)
        self._started = True
        logger.info(
            "WebhookDispatcherService started with %d target(s)", len(self._targets)
        )

    async def stop(self) -> None:
        if self._subscription is not None:
            self._subscription.close()
            self._subscription = None
        self._started = False


_instance_lock = RLock()
_instance: WebhookDispatcherService | None = None


def get_webhook_dispatcher_service(
    *, db_path: str | None = None
) -> WebhookDispatcherService:
    global _instance
    with _instance_lock:
        if _instance is None:
            _instance = WebhookDispatcherService(
                db_path=db_path or DEFAULT_DB_PATH,
            )
        return _instance


def reset_webhook_dispatcher_service_for_tests() -> None:
    global _instance
    with _instance_lock:
        _instance = None


__all__ = [
    "DeliveryAttempt",
    "WebhookDispatcherService",
    "WebhookFilter",
    "WebhookTarget",
    "get_webhook_dispatcher_service",
    "reset_webhook_dispatcher_service_for_tests",
]
