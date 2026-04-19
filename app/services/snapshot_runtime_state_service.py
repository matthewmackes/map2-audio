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
from sqlalchemy.orm import selectinload

from app.database import (
    Snapshot,
    SnapshotActivationEvent,
    SnapshotNodeLiveState,
    get_session,
)
from app.models.audio_state import (
    ChannelConfirmationState,
    NodeConfirmationState,
    PublishBlocker,
    PublishBlockerCode,
    PublishBlockerSeverity,
    PublishConfirmationStatus,
    PublishScope,
)
from app.services.state_authority_reconciliation_service import (
    RECONCILIATION_TOLERANCE,
    StateAuthorityReconciliationService,
)
from app.utils.time import utc_now

logger = logging.getLogger(__name__)

RUNTIME_LIVE_STATE_TOPIC = "snapshot_runtime_live_state"
ACTIVATION_EVENTS_TOPIC = "snapshot_activation_events"
WARNING_AFTER_SECONDS = 10.0
OFFLINE_AFTER_SECONDS = 15.0
HEARTBEAT_INTERVAL_SECONDS = 1.0
RECONCILIATION_INTERVAL_SECONDS = 5.0
ACTIVATION_EVENT_LIMIT_PER_NODE = 100
RETAINED_RUNTIME_EDIT_LIMIT = 50
POST_ACTIVATION_VERIFY_DELAY_SECONDS = 2.5
ACTIVATION_PROGRESS_TIMEOUT_SECONDS = 10.0
ACTIVATION_PHASES = ("VALIDATING", "STAGING", "APPLYING", "VERIFYING", "LIVE")
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
    return utc_now()


def _parse_iso_datetime(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str) and value.strip():
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed.astimezone(timezone.utc) if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
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


