"""
Authoritative runtime live-state projection for unified snapshots.

This service separates activation intent from runtime-confirmed truth. It keeps
per-node live-state projections and activation audit events durable in the
database, broadcasts authoritative websocket updates, and provides cluster read
aggregation via peer runtime endpoints.
"""

from __future__ import annotations

import asyncio
import copy
import logging
import socket
from collections import defaultdict, deque
from contextlib import asynccontextmanager, suppress
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

import httpx
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import (
    SnapshotActivationEvent,
    SnapshotNodeLiveState,
    get_session,
)

logger = logging.getLogger(__name__)

RUNTIME_LIVE_STATE_TOPIC = "snapshot_runtime_live_state"
ACTIVATION_EVENTS_TOPIC = "snapshot_activation_events"
WARNING_AFTER_SECONDS = 10.0
OFFLINE_AFTER_SECONDS = 15.0
HEARTBEAT_INTERVAL_SECONDS = 1.0
ACTIVATION_EVENT_LIMIT_PER_NODE = 100
POST_ACTIVATION_VERIFY_DELAY_SECONDS = 2.5
CHANNEL_STATUS_ACTIVE = "active"
CHANNEL_STATUS_NOT_LOADED = "not_loaded"
CHANNEL_STATUS_OFFLINE = "offline"
_health_check_tasks: set[asyncio.Task[None]] = set()


def resolve_local_node_id() -> str:
    for env_name in ("NODE_ID", "MAP2_NODE_ID"):
        env_value = str(__import__("os").getenv(env_name) or "").strip()
        if env_value:
            return env_value

    try:
        from app.services.cluster.enhanced_node_identity import get_enhanced_node_identity

        node_id = str(get_enhanced_node_identity().get_node_id() or "").strip()
        if node_id:
            return node_id
    except Exception:
        pass

    return socket.gethostname() or "local"