def _normalize_activation_phase(value: Any) -> str:
    candidate = str(value or "").strip().upper()
    return candidate if candidate in ACTIVATION_PHASES else ACTIVATION_PHASES[0]


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

    def _cache_activation_event_payload(self, payload: dict[str, Any]) -> None:
        request_id = str(payload.get("request_id") or "").strip()
        cache = self._activation_event_cache[self.local_node_id]
        if request_id:
            existing = [entry for entry in cache if str(entry.get("request_id") or "").strip() != request_id]
            cache = deque(existing, maxlen=ACTIVATION_EVENT_LIMIT_PER_NODE)
            self._activation_event_cache[self.local_node_id] = cache
        cache.appendleft(copy.deepcopy(payload))

    @asynccontextmanager
    async def _session_scope(self):
        if self.session is not None:
            yield self.session
            return

        async with get_session() as session:
            yield session

    async def _get_or_create_local_state_row(self, session: AsyncSession) -> SnapshotNodeLiveState:
        result = await session.execute(
            select(SnapshotNodeLiveState)
            .options(selectinload(SnapshotNodeLiveState.snapshot))
            .where(SnapshotNodeLiveState.node_id == self.local_node_id)
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
            select(SnapshotNodeLiveState)
            .options(selectinload(SnapshotNodeLiveState.snapshot))
            .where(SnapshotNodeLiveState.node_id == self.local_node_id)
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
        emitted_at = _parse_iso_datetime(row.last_runtime_event_at)
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

        snapshot_name = str(row.snapshot.name).strip() if row.snapshot is not None and getattr(row.snapshot, "name", None) else None
        if not snapshot_name and isinstance(live_snapshot_payload, dict):
            payload_name = live_snapshot_payload.get("name")
            if isinstance(payload_name, str) and payload_name.strip():
                snapshot_name = payload_name.strip()

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

    @staticmethod
    def _empty_reconciliation_report(status: str = "not_run") -> dict[str, Any]:
        return {
            "checked_at": None,
            "tolerance": RECONCILIATION_TOLERANCE,
            "status": status,
            "desired_plugin_count": 0,
            "observed_plugin_count": 0,
            "topology_drift": False,
            "parameter_drift_count": 0,
            "bypass_drift_count": 0,
            "missing_asset_count": 0,
            "correction_count": 0,
            "reactivation_required": False,
            "asset_redeploy_required": False,
            "applied_corrections": False,
            "drift_items": [],
        }

    @classmethod
    def _extract_reconciliation_report(cls, live_state: dict[str, Any]) -> dict[str, Any]:
        runtime_metrics = live_state.get("runtime_metrics") if isinstance(live_state.get("runtime_metrics"), dict) else {}
        report = (
            copy.deepcopy(runtime_metrics.get("state_authority_reconciliation"))
            if isinstance(runtime_metrics.get("state_authority_reconciliation"), dict)
            else cls._empty_reconciliation_report(
                "no_live_snapshot" if str(live_state.get("state") or "").lower() != "live" else "not_run"
            )
        )
        report.setdefault("checked_at", None)
        report.setdefault("tolerance", RECONCILIATION_TOLERANCE)
        report.setdefault("status", "not_run")
        report.setdefault("desired_plugin_count", 0)
        report.setdefault("observed_plugin_count", 0)
        report.setdefault("topology_drift", False)
        report.setdefault("parameter_drift_count", 0)
        report.setdefault("bypass_drift_count", 0)
        report.setdefault("missing_asset_count", 0)
        report.setdefault("correction_count", 0)
        report.setdefault("reactivation_required", False)
        report.setdefault("asset_redeploy_required", False)
        report.setdefault("applied_corrections", False)
        report.setdefault("drift_items", [])
        return report

    @classmethod
    def _serialize_reconciliation_node(cls, live_state: dict[str, Any]) -> dict[str, Any]:
        return {
            "node_id": live_state.get("node_id"),
            "state": live_state.get("state"),
            "snapshot_id": live_state.get("snapshot_id"),
            "snapshot_revision": live_state.get("snapshot_revision"),
            "snapshot_name": live_state.get("snapshot_name"),
            "display_state": live_state.get("display_state"),
            "display_label": live_state.get("display_label"),
            "reconciliation": cls._extract_reconciliation_report(live_state),
        }

    def _merge_activation_progress(
        self,
        runtime_metrics: Optional[dict[str, Any]],
        *,
        phase: str,
        status: str,
        emitted_at: datetime,
        note: Optional[str] = None,
        extra: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        next_metrics = copy.deepcopy(runtime_metrics) if isinstance(runtime_metrics, dict) else {}
        existing_progress = (
            copy.deepcopy(next_metrics.get("activation_progress"))
            if isinstance(next_metrics.get("activation_progress"), dict)
            else {}
        )
        phase_value = _normalize_activation_phase(phase)
        phase_history = [
            dict(item)
            for item in existing_progress.get("phase_history", [])
            if isinstance(item, dict)
        ]
        phase_history.append(
            {
                "phase": phase_value,
                "status": str(status or "in_progress"),
                "at": emitted_at.isoformat(),
                "note": str(note).strip() if isinstance(note, str) and note.strip() else None,
            }
        )
        completed_phases = [
            str(item).upper()
            for item in existing_progress.get("completed_phases", [])
            if str(item).upper() in ACTIVATION_PHASES
        ]
        if phase_value not in completed_phases and status in {"completed", "success"}:
            completed_phases.append(phase_value)

        next_progress = {
            "current_phase": phase_value,
            "status": str(status or "in_progress"),
            "updated_at": emitted_at.isoformat(),
            "timeout_seconds": ACTIVATION_PROGRESS_TIMEOUT_SECONDS,
            "phase_history": phase_history,
            "completed_phases": completed_phases,
        }
        if isinstance(existing_progress.get("started_at"), str) and existing_progress.get("started_at"):
            next_progress["started_at"] = existing_progress["started_at"]
        else:
            next_progress["started_at"] = emitted_at.isoformat()
        if note:
            next_progress["note"] = note
        if isinstance(extra, dict):
            for key, value in extra.items():
                next_progress[key] = copy.deepcopy(value)
        next_metrics["activation_progress"] = next_progress
        return next_metrics

    @staticmethod
    def _should_run_reconciliation(
        runtime_metrics: Optional[dict[str, Any]],
        *,
        source: str,
        emitted_at: datetime,
    ) -> bool:
        if source == "post_activation":
            return True
        if not isinstance(runtime_metrics, dict):
            return True
        reconciliation = (
            runtime_metrics.get("state_authority_reconciliation")
            if isinstance(runtime_metrics.get("state_authority_reconciliation"), dict)
            else {}
        )
        checked_at = _parse_iso_datetime(reconciliation.get("checked_at"))
        if checked_at is None:
            return True
        return (emitted_at - checked_at).total_seconds() >= RECONCILIATION_INTERVAL_SECONDS

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
    def _serialize_publish_blockers(items: Any) -> list[dict[str, Any]]:
        blockers: list[dict[str, Any]] = []
        for item in items or []:
            try:
                blocker = item if isinstance(item, PublishBlocker) else PublishBlocker.model_validate(item)
            except Exception:
                continue
            blockers.append(blocker.model_dump(mode="json"))
        return blockers

    @staticmethod
    def _serialize_node_confirmations(items: Any) -> dict[str, dict[str, Any]]:
        confirmations: dict[str, dict[str, Any]] = {}
        source = items.items() if isinstance(items, dict) else []
        for node_id, item in source:
            try:
                confirmation = item if isinstance(item, NodeConfirmationState) else NodeConfirmationState.model_validate(item)
            except Exception:
                continue
            confirmations[str(node_id)] = confirmation.model_dump(mode="json")
        return confirmations

    @staticmethod
    def _serialize_channel_confirmations(items: Any) -> dict[str, dict[str, Any]]:
        confirmations: dict[str, dict[str, Any]] = {}
        source = items.items() if isinstance(items, dict) else []
        for path_id, item in source:
            try:
                confirmation = item if isinstance(item, ChannelConfirmationState) else ChannelConfirmationState.model_validate(item)
            except Exception:
                continue
            confirmations[str(path_id)] = confirmation.model_dump(mode="json")
        return confirmations

    def _build_initial_node_confirmations(self, normalized_snapshot_payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
        node_ids: list[str] = []
        for path in normalized_snapshot_payload.get("paths", []):
            if not isinstance(path, dict):
                continue
            node_id = str(
                path.get("owner_node_id")
                or path.get("node_id")
                or path.get("assigned_node_id")
                or self.local_node_id
            ).strip() or self.local_node_id
            if node_id and node_id not in node_ids:
                node_ids.append(node_id)
        if not node_ids:
            node_ids.append(self.local_node_id)

        return {
            node_id: NodeConfirmationState(
                node_id=node_id,
                status=PublishConfirmationStatus.PENDING,
                operator_message=(
                    "Waiting for the local runtime to confirm this snapshot."
                    if node_id == self.local_node_id
                    else f"Waiting for {node_id} to confirm this snapshot."
                ),
            ).model_dump(mode="json")
            for node_id in node_ids
        }

    def _build_initial_channel_confirmations(
        self,
        normalized_snapshot_payload: dict[str, Any],
    ) -> dict[str, dict[str, Any]]:
        top_level_paths = {
            str(path.get("id")): path
            for path in normalized_snapshot_payload.get("paths", [])
            if isinstance(path, dict) and path.get("id") is not None
        }
        confirmations: dict[str, dict[str, Any]] = {}
        for definition in self._extract_channel_definitions(normalized_snapshot_payload):
            path_id = str(definition.get("path_id") or "").strip()
            if not path_id:
                continue
            path = top_level_paths.get(path_id, {})
            related_node_id = str(
                path.get("owner_node_id")
                or path.get("node_id")
                or path.get("assigned_node_id")
                or self.local_node_id
            ).strip() or self.local_node_id
            label = _normalize_channel_label(definition.get("label"), path_id)
            confirmations[path_id] = ChannelConfirmationState(
                path_id=path_id,
                label=label,
                status=PublishConfirmationStatus.PENDING,
                operator_message=f"Waiting to confirm channel {label} live.",
                related_node_id=related_node_id,
            ).model_dump(mode="json")
        return confirmations

    @staticmethod
    def _set_confirmation_status(
        confirmation: dict[str, Any],
        *,
        status: PublishConfirmationStatus,
        operator_message: str,
        technical_detail: Optional[str] = None,
        observed_at: Optional[str] = None,
        observed_state_version: Optional[int] = None,
    ) -> dict[str, Any]:
        next_confirmation = dict(confirmation)
        next_confirmation["status"] = status.value
        next_confirmation["operator_message"] = operator_message
        next_confirmation["technical_detail"] = technical_detail
        next_confirmation["observed_at"] = observed_at
        next_confirmation["observed_state_version"] = observed_state_version
        return next_confirmation

    def _merge_intent_contract(
        self,
        intent: dict[str, Any],
        *,
        blockers: Any = None,
        warnings: Any = None,
        node_confirmations: Any = None,
        channel_confirmations: Any = None,
    ) -> dict[str, Any]:
        next_intent = dict(intent)
        if blockers is not None:
            next_intent["blockers"] = self._serialize_publish_blockers(blockers)
        else:
            next_intent["blockers"] = self._serialize_publish_blockers(next_intent.get("blockers"))
        if warnings is not None:
            next_intent["warnings"] = self._serialize_publish_blockers(warnings)
        else:
            next_intent["warnings"] = self._serialize_publish_blockers(next_intent.get("warnings"))
        if node_confirmations is not None:
            next_intent["node_confirmations"] = self._serialize_node_confirmations(node_confirmations)
        else:
            next_intent["node_confirmations"] = self._serialize_node_confirmations(next_intent.get("node_confirmations"))
        if channel_confirmations is not None:
            next_intent["channel_confirmations"] = self._serialize_channel_confirmations(channel_confirmations)
        else:
            next_intent["channel_confirmations"] = self._serialize_channel_confirmations(next_intent.get("channel_confirmations"))
        return next_intent

    def _apply_phase_to_confirmations(
        self,
        intent: dict[str, Any],
        *,
        phase: str,
        status: str,
    ) -> dict[str, Any]:
        next_intent = self._merge_intent_contract(intent)
        if phase not in {"APPLYING", "VERIFYING"} or status not in {"in_progress", "completed"}:
            return next_intent

        node_confirmations = dict(next_intent.get("node_confirmations") or {})
        for node_id, confirmation in list(node_confirmations.items()):
            current_status = str(confirmation.get("status") or "")
            if current_status in {
                PublishConfirmationStatus.CONFIRMED.value,
                PublishConfirmationStatus.FAILED.value,
                PublishConfirmationStatus.OFFLINE.value,
            }:
                continue
            node_confirmations[node_id] = self._set_confirmation_status(
                confirmation,
                status=PublishConfirmationStatus.WAITING,
                operator_message=(
                    "Waiting for the local runtime to confirm this snapshot."
                    if node_id == self.local_node_id
                    else f"Waiting for {node_id} to confirm this snapshot."
                ),
            )

        channel_confirmations = dict(next_intent.get("channel_confirmations") or {})
        for path_id, confirmation in list(channel_confirmations.items()):
            current_status = str(confirmation.get("status") or "")
            if current_status in {
                PublishConfirmationStatus.CONFIRMED.value,
                PublishConfirmationStatus.FAILED.value,
                PublishConfirmationStatus.OFFLINE.value,
            }:
                continue
            label = str(confirmation.get("label") or path_id)
            channel_confirmations[path_id] = self._set_confirmation_status(
                confirmation,
                status=PublishConfirmationStatus.WAITING,
                operator_message=f"Waiting for confirmation that channel {label} is live.",
            )

        return self._merge_intent_contract(
            next_intent,
            node_confirmations=node_confirmations,
            channel_confirmations=channel_confirmations,
        )

    def _build_failure_blockers(self, *, phase: str, failure_reason: str) -> list[dict[str, Any]]:
        phase_value = _normalize_activation_phase(phase)
        if phase_value == "VALIDATING":
            blocker = PublishBlocker(
                id="snapshot_invalid",
                code=PublishBlockerCode.SNAPSHOT_INVALID,
                severity=PublishBlockerSeverity.BLOCKING,
                scope=PublishScope.DRAFT,
                title="Snapshot needs attention",
                operator_message=str(failure_reason or "Snapshot validation failed."),
                technical_detail=str(failure_reason or "Snapshot validation failed."),
                recommended_action="Review snapshot issues",
            )
        else:
            blocker = PublishBlocker(
                id="engine_apply_failed",
                code=PublishBlockerCode.ENGINE_APPLY_FAILED,
                severity=PublishBlockerSeverity.BLOCKING,
                scope=PublishScope.INTENT,
                title="Publish failed",
                operator_message=str(failure_reason or "The runtime could not apply this snapshot."),
                technical_detail=str(failure_reason or "The runtime could not apply this snapshot."),
                recommended_action="Retry publish",
                repair_action_id="retry_publish",
            )
        return [blocker.model_dump(mode="json")]

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
                next_runtime_metrics = {
                    **(copy.deepcopy(row.runtime_metrics) if isinstance(row.runtime_metrics, dict) else {}),
                    "channel_activity": {
                        "active_count": health["active_count"],
                        "total_count": health["total_count"],
                        "inactive_channels": copy.deepcopy(health["inactive_channels"]),
                    },
                    "last_channel_health_check_at": emitted_at.isoformat(),
                    "last_channel_health_source": source,
                }
                if self._should_run_reconciliation(
                    next_runtime_metrics,
                    source=source,
                    emitted_at=emitted_at,
                ):
                    report = await StateAuthorityReconciliationService().reconcile_live_snapshot_payload(
                        health["snapshot_payload"],
                        apply_corrections=True,
                    )
                    if isinstance(report, dict):
                        reconciliation_metrics = copy.deepcopy(report)
                        reconciliation_metrics["source"] = source
                        next_runtime_metrics["state_authority_reconciliation"] = reconciliation_metrics
                        next_runtime_metrics["last_state_authority_reconciliation_at"] = (
                            str(reconciliation_metrics.get("checked_at") or emitted_at.isoformat())
                        )
                        next_runtime_metrics["last_state_authority_reconciliation_source"] = source
                        if int(reconciliation_metrics.get("correction_count") or 0) > 0:
                            next_runtime_metrics["last_state_authority_correction_at"] = (
                                str(reconciliation_metrics.get("checked_at") or emitted_at.isoformat())
                            )
                row.seq = int(row.seq or 0) + 1
                row.live_snapshot_payload = health["snapshot_payload"]
                row.runtime_metrics = next_runtime_metrics
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
        activation_progress = {
            "current_phase": ACTIVATION_PHASES[0],
            "status": "requested",
            "started_at": requested_at.isoformat(),
            "updated_at": requested_at.isoformat(),
            "timeout_seconds": ACTIVATION_PROGRESS_TIMEOUT_SECONDS,
            "phase_history": [],
            "completed_phases": [],
        }
        intent_payload = self._merge_intent_contract(
            {
                "request_id": request_id,
                "node_id": self.local_node_id,
                "snapshot_id": snapshot_id,
                "snapshot_revision": snapshot_revision,
                "triggered_by": triggered_by,
                "requested_at": requested_at.isoformat(),
                "normalized_snapshot_payload": copy.deepcopy(normalized_snapshot_payload),
                "activation_progress": activation_progress,
            },
            blockers=[],
            warnings=[],
            node_confirmations=self._build_initial_node_confirmations(normalized_snapshot_payload),
            channel_confirmations=self._build_initial_channel_confirmations(normalized_snapshot_payload),
        )

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
                runtime_metrics={
                    "activation_progress": copy.deepcopy(activation_progress),
                    "blockers": copy.deepcopy(intent_payload["blockers"]),
                    "warnings": copy.deepcopy(intent_payload["warnings"]),
                    "node_confirmations": copy.deepcopy(intent_payload["node_confirmations"]),
                    "channel_confirmations": copy.deepcopy(intent_payload["channel_confirmations"]),
                },
            )
            session.add(event_row)
            await session.flush()
            await self._trim_activation_events(session, self.local_node_id)
            event_payload = self._serialize_activation_event(event_row)

        if event_payload is not None:
            self._cache_activation_event_payload(event_payload)
            await self._broadcast_activation_event(event_payload, emitted_at=requested_at)

        return intent_payload

    async def mark_intent_phase(
        self,
        *,
        intent: dict[str, Any],
        phase: str,
        status: str = "in_progress",
        note: Optional[str] = None,
        extra: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        emitted_at = _utcnow()
        activation_payload: Optional[dict[str, Any]] = None
        phase_value = _normalize_activation_phase(phase)
        next_intent = self._apply_phase_to_confirmations(intent, phase=phase_value, status=status)

        if isinstance(extra, dict):
            next_intent = self._merge_intent_contract(
                next_intent,
                blockers=extra.get("blockers") if "blockers" in extra else None,
                warnings=extra.get("warnings") if "warnings" in extra else None,
                node_confirmations=extra.get("node_confirmations") if "node_confirmations" in extra else None,
                channel_confirmations=(
                    extra.get("channel_confirmations") if "channel_confirmations" in extra else None
                ),
            )

        async with self._session_scope() as session:
            result = await session.execute(
                select(SnapshotActivationEvent).where(SnapshotActivationEvent.request_id == str(intent["request_id"]))
            )
            event_row = result.scalar_one_or_none()
            if event_row is None:
                return next_intent
            event_metrics = (
                copy.deepcopy(event_row.runtime_metrics)
                if isinstance(event_row.runtime_metrics, dict)
                else {}
            )
            event_metrics["blockers"] = copy.deepcopy(next_intent.get("blockers") or [])
            event_metrics["warnings"] = copy.deepcopy(next_intent.get("warnings") or [])
            event_metrics["node_confirmations"] = copy.deepcopy(next_intent.get("node_confirmations") or {})
            event_metrics["channel_confirmations"] = copy.deepcopy(next_intent.get("channel_confirmations") or {})
            event_row.runtime_metrics = self._merge_activation_progress(
                event_metrics,
                phase=phase_value,
                status=status,
                emitted_at=emitted_at,
                note=note,
                extra=extra,
            )
            activation_payload = self._serialize_activation_event(event_row)
            await session.flush()

        if activation_payload is not None:
            self._cache_activation_event_payload(activation_payload)
            await self._broadcast_activation_event(activation_payload, emitted_at=emitted_at)

        next_intent["activation_progress"] = copy.deepcopy(
            (activation_payload or {}).get("runtime_metrics", {}).get("activation_progress")
            or self._merge_activation_progress(
                next_intent.get("activation_progress"),
                phase=phase_value,
                status=status,
                emitted_at=emitted_at,
                note=note,
                extra=extra,
            ).get("activation_progress")
        )
        return next_intent

    async def confirm_live_intent(
        self,
        *,
        intent: dict[str, Any],
        live_snapshot_payload: dict[str, Any],
        runtime_metrics: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        emitted_at = _utcnow()
        activation_payload: Optional[dict[str, Any]] = None
        merged_runtime_metrics = copy.deepcopy(runtime_metrics) if isinstance(runtime_metrics, dict) else {}
        confirmed_intent = self._merge_intent_contract(intent)
        if isinstance(confirmed_intent.get("activation_progress"), dict):
            merged_runtime_metrics["activation_progress"] = copy.deepcopy(confirmed_intent["activation_progress"])
        emitted_at_iso = emitted_at.isoformat()
        node_confirmations = {
            node_id: self._set_confirmation_status(
                confirmation,
                status=PublishConfirmationStatus.CONFIRMED,
                operator_message=(
                    "The local runtime confirmed this snapshot."
                    if node_id == self.local_node_id
                    else f"{node_id} confirmed this snapshot."
                ),
                observed_at=emitted_at_iso,
            )
            for node_id, confirmation in dict(confirmed_intent.get("node_confirmations") or {}).items()
        }
        channel_confirmations = {}
        for path_id, confirmation in dict(confirmed_intent.get("channel_confirmations") or {}).items():
            label = str(confirmation.get("label") or path_id)
            channel_confirmations[path_id] = self._set_confirmation_status(
                confirmation,
                status=PublishConfirmationStatus.CONFIRMED,
                operator_message=f"Channel {label} is confirmed live.",
                observed_at=emitted_at_iso,
            )
        merged_runtime_metrics["blockers"] = []
        merged_runtime_metrics["warnings"] = copy.deepcopy(confirmed_intent.get("warnings") or [])
        merged_runtime_metrics["node_confirmations"] = node_confirmations
        merged_runtime_metrics["channel_confirmations"] = channel_confirmations
        runtime_metrics = self._merge_activation_progress(
            merged_runtime_metrics,
            phase="LIVE",
            status="completed",
            emitted_at=emitted_at,
            note="Activation is live.",
        )

        async with self._session_scope() as session:
            row = await self._get_or_create_local_state_row(session)
            row.seq = int(row.seq or 0) + 1
            row.state = "live"
            row.snapshot_id = int(intent["snapshot_id"])
            row.snapshot = await session.get(Snapshot, row.snapshot_id)
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
                requested_at = _parse_iso_datetime(event_row.requested_at) or emitted_at
                event_row.outcome = "success"
                event_row.confirmed_live_at = emitted_at
                event_row.failure_reason = None
                event_row.activation_latency_ms = max(
                    0.0,
                    (emitted_at - requested_at).total_seconds() * 1000.0,
                )
                event_row.runtime_metrics = copy.deepcopy(runtime_metrics or {})
                activation_payload = self._serialize_activation_event(event_row)

            await session.flush()
            live_state_payload = self._serialize_live_state_row(row, now=emitted_at)

        await self._broadcast_runtime_state(live_state_payload, emitted_at=emitted_at)
        if activation_payload is not None:
            self._cache_activation_event_payload(activation_payload)
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
        merged_runtime_metrics = copy.deepcopy(runtime_metrics) if isinstance(runtime_metrics, dict) else {}
        failed_intent = self._merge_intent_contract(intent)
        if isinstance(failed_intent.get("activation_progress"), dict):
            merged_runtime_metrics["activation_progress"] = copy.deepcopy(failed_intent["activation_progress"])
        activation_progress = intent.get("activation_progress") if isinstance(intent, dict) else {}
        current_phase = (
            activation_progress.get("current_phase")
            if isinstance(activation_progress, dict)
            else ACTIVATION_PHASES[0]
        )
        emitted_at_iso = emitted_at.isoformat()
        merged_runtime_metrics["blockers"] = copy.deepcopy(
            failed_intent.get("blockers") or self._build_failure_blockers(phase=str(current_phase), failure_reason=failure_reason)
        )
        merged_runtime_metrics["warnings"] = copy.deepcopy(failed_intent.get("warnings") or [])
        merged_runtime_metrics["node_confirmations"] = {
            node_id: (
                confirmation
                if str(confirmation.get("status") or "") == PublishConfirmationStatus.CONFIRMED.value
                else self._set_confirmation_status(
                    confirmation,
                    status=PublishConfirmationStatus.FAILED,
                    operator_message=(
                        "The local runtime did not confirm this snapshot."
                        if node_id == self.local_node_id
                        else f"{node_id} did not confirm this snapshot."
                    ),
                    technical_detail=failure_reason,
                    observed_at=emitted_at_iso,
                )
            )
            for node_id, confirmation in dict(failed_intent.get("node_confirmations") or {}).items()
        }
        merged_runtime_metrics["channel_confirmations"] = {
            path_id: (
                confirmation
                if str(confirmation.get("status") or "") == PublishConfirmationStatus.CONFIRMED.value
                else self._set_confirmation_status(
                    confirmation,
                    status=PublishConfirmationStatus.FAILED,
                    operator_message=f"Channel {str(confirmation.get('label') or path_id)} did not confirm live.",
                    technical_detail=failure_reason,
                    observed_at=emitted_at_iso,
                )
            )
            for path_id, confirmation in dict(failed_intent.get("channel_confirmations") or {}).items()
        }
        runtime_metrics = self._merge_activation_progress(
            merged_runtime_metrics,
            phase=str(current_phase or ACTIVATION_PHASES[0]),
            status="failed",
            emitted_at=emitted_at,
            note=str(failure_reason or "Activation failed."),
        )

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
                requested_at = _parse_iso_datetime(event_row.requested_at) or emitted_at
                event_row.outcome = "failed"
                event_row.failure_reason = failure_reason
                event_row.confirmed_live_at = None
                event_row.activation_latency_ms = max(
                    0.0,
                    (emitted_at - requested_at).total_seconds() * 1000.0,
                )
                event_row.runtime_metrics = copy.deepcopy(runtime_metrics or {})
                activation_payload = self._serialize_activation_event(event_row)

            await session.flush()
            live_state_payload = self._serialize_live_state_row(row, now=emitted_at)

        await self._broadcast_runtime_state(live_state_payload, emitted_at=emitted_at)
        if activation_payload is not None:
            self._cache_activation_event_payload(activation_payload)
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

    async def record_retained_runtime_edit(
        self,
        *,
        snapshot_id: int,
        mutation_kind: str,
        triggered_by: str,
        snapshot_revision: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> Optional[dict[str, Any]]:
        emitted_at = _utcnow()
        async with self._session_scope() as session:
            row = await self._get_local_state_row(session)
            if row is None or str(row.state or "").lower() != "live" or int(row.snapshot_id or 0) != int(snapshot_id):
                return None

            next_metrics = copy.deepcopy(row.runtime_metrics) if isinstance(row.runtime_metrics, dict) else {}
            retained_runtime_edits = [
                copy.deepcopy(item)
                for item in next_metrics.get("retained_runtime_edits", [])
                if isinstance(item, dict)
            ]
            live_payload = row.live_snapshot_payload if isinstance(row.live_snapshot_payload, dict) else {}
            effective_revision = (
                str(snapshot_revision).strip()
                if isinstance(snapshot_revision, str) and snapshot_revision.strip()
                else str(row.snapshot_revision or live_payload.get("snapshot_revision") or "").strip() or None
            )
            entry = {
                "id": uuid4().hex,
                "snapshot_id": int(snapshot_id),
                "snapshot_revision": effective_revision,
                "mutation_kind": str(mutation_kind or "unknown").strip() or "unknown",
                "triggered_by": str(triggered_by or "system").strip() or "system",
                "recorded_at": emitted_at.isoformat(),
                "metadata": copy.deepcopy(metadata) if isinstance(metadata, dict) else {},
            }
            retained_runtime_edits.append(entry)
            next_metrics["retained_runtime_edits"] = retained_runtime_edits[-RETAINED_RUNTIME_EDIT_LIMIT:]
            next_metrics["last_retained_runtime_edit_at"] = entry["recorded_at"]
            next_metrics["last_retained_runtime_edit_kind"] = entry["mutation_kind"]
            next_metrics["last_retained_runtime_edit_triggered_by"] = entry["triggered_by"]

            row.seq = int(row.seq or 0) + 1
            if effective_revision:
                row.snapshot_revision = effective_revision
            row.runtime_metrics = next_metrics
            row.last_runtime_event_at = emitted_at
            await session.flush()
            live_state_payload = self._serialize_live_state_row(row, now=emitted_at)

        await self._broadcast_runtime_state(live_state_payload, emitted_at=emitted_at)
        return live_state_payload

    async def record_authority_publication_result(
        self,
        *,
        snapshot_id: int,
        request_id: str,
        authority_publication: dict[str, Any],
    ) -> Optional[dict[str, Any]]:
        emitted_at = _utcnow()
        activation_payload: Optional[dict[str, Any]] = None
        live_state_payload: Optional[dict[str, Any]] = None
        normalized_result = copy.deepcopy(authority_publication) if isinstance(authority_publication, dict) else {}

        async with self._session_scope() as session:
            row = await self._get_local_state_row(session)
            if row is not None and str(row.state or "").lower() == "live" and int(row.snapshot_id or 0) == int(snapshot_id):
                next_metrics = copy.deepcopy(row.runtime_metrics) if isinstance(row.runtime_metrics, dict) else {}
                next_metrics["authority_publication"] = normalized_result
                next_metrics["last_authority_publication_at"] = str(
                    normalized_result.get("checked_at") or emitted_at.isoformat()
                )
                row.seq = int(row.seq or 0) + 1
                row.runtime_metrics = next_metrics
                row.last_runtime_event_at = emitted_at
                live_state_payload = self._serialize_live_state_row(row, now=emitted_at)

            result = await session.execute(
                select(SnapshotActivationEvent).where(SnapshotActivationEvent.request_id == str(request_id))
            )
            event_row = result.scalar_one_or_none()
            if event_row is not None:
                event_metrics = copy.deepcopy(event_row.runtime_metrics) if isinstance(event_row.runtime_metrics, dict) else {}
                event_metrics["authority_publication"] = normalized_result
                event_metrics["last_authority_publication_at"] = str(
                    normalized_result.get("checked_at") or emitted_at.isoformat()
                )
                authority_status = str(normalized_result.get("status") or "").strip().lower()
                if authority_status == "failed":
                    event_row.outcome = "degraded"
                    event_row.failure_reason = str(normalized_result.get("reason") or "").strip() or None
                elif authority_status == "confirmed":
                    event_row.outcome = "success"
                    event_row.failure_reason = None
                event_row.runtime_metrics = event_metrics
                activation_payload = self._serialize_activation_event(event_row)

            await session.flush()

        if live_state_payload is not None:
            await self._broadcast_runtime_state(live_state_payload, emitted_at=emitted_at)
        if activation_payload is not None:
            self._cache_activation_event_payload(activation_payload)
            await self._broadcast_activation_event(activation_payload, emitted_at=emitted_at)
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

    async def get_runtime_reconciliation_report(self) -> dict[str, Any]:
        generated_at = _utcnow()
        live_state = await self.get_live_state()
        node = self._serialize_reconciliation_node(live_state)
        return {
            "node_id": self.local_node_id,
            "generated_at": generated_at.isoformat(),
            **node,
        }

    async def get_cluster_reconciliation_report(self) -> dict[str, Any]:
        generated_at = _utcnow()
        cluster_live_state = await self.get_cluster_live_state()
        nodes = [
            self._serialize_reconciliation_node(node)
            for node in cluster_live_state.get("nodes", [])
            if isinstance(node, dict)
        ]
        healthy_nodes = 0
        drifted_nodes = 0
        self_healed_nodes = 0
        reactivation_required_nodes = 0
        asset_redeploy_required_nodes = 0
        not_run_nodes = 0
        correction_total = 0

        for node in nodes:
            reconciliation = node["reconciliation"]
            status = str(reconciliation.get("status") or "not_run")
            correction_total += int(reconciliation.get("correction_count") or 0)
            if status == "healthy":
                healthy_nodes += 1
            elif status == "self_healed":
                self_healed_nodes += 1
                drifted_nodes += 1
            elif status == "not_run":
                not_run_nodes += 1
            elif status not in {"no_live_snapshot", "engine_unavailable"}:
                drifted_nodes += 1

            if bool(reconciliation.get("reactivation_required")):
                reactivation_required_nodes += 1
            if bool(reconciliation.get("asset_redeploy_required")):
                asset_redeploy_required_nodes += 1

        return {
            "local_node_id": self.local_node_id,
            "generated_at": generated_at.isoformat(),
            "count": len(nodes),
            "healthy_nodes": healthy_nodes,
            "drifted_nodes": drifted_nodes,
            "self_healed_nodes": self_healed_nodes,
            "not_run_nodes": not_run_nodes,
            "reactivation_required_nodes": reactivation_required_nodes,
            "asset_redeploy_required_nodes": asset_redeploy_required_nodes,
            "correction_total": correction_total,
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