def _as_iso(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() if isinstance(value, datetime) else None


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _parse_iso_datetime(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).replace(tzinfo=None) if value.tzinfo else value
    if isinstance(value, str) and value.strip():
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed.astimezone(timezone.utc).replace(tzinfo=None) if parsed.tzinfo else parsed
        except Exception:
            return None
    return None


def _coerce_optional_int(value: Any) -> Optional[int]:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed


def _normalize_channel_label(value: Any, fallback: Any) -> str:
    label = str(value or "").strip()
    if label:
        return label
    backup = str(fallback or "").strip()
    return backup or "Channel"


def _normalize_channel_health_status(value: Any) -> Optional[str]:
    normalized = str(value or "").strip().lower()
    if normalized == CHANNEL_STATUS_ACTIVE:
        return CHANNEL_STATUS_ACTIVE
    if normalized == CHANNEL_STATUS_OFFLINE:
        return CHANNEL_STATUS_OFFLINE
    if normalized in {"not_loaded", "inactive", "partial", "degraded", "capability_gap", "missing"}:
        return CHANNEL_STATUS_NOT_LOADED
    return None


def _channel_health_message(label: str, status: str) -> str:
    if status == CHANNEL_STATUS_OFFLINE:
        return f"Channel {label} offline."
    return f"Channel {label} not loaded."


class SnapshotRuntimeStateService:
    """Node-scoped runtime truth, audit, and cluster aggregation helpers."""

    _activation_event_cache: dict[str, deque[dict[str, Any]]] = defaultdict(
        lambda: deque(maxlen=ACTIVATION_EVENT_LIMIT_PER_NODE)
    )

    def __init__(self, session: Optional[AsyncSession] = None):
        self.session = session
        self.local_node_id = resolve_local_node_id()

    @asynccontextmanager
    async def _session_scope(self):
        if self.session is not None:
            yield self.session
            return

        async with get_session() as session:
            yield session

    async def _get_or_create_local_state_row(self, session: AsyncSession) -> SnapshotNodeLiveState:
        result = await session.execute(
            select(SnapshotNodeLiveState).where(SnapshotNodeLiveState.node_id == self.local_node_id)
        )
        row = result.scalar_one_or_none()
        if row is None:
            row = SnapshotNodeLiveState(
                node_id=self.local_node_id,
                state="stopped",
                seq=0,
                live_snapshot_payload={},
                runtime_metrics={},
                last_runtime_event_at=None,
                last_transition_at=None,
            )
            session.add(row)
            await session.flush()
        return row

    async def _get_local_state_row(self, session: AsyncSession) -> Optional[SnapshotNodeLiveState]:
        result = await session.execute(
            select(SnapshotNodeLiveState).where(SnapshotNodeLiveState.node_id == self.local_node_id)
        )
        return result.scalar_one_or_none()

    def _serialize_live_state_row(
        self,
        row: Optional[SnapshotNodeLiveState],
        *,
        now: Optional[datetime] = None,
        node_id: Optional[str] = None,
        unavailable_reason: Optional[str] = None,
    ) -> dict[str, Any]:
        now = now or _utcnow()
        effective_node_id = node_id or (row.node_id if row is not None else self.local_node_id)

        if row is None:
            return {
                "node_id": effective_node_id,
                "seq": 0,
                "emitted_at": None,
                "state": "stopped",
                "snapshot_id": None,
                "snapshot_revision": None,
                "snapshot_name": None,
                "triggered_by": None,
                "live_snapshot_payload": None,
                "last_successful_request_id": None,
                "failure_reason": unavailable_reason,
                "runtime_metrics": {},
                "warning_threshold_seconds": WARNING_AFTER_SECONDS,
                "offline_threshold_seconds": OFFLINE_AFTER_SECONDS,
                "age_seconds": None,
                "is_warning": False,
                "is_offline": bool(unavailable_reason),
                "display_state": "offline" if unavailable_reason else "stopped",
                "display_label": "Offline" if unavailable_reason else "Stopped",
            }

        live_snapshot_payload = (
            copy.deepcopy(row.live_snapshot_payload)
            if isinstance(row.live_snapshot_payload, dict)
            else None
        )
        emitted_at = row.last_runtime_event_at
        age_seconds = None
        if isinstance(emitted_at, datetime):
            age_seconds = max(0.0, (now - emitted_at).total_seconds())

        state = str(row.state or "stopped").lower()
        is_warning = bool(state == "live" and age_seconds is not None and age_seconds >= WARNING_AFTER_SECONDS)
        is_offline = bool(state == "live" and age_seconds is not None and age_seconds >= OFFLINE_AFTER_SECONDS)
        if is_offline:
            display_state = "offline"
            display_label = "Offline"
        elif is_warning:
            display_state = "live_warning"
            display_label = "Live (warning)"
        elif state == "live":
            display_state = "live"
            display_label = "Live"
        else:
            display_state = "stopped"
            display_label = "Stopped"

        snapshot_name = None
        if isinstance(live_snapshot_payload, dict):
            snapshot_name = live_snapshot_payload.get("name")

        return {
            "node_id": row.node_id,
            "seq": int(row.seq or 0),
            "emitted_at": _as_iso(emitted_at),
            "state": state,
            "snapshot_id": row.snapshot_id,
            "snapshot_revision": row.snapshot_revision,
            "snapshot_name": snapshot_name,
            "triggered_by": row.triggered_by,
            "live_snapshot_payload": live_snapshot_payload,
            "last_successful_request_id": row.last_successful_request_id,
            "failure_reason": row.failure_reason,
            "runtime_metrics": copy.deepcopy(row.runtime_metrics) if isinstance(row.runtime_metrics, dict) else {},
            "warning_threshold_seconds": WARNING_AFTER_SECONDS,
            "offline_threshold_seconds": OFFLINE_AFTER_SECONDS,
            "age_seconds": age_seconds,
            "is_warning": is_warning,
            "is_offline": is_offline,
            "display_state": display_state,
            "display_label": display_label,
        }

    def _serialize_activation_event(self, row: SnapshotActivationEvent) -> dict[str, Any]:
        return {
            "id": row.id,
            "node_id": row.node_id,
            "request_id": row.request_id,
            "snapshot_id": row.snapshot_id,
            "snapshot_name": row.snapshot_name,
            "snapshot_revision": row.snapshot_revision,
            "triggered_by": row.triggered_by,
            "requested_at": _as_iso(row.requested_at),
            "confirmed_live_at": _as_iso(row.confirmed_live_at),
            "outcome": row.outcome,
            "failure_reason": row.failure_reason,
            "activation_latency_ms": row.activation_latency_ms,
            "runtime_metrics": copy.deepcopy(row.runtime_metrics) if isinstance(row.runtime_metrics, dict) else {},
        }

    async def _broadcast_runtime_state(self, payload: dict[str, Any], *, emitted_at: datetime) -> None:
        try:
            from app.services.websocket_manager import ws_manager

            await ws_manager.broadcast_json(
                {
                    "type": "snapshot_runtime_live_state",
                    "topic": RUNTIME_LIVE_STATE_TOPIC,
                    "data": payload,
                    "timestamp": emitted_at.isoformat(),
                },
                topic=RUNTIME_LIVE_STATE_TOPIC,
            )
        except Exception as exc:
            logger.debug("Snapshot runtime live-state broadcast failed: %s", exc)

    async def _broadcast_activation_event(self, payload: dict[str, Any], *, emitted_at: datetime) -> None:
        try:
            from app.services.websocket_manager import ws_manager

            await ws_manager.broadcast_json(
                {
                    "type": "snapshot_activation_event",
                    "topic": ACTIVATION_EVENTS_TOPIC,
                    "data": payload,
                    "timestamp": emitted_at.isoformat(),
                },
                topic=ACTIVATION_EVENTS_TOPIC,
            )
        except Exception as exc:
            logger.debug("Snapshot activation event broadcast failed: %s", exc)

    async def _trim_activation_events(self, session: AsyncSession, node_id: str) -> None:
        result = await session.execute(
            select(SnapshotActivationEvent.id)
            .where(SnapshotActivationEvent.node_id == node_id)
            .order_by(SnapshotActivationEvent.requested_at.desc(), SnapshotActivationEvent.id.desc())
        )
        ids = [int(value) for value in result.scalars().all()]
        if len(ids) <= ACTIVATION_EVENT_LIMIT_PER_NODE:
            return
        stale_ids = ids[ACTIVATION_EVENT_LIMIT_PER_NODE:]
        await session.execute(delete(SnapshotActivationEvent).where(SnapshotActivationEvent.id.in_(stale_ids)))

    async def get_live_state(self) -> dict[str, Any]:
        async with self._session_scope() as session:
            row = await self._get_local_state_row(session)
            return self._serialize_live_state_row(row)

    async def get_live_snapshot_payload(self) -> Optional[dict[str, Any]]:
        live_state = await self.get_live_state()
        payload = live_state.get("live_snapshot_payload")
        return copy.deepcopy(payload) if isinstance(payload, dict) else None

    @staticmethod
    def _extract_channel_definitions(snapshot_payload: dict[str, Any]) -> list[dict[str, Any]]:
        top_level_paths = {
            str(path.get("id")): path
            for path in snapshot_payload.get("paths", [])
            if isinstance(path, dict) and path.get("id") is not None
        }

        channels = [
            channel
            for channel in snapshot_payload.get("channels", [])
            if isinstance(channel, dict)
        ]
        if channels:
            definitions: list[dict[str, Any]] = []
            for channel in channels:
                channel_key = str(channel.get("channel_key") or channel.get("id") or "").strip()
                if not channel_key:
                    continue
                top_level_path = top_level_paths.get(channel_key)
                definitions.append(
                    {
                        "path_id": channel_key,
                        "label": _normalize_channel_label(
                            channel.get("label"),
                            top_level_path.get("label") if isinstance(top_level_path, dict) else channel_key,
                        ),
                        "color": channel.get("color") or (top_level_path.get("color") if isinstance(top_level_path, dict) else None),
                        "snapshot_chain_id": (
                            channel.get("chain_id")
                            if channel.get("chain_id") is not None
                            else (top_level_path.get("snapshot_chain_id") if isinstance(top_level_path, dict) else None)
                        ),
                        "runtime_chain_id": top_level_path.get("runtime_chain_id") if isinstance(top_level_path, dict) else None,
                    }
                )
            if definitions:
                return definitions

        return [
            {
                "path_id": str(path.get("id")),
                "label": _normalize_channel_label(path.get("label") or path.get("name"), path.get("id")),
                "color": path.get("color"),
                "snapshot_chain_id": path.get("snapshot_chain_id"),
                "runtime_chain_id": path.get("runtime_chain_id"),
            }
            for path in snapshot_payload.get("paths", [])
            if isinstance(path, dict) and path.get("id") is not None
        ]

    async def _evaluate_snapshot_payload_channel_health(
        self,
        session: AsyncSession,
        snapshot_payload: dict[str, Any],
    ) -> dict[str, Any]:
        from app.services.chain_service import ChainService

        next_payload = copy.deepcopy(snapshot_payload)
        live_state = (
            dict(next_payload.get("live_state"))
            if isinstance(next_payload.get("live_state"), dict)
            else {}
        )
        existing_live_paths = {
            str(path.get("path_id")): dict(path)
            for path in live_state.get("paths", [])
            if isinstance(path, dict) and path.get("path_id") is not None
        }
        top_level_paths = {
            str(path.get("id")): path
            for path in next_payload.get("paths", [])
            if isinstance(path, dict) and path.get("id") is not None
        }
        chain_service = ChainService(session)
        chain_cache: dict[int, Optional[dict[str, Any]]] = {}
        runtime_chains_by_id: dict[int, dict[str, Any]] = {}
        next_live_paths: list[dict[str, Any]] = []
        inactive_channels: list[dict[str, Any]] = []
        active_count = 0

        for definition in self._extract_channel_definitions(next_payload):
            path_id = str(definition.get("path_id") or "").strip()
            if not path_id:
                continue
            label = _normalize_channel_label(definition.get("label"), path_id)
            existing_live_path = existing_live_paths.get(path_id, {})
            runtime_chain_id = _coerce_optional_int(
                existing_live_path.get("runtime_chain_id")
                if existing_live_path.get("runtime_chain_id") is not None
                else definition.get("runtime_chain_id")
            )

            runtime_chain: Optional[dict[str, Any]] = None
            if runtime_chain_id is not None:
                if runtime_chain_id not in chain_cache:
                    chain_cache[runtime_chain_id] = await chain_service.get_chain(runtime_chain_id)
                runtime_chain = chain_cache[runtime_chain_id]

            runtime_sync = runtime_chain.get("runtime_sync") if isinstance(runtime_chain, dict) else None
            runtime_sync_status = (
                _normalize_channel_health_status(runtime_sync.get("status"))
                if isinstance(runtime_sync, dict)
                else None
            )
            existing_status = _normalize_channel_health_status(existing_live_path.get("activation_status"))

            if isinstance(runtime_chain, dict):
                if bool(runtime_chain.get("is_active")) and runtime_sync_status in {None, CHANNEL_STATUS_ACTIVE}:
                    activation_status = CHANNEL_STATUS_ACTIVE
                else:
                    activation_status = runtime_sync_status or CHANNEL_STATUS_NOT_LOADED
                runtime_chains_by_id[int(runtime_chain["id"])] = runtime_chain
            else:
                activation_status = existing_status or CHANNEL_STATUS_NOT_LOADED

            if activation_status == CHANNEL_STATUS_ACTIVE:
                active_count += 1
            else:
                inactive_channels.append(
                    {
                        "path_id": path_id,
                        "label": label,
                        "status": activation_status,
                        "message": _channel_health_message(label, activation_status),
                    }
                )

            next_runtime_chain_id = int(runtime_chain["id"]) if isinstance(runtime_chain, dict) else None
            next_live_paths.append(
                {
                    "path_id": path_id,
                    "label": label,
                    "color": definition.get("color"),
                    "snapshot_chain_id": definition.get("snapshot_chain_id"),
                    "runtime_chain_id": next_runtime_chain_id,
                    "runtime_chain_name": runtime_chain.get("name") if isinstance(runtime_chain, dict) else None,
                    "activation_status": activation_status,
                }
            )

            top_level_path = top_level_paths.get(path_id)
            if isinstance(top_level_path, dict):
                top_level_path["runtime_chain_id"] = next_runtime_chain_id

        total_count = len(next_live_paths)
        next_payload["live_state"] = {
            **live_state,
            "is_live": bool(total_count > 0),
            "paths": next_live_paths,
            "runtime_chains": list(runtime_chains_by_id.values()),
        }

        return {
            "snapshot_payload": next_payload,
            "active_count": active_count,
            "total_count": total_count,
            "inactive_channels": inactive_channels,
            "inactive_messages": [item["message"] for item in inactive_channels],
        }

    async def assert_snapshot_channels_active(
        self,
        *,
        live_snapshot_payload: dict[str, Any],
    ) -> dict[str, Any]:
        async with self._session_scope() as session:
            health = await self._evaluate_snapshot_payload_channel_health(session, live_snapshot_payload)
        if health["inactive_messages"]:
            raise ValueError(" ".join(str(message) for message in health["inactive_messages"]))
        return health

    async def refresh_live_snapshot_health(
        self,
        *,
        expected_snapshot_id: Optional[int] = None,
        expected_request_id: Optional[str] = None,
        source: str = "continuous_watch",
        emit: bool = True,
    ) -> Optional[dict[str, Any]]:
        emitted_at = _utcnow()
        async with self._session_scope() as session:
            row = await self._get_local_state_row(session)
            if row is None:
                return None

            if (
                str(row.state or "").lower() != "live"
                or not isinstance(row.live_snapshot_payload, dict)
            ):
                row.seq = int(row.seq or 0) + 1
                row.last_runtime_event_at = emitted_at
                await session.flush()
                payload = self._serialize_live_state_row(row, now=emitted_at)
            else:
                if expected_snapshot_id is not None and int(row.snapshot_id or 0) != int(expected_snapshot_id):
                    return None
                if expected_request_id is not None and str(row.last_successful_request_id or "") != str(expected_request_id):
                    return None

                health = await self._evaluate_snapshot_payload_channel_health(session, row.live_snapshot_payload)
                row.seq = int(row.seq or 0) + 1
                row.live_snapshot_payload = health["snapshot_payload"]
                row.runtime_metrics = {
                    **(copy.deepcopy(row.runtime_metrics) if isinstance(row.runtime_metrics, dict) else {}),
                    "channel_activity": {
                        "active_count": health["active_count"],
                        "total_count": health["total_count"],
                        "inactive_channels": copy.deepcopy(health["inactive_channels"]),
                    },
                    "last_channel_health_check_at": emitted_at.isoformat(),
                    "last_channel_health_source": source,
                }
                if source == "post_activation":
                    row.runtime_metrics["post_activation_checked_at"] = emitted_at.isoformat()
                row.last_runtime_event_at = emitted_at
                await session.flush()
                payload = self._serialize_live_state_row(row, now=emitted_at)

        if emit:
            await self._broadcast_runtime_state(payload, emitted_at=emitted_at)
        return payload

    async def create_activation_intent(
        self,
        *,
        snapshot_id: int,
        snapshot_name: str,
        snapshot_revision: str,
        normalized_snapshot_payload: dict[str, Any],
        triggered_by: str,
    ) -> dict[str, Any]:
        requested_at = _utcnow()
        request_id = uuid4().hex
        event_payload: Optional[dict[str, Any]] = None

        async with self._session_scope() as session:
            state_row = await self._get_or_create_local_state_row(session)
            state_row.last_requested_at = requested_at
            state_row.triggered_by = triggered_by

            event_row = SnapshotActivationEvent(
                node_id=self.local_node_id,
                request_id=request_id,
                snapshot_id=snapshot_id,
                snapshot_name=snapshot_name,
                snapshot_revision=snapshot_revision,
                triggered_by=triggered_by,
                requested_at=requested_at,
                outcome="requested",
                runtime_metrics={},
            )
            session.add(event_row)
            await session.flush()
            await self._trim_activation_events(session, self.local_node_id)
            event_payload = self._serialize_activation_event(event_row)

        if event_payload is not None:
            cache = self._activation_event_cache[self.local_node_id]
            cache.appendleft(event_payload)
            await self._broadcast_activation_event(event_payload, emitted_at=requested_at)

        return {
            "request_id": request_id,
            "node_id": self.local_node_id,
            "snapshot_id": snapshot_id,
            "snapshot_revision": snapshot_revision,
            "triggered_by": triggered_by,
            "requested_at": requested_at.isoformat(),
            "normalized_snapshot_payload": copy.deepcopy(normalized_snapshot_payload),
        }

    async def confirm_live_intent(
        self,
        *,
        intent: dict[str, Any],
        live_snapshot_payload: dict[str, Any],
        runtime_metrics: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        emitted_at = _utcnow()
        activation_payload: Optional[dict[str, Any]] = None

        async with self._session_scope() as session:
            row = await self._get_or_create_local_state_row(session)
            row.seq = int(row.seq or 0) + 1
            row.state = "live"
            row.snapshot_id = int(intent["snapshot_id"])
            row.snapshot_revision = str(intent["snapshot_revision"])
            row.triggered_by = str(intent.get("triggered_by") or "ui")
            row.last_successful_request_id = str(intent["request_id"])
            row.failure_reason = None
            row.live_snapshot_payload = copy.deepcopy(live_snapshot_payload)
            row.runtime_metrics = copy.deepcopy(runtime_metrics or {})
            row.last_requested_at = _parse_iso_datetime(intent.get("requested_at")) or emitted_at
            row.last_runtime_event_at = emitted_at
            row.last_transition_at = emitted_at

            result = await session.execute(
                select(SnapshotActivationEvent).where(SnapshotActivationEvent.request_id == str(intent["request_id"]))
            )
            event_row = result.scalar_one_or_none()
            if event_row is not None:
                event_row.outcome = "success"
                event_row.confirmed_live_at = emitted_at
                event_row.failure_reason = None
                event_row.activation_latency_ms = max(
                    0.0,
                    (emitted_at - (event_row.requested_at or emitted_at)).total_seconds() * 1000.0,
                )
                event_row.runtime_metrics = copy.deepcopy(runtime_metrics or {})
                activation_payload = self._serialize_activation_event(event_row)

            await session.flush()
            live_state_payload = self._serialize_live_state_row(row, now=emitted_at)

        await self._broadcast_runtime_state(live_state_payload, emitted_at=emitted_at)
        if activation_payload is not None:
            cache = self._activation_event_cache[self.local_node_id]
            cache.appendleft(activation_payload)
            await self._broadcast_activation_event(activation_payload, emitted_at=emitted_at)
        return live_state_payload

    async def fail_intent(
        self,
        *,
        intent: dict[str, Any],
        failure_reason: str,
        runtime_metrics: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        emitted_at = _utcnow()
        activation_payload: Optional[dict[str, Any]] = None

        async with self._session_scope() as session:
            row = await self._get_or_create_local_state_row(session)
            had_confirmed_live_snapshot = (
                str(row.state or "").lower() == "live"
                and row.snapshot_id is not None
                and isinstance(row.live_snapshot_payload, dict)
                and bool(row.live_snapshot_payload)
            )
            row.seq = int(row.seq or 0) + 1
            row.state = "live" if had_confirmed_live_snapshot else "stopped"
            if not had_confirmed_live_snapshot:
                row.snapshot_id = None
                row.snapshot_revision = None
            row.triggered_by = str(intent.get("triggered_by") or "ui")
            row.failure_reason = failure_reason
            if not had_confirmed_live_snapshot:
                row.live_snapshot_payload = {}
            row.runtime_metrics = copy.deepcopy(runtime_metrics or {})
            row.last_requested_at = _parse_iso_datetime(intent.get("requested_at")) or emitted_at
            row.last_runtime_event_at = emitted_at
            row.last_transition_at = emitted_at

            result = await session.execute(
                select(SnapshotActivationEvent).where(SnapshotActivationEvent.request_id == str(intent["request_id"]))
            )
            event_row = result.scalar_one_or_none()
            if event_row is not None:
                event_row.outcome = "failed"
                event_row.failure_reason = failure_reason
                event_row.confirmed_live_at = None
                event_row.activation_latency_ms = max(
                    0.0,
                    (emitted_at - (event_row.requested_at or emitted_at)).total_seconds() * 1000.0,
                )
                event_row.runtime_metrics = copy.deepcopy(runtime_metrics or {})
                activation_payload = self._serialize_activation_event(event_row)

            await session.flush()
            live_state_payload = self._serialize_live_state_row(row, now=emitted_at)

        await self._broadcast_runtime_state(live_state_payload, emitted_at=emitted_at)
        if activation_payload is not None:
            cache = self._activation_event_cache[self.local_node_id]
            cache.appendleft(activation_payload)
            await self._broadcast_activation_event(activation_payload, emitted_at=emitted_at)
        return live_state_payload

    async def sync_live_snapshot_payload(
        self,
        *,
        snapshot_id: int,
        live_snapshot_payload: dict[str, Any],
        snapshot_revision: Optional[str] = None,
        runtime_metrics: Optional[dict[str, Any]] = None,
    ) -> Optional[dict[str, Any]]:
        emitted_at = _utcnow()
        async with self._session_scope() as session:
            row = await self._get_local_state_row(session)
            if row is None or str(row.state or "").lower() != "live" or int(row.snapshot_id or 0) != int(snapshot_id):
                return None

            row.seq = int(row.seq or 0) + 1
            next_payload = copy.deepcopy(live_snapshot_payload)
            payload_revision = snapshot_revision or str(next_payload.get("snapshot_revision") or "").strip() or None
            if payload_revision:
                next_payload["snapshot_revision"] = payload_revision
                row.snapshot_revision = payload_revision
            row.live_snapshot_payload = next_payload
            if runtime_metrics is not None:
                row.runtime_metrics = copy.deepcopy(runtime_metrics)
            row.last_runtime_event_at = emitted_at
            await session.flush()
            live_state_payload = self._serialize_live_state_row(row, now=emitted_at)

        await self._broadcast_runtime_state(live_state_payload, emitted_at=emitted_at)
        return live_state_payload

    async def sync_live_snapshot_paths(
        self,
        *,
        snapshot_id: int,
        snapshot_live_state_payload: dict[str, Any],
        runtime_chains: list[dict[str, Any]],
        snapshot_revision: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        current_payload = await self.get_live_snapshot_payload()
        if not isinstance(current_payload, dict):
            return None

        live_state_payload = (
            dict(snapshot_live_state_payload)
            if isinstance(snapshot_live_state_payload, dict)
            else {}
        )
        live_paths = [
            dict(item)
            for item in live_state_payload.get("paths", [])
            if isinstance(item, dict)
        ]
        live_path_by_id = {
            str(item.get("path_id")): item
            for item in live_paths
            if item.get("path_id") is not None
        }

        next_payload = copy.deepcopy(current_payload)
        next_payload["live_state"] = {
            **(
                dict(next_payload.get("live_state"))
                if isinstance(next_payload.get("live_state"), dict)
                else {}
            ),
            "paths": live_paths,
            "runtime_chains": [copy.deepcopy(chain) for chain in runtime_chains if isinstance(chain, dict)],
        }

        next_paths = []
        for path in next_payload.get("paths", []):
            if not isinstance(path, dict):
                continue
            live_path = live_path_by_id.get(str(path.get("id")))
            next_path = dict(path)
            next_path["runtime_chain_id"] = (
                live_path.get("runtime_chain_id")
                if isinstance(live_path, dict)
                else None
            )
            next_paths.append(next_path)
        next_payload["paths"] = next_paths

        next_revision = snapshot_revision
        if not next_revision:
            try:
                from app.services.snapshot_service import SnapshotService

                helper = SnapshotService(self.session)  # type: ignore[arg-type]
                normalized = helper._normalize_detail_payload(next_payload)
                next_revision = helper._snapshot_revision_from_normalized(normalized)
            except Exception as exc:
                logger.debug("Failed to recompute live snapshot revision during path sync: %s", exc)

        return await self.sync_live_snapshot_payload(
            snapshot_id=snapshot_id,
            live_snapshot_payload=next_payload,
            snapshot_revision=next_revision,
        )

    async def emit_heartbeat(self) -> Optional[dict[str, Any]]:
        emitted_at = _utcnow()
        async with self._session_scope() as session:
            row = await self._get_local_state_row(session)
            if row is None:
                return None
            row.seq = int(row.seq or 0) + 1
            row.last_runtime_event_at = emitted_at
            await session.flush()
            payload = self._serialize_live_state_row(row, now=emitted_at)

        await self._broadcast_runtime_state(payload, emitted_at=emitted_at)
        return payload

    async def list_activation_events(
        self,
        *,
        limit: int = ACTIVATION_EVENT_LIMIT_PER_NODE,
    ) -> list[dict[str, Any]]:
        bounded_limit = max(1, min(limit, ACTIVATION_EVENT_LIMIT_PER_NODE))
        cache = self._activation_event_cache.get(self.local_node_id)
        if cache:
            cached = list(cache)[:bounded_limit]
            if len(cached) >= bounded_limit:
                return [copy.deepcopy(item) for item in cached]

        async with self._session_scope() as session:
            result = await session.execute(
                select(SnapshotActivationEvent)
                .where(SnapshotActivationEvent.node_id == self.local_node_id)
                .order_by(SnapshotActivationEvent.requested_at.desc(), SnapshotActivationEvent.id.desc())
                .limit(ACTIVATION_EVENT_LIMIT_PER_NODE)
            )
            rows = result.scalars().all()

        serialized = [self._serialize_activation_event(row) for row in rows]
        next_cache = deque(serialized[:ACTIVATION_EVENT_LIMIT_PER_NODE], maxlen=ACTIVATION_EVENT_LIMIT_PER_NODE)
        self._activation_event_cache[self.local_node_id] = next_cache
        return [copy.deepcopy(item) for item in serialized[:bounded_limit]]

    async def get_cluster_live_state(self) -> dict[str, Any]:
        generated_at = _utcnow()
        nodes: list[dict[str, Any]] = [await self.get_live_state()]

        try:
            from app.routes import peer_discovery

            payload = await peer_discovery.get_peer_discovery_status()
            if hasattr(payload, "model_dump"):
                payload = payload.model_dump()
            elif hasattr(payload, "dict"):
                payload = payload.dict()
        except Exception as exc:
            logger.debug("Peer discovery unavailable for runtime live-state aggregation: %s", exc)
            payload = {"peers": []}

        peers = payload.get("peers") if isinstance(payload, dict) else []
        async with httpx.AsyncClient(timeout=2.5, follow_redirects=True) as client:
            for peer in peers or []:
                if not isinstance(peer, dict):
                    continue
                node_id = str(peer.get("node_id") or "").strip()
                api_url = str(peer.get("api_url") or "").strip()
                if not node_id or node_id == self.local_node_id:
                    continue

                try:
                    response = await client.get(f"{api_url.rstrip('/')}/api/runtime/live-state")
                    response.raise_for_status()
                    remote_payload = response.json()
                    if isinstance(remote_payload, dict):
                        nodes.append(remote_payload)
                        continue
                except Exception as exc:
                    logger.debug("Remote runtime live-state fetch failed for %s: %s", node_id, exc)

                nodes.append(
                    self._serialize_live_state_row(
                        None,
                        now=generated_at,
                        node_id=node_id,
                        unavailable_reason="Remote runtime state unavailable",
                    )
                )

        return {
            "local_node_id": self.local_node_id,
            "generated_at": generated_at.isoformat(),
            "count": len(nodes),
            "nodes": nodes,
        }


class SnapshotRuntimeHeartbeatService:
    """Periodic authoritative heartbeat broadcaster for local runtime truth."""

    def __init__(self) -> None:
        self._task: Optional[asyncio.Task[None]] = None
        self._stop_event = asyncio.Event()

    async def start(self) -> None:
        if self._task is not None and not self._task.done():
            return
        self._stop_event = asyncio.Event()
        self._task = asyncio.create_task(self._run(), name="snapshot-runtime-heartbeat")

    async def stop(self) -> None:
        self._stop_event.set()
        if self._task is None:
            return
        self._task.cancel()
        with suppress(asyncio.CancelledError):
            await self._task
        self._task = None

    async def _run(self) -> None:
        while not self._stop_event.is_set():
            try:
                await SnapshotRuntimeStateService().refresh_live_snapshot_health()
            except Exception as exc:
                logger.debug("Snapshot runtime heartbeat failed: %s", exc)

            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=HEARTBEAT_INTERVAL_SECONDS)
            except asyncio.TimeoutError:
                continue


_heartbeat_service = SnapshotRuntimeHeartbeatService()


async def start_snapshot_runtime_heartbeat() -> None:
    await _heartbeat_service.start()


async def stop_snapshot_runtime_heartbeat() -> None:
    await _heartbeat_service.stop()


def schedule_post_activation_health_check(*, snapshot_id: int, request_id: str) -> None:
    async def _runner() -> None:
        try:
            await asyncio.sleep(POST_ACTIVATION_VERIFY_DELAY_SECONDS)
            await SnapshotRuntimeStateService().refresh_live_snapshot_health(
                expected_snapshot_id=snapshot_id,
                expected_request_id=request_id,
                source="post_activation",
            )
        except Exception as exc:
            logger.debug("Post-activation snapshot health check failed for %s: %s", snapshot_id, exc)

    task = asyncio.create_task(
        _runner(),
        name=f"snapshot-post-activation-health-{snapshot_id}-{request_id[:8]}",
    )
    _health_check_tasks.add(task)
    task.add_done_callback(_health_check_tasks.discard)
