from __future__ import annotations

import time
from dataclasses import dataclass, replace
from typing import Any


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _clamp_progress(value: Any) -> float:
    return max(0.0, min(1.0, _safe_float(value, 0.0)))


@dataclass(frozen=True)
class MaschineLongOperationSnapshot:
    source: str
    operation_id: str
    title: str
    subtitle: str
    detail: str
    progress: float
    status: str = "running"
    can_cancel: bool = False
    cancel_path: str | None = None
    started_at: float = 0.0
    updated_at: float = 0.0
    receipt_until: float | None = None


class MaschineLongOperationFeedback:
    _SOURCE_PRIORITY: tuple[str, ...] = (
        "manual",
        "cluster_update",
        "plugin_scan",
        "soundfont_download",
        "ir_download",
        "startup",
    )

    def __init__(
        self,
        *,
        receipt_hold_seconds: float = 3.0,
        cancel_notice_seconds: float = 1.5,
    ) -> None:
        self._receipt_hold_seconds = max(0.5, float(receipt_hold_seconds))
        self._cancel_notice_seconds = max(0.25, float(cancel_notice_seconds))
        self._active: dict[str, MaschineLongOperationSnapshot] = {}
        self._receipts: dict[str, MaschineLongOperationSnapshot] = {}
        self._last_status: dict[str, str] = {}
        self._cancel_requested_until: dict[str, float] = {}

    def observe_startup_progress(self, payload: dict[str, Any] | None, *, now: float | None = None) -> None:
        current_now = time.monotonic() if now is None else float(now)
        payload = dict(payload or {})
        total_services = _safe_int(payload.get("total_services"), 0)
        completed_services = _safe_int(payload.get("completed_services"), 0)
        completed_levels = _safe_int(payload.get("completed_levels"), 0)
        total_levels = _safe_int(payload.get("total_levels"), 0)
        if total_services <= 0:
            self._clear_source("startup")
            return
        if completed_services >= total_services:
            if self._was_running("startup"):
                self._store_receipt(
                    source="startup",
                    title="SYSTEM READY",
                    subtitle=f"{total_services}/{total_services} SERVICES",
                    detail=f"{total_levels}/{total_levels} LEVELS READY" if total_levels > 0 else "MAP2 STARTUP COMPLETE",
                    progress=1.0,
                    status="completed",
                    now=current_now,
                )
            self._clear_source("startup", preserve_receipt=True)
            return
        self._observe_running(
            MaschineLongOperationSnapshot(
                source="startup",
                operation_id="startup",
                title="SYSTEM STARTUP",
                subtitle=f"{completed_services}/{total_services} SERVICES",
                detail=(
                    f"{completed_levels}/{total_levels} LEVELS READY"
                    if total_levels > 0
                    else "WAITING FOR SERVICES"
                ),
                progress=(float(completed_services) / float(total_services)) if total_services > 0 else 0.0,
                status="running",
                started_at=current_now,
                updated_at=current_now,
            ),
            now=current_now,
        )

    def observe_update_status(self, payload: dict[str, Any] | None, *, now: float | None = None) -> None:
        current_now = time.monotonic() if now is None else float(now)
        payload = dict(payload or {})
        status = str(payload.get("status") or "").strip().lower()
        progress_payload = dict(payload.get("progress") or {})
        total_nodes = _safe_int(progress_payload.get("total"), 0)
        completed_nodes = _safe_int(progress_payload.get("completed"), 0)
        failed_nodes = _safe_int(progress_payload.get("failed"), 0)
        current_node = str(payload.get("current_node") or "").strip()
        message = str(payload.get("message") or "").strip() or "Update progress"
        if status in {"running", "in_progress"} and total_nodes > 0:
            detail = message
            if current_node:
                detail = f"{message} • {current_node}"
            self._observe_running(
                MaschineLongOperationSnapshot(
                    source="cluster_update",
                    operation_id="cluster_update",
                    title="CLUSTER UPDATE",
                    subtitle=f"{completed_nodes}/{total_nodes} NODES",
                    detail=detail,
                    progress=float(completed_nodes) / float(total_nodes),
                    status="running",
                    can_cancel=True,
                    cancel_path="/api/cluster/update/abort",
                    started_at=current_now,
                    updated_at=current_now,
                ),
                now=current_now,
            )
            return
        if status == "completed":
            if self._was_running("cluster_update"):
                self._store_receipt(
                    source="cluster_update",
                    title="CLUSTER UPDATE",
                    subtitle=f"{total_nodes}/{total_nodes} NODES",
                    detail=message or "UPDATE COMPLETE",
                    progress=1.0,
                    status="completed",
                    now=current_now,
                )
            self._clear_source("cluster_update", preserve_receipt=True)
            return
        if status == "failed":
            if self._was_running("cluster_update"):
                self._store_receipt(
                    source="cluster_update",
                    title="CLUSTER UPDATE",
                    subtitle=f"{completed_nodes}/{max(total_nodes, completed_nodes)} NODES",
                    detail=message or f"{failed_nodes} NODES FAILED",
                    progress=(float(completed_nodes) / float(total_nodes)) if total_nodes > 0 else 0.0,
                    status="failed",
                    now=current_now,
                )
            self._clear_source("cluster_update", preserve_receipt=True)
            return
        if status == "idle":
            if self._was_running("cluster_update") or self._cancel_requested_until.get("cluster_update", 0.0) > current_now:
                self._store_receipt(
                    source="cluster_update",
                    title="CLUSTER UPDATE",
                    subtitle="CANCELLED",
                    detail="UPDATE CANCELLED",
                    progress=0.0,
                    status="cancelled",
                    now=current_now,
                )
            self._clear_source("cluster_update", preserve_receipt=True)
            return
        self._clear_source("cluster_update")

    def observe_plugin_scan_status(self, payload: dict[str, Any] | None, *, now: float | None = None) -> None:
        current_now = time.monotonic() if now is None else float(now)
        payload = dict(payload or {})
        active = bool(payload.get("isScanning") or payload.get("is_scanning"))
        total_found = _safe_int(payload.get("totalFound", payload.get("total_found")), 0)
        current_path = str(payload.get("currentPath", payload.get("current_path")) or "").strip()
        errors = [str(item) for item in list(payload.get("errors") or []) if str(item or "").strip()]
        if active:
            self._observe_running(
                MaschineLongOperationSnapshot(
                    source="plugin_scan",
                    operation_id="plugin_scan",
                    title="PLUGIN SCAN",
                    subtitle=f"{total_found} FOUND",
                    detail=current_path or "SCANNING PLUGINS",
                    progress=_clamp_progress(payload.get("progress")),
                    status="running",
                    started_at=current_now,
                    updated_at=current_now,
                ),
                now=current_now,
            )
            return
        if self._was_running("plugin_scan"):
            self._store_receipt(
                source="plugin_scan",
                title="PLUGIN SCAN",
                subtitle="FAILED" if errors else "COMPLETE",
                detail=errors[0] if errors else f"{total_found} PLUGINS READY",
                progress=1.0 if not errors else _clamp_progress(payload.get("progress")),
                status="failed" if errors else "completed",
                now=current_now,
            )
        self._clear_source("plugin_scan", preserve_receipt=True)

    def begin_manual_operation(
        self,
        *,
        operation_id: str,
        title: str,
        subtitle: str,
        detail: str,
        progress: float = 0.0,
        can_cancel: bool = False,
        cancel_path: str | None = None,
        now: float | None = None,
    ) -> None:
        current_now = time.monotonic() if now is None else float(now)
        self._observe_running(
            MaschineLongOperationSnapshot(
                source="manual",
                operation_id=operation_id,
                title=title,
                subtitle=subtitle,
                detail=detail,
                progress=_clamp_progress(progress),
                status="running",
                can_cancel=can_cancel,
                cancel_path=cancel_path,
                started_at=current_now,
                updated_at=current_now,
            ),
            now=current_now,
        )

    def update_manual_operation(
        self,
        *,
        title: str | None = None,
        subtitle: str | None = None,
        detail: str | None = None,
        progress: float | None = None,
        can_cancel: bool | None = None,
        cancel_path: str | None = None,
        now: float | None = None,
    ) -> None:
        current_now = time.monotonic() if now is None else float(now)
        current = self._active.get("manual")
        if current is None:
            return
        snapshot = replace(
            current,
            title=title if title is not None else current.title,
            subtitle=subtitle if subtitle is not None else current.subtitle,
            detail=detail if detail is not None else current.detail,
            progress=_clamp_progress(progress if progress is not None else current.progress),
            can_cancel=bool(can_cancel) if can_cancel is not None else current.can_cancel,
            cancel_path=cancel_path if cancel_path is not None else current.cancel_path,
            updated_at=current_now,
        )
        self._observe_running(snapshot, now=current_now)

    def finish_manual_operation(
        self,
        *,
        title: str,
        subtitle: str,
        detail: str,
        status: str = "completed",
        now: float | None = None,
    ) -> None:
        current_now = time.monotonic() if now is None else float(now)
        self._store_receipt(
            source="manual",
            title=title,
            subtitle=subtitle,
            detail=detail,
            progress=1.0,
            status=status,
            now=current_now,
        )
        self._clear_source("manual", preserve_receipt=True)

    def mark_cancel_requested(self, source: str, *, now: float | None = None) -> None:
        current_now = time.monotonic() if now is None else float(now)
        self._cancel_requested_until[source] = current_now + self._cancel_notice_seconds
        if source in self._active:
            self._last_status[source] = "cancel_requested"

    def push_receipt(
        self,
        *,
        source: str,
        title: str,
        subtitle: str,
        detail: str,
        progress: float,
        status: str,
        now: float | None = None,
    ) -> None:
        current_now = time.monotonic() if now is None else float(now)
        self._store_receipt(
            source=source,
            title=title,
            subtitle=subtitle,
            detail=detail,
            progress=progress,
            status=status,
            now=current_now,
        )

    def snapshot(self, *, now: float | None = None) -> MaschineLongOperationSnapshot | None:
        current_now = time.monotonic() if now is None else float(now)
        self._prune_expired_receipts(now=current_now)
        active_snapshot = self._highest_priority_snapshot(self._active, now=current_now)
        if active_snapshot is not None:
            cancel_until = self._cancel_requested_until.get(active_snapshot.source, 0.0)
            if cancel_until > current_now:
                return replace(
                    active_snapshot,
                    status="cancel_requested",
                    detail="CANCEL REQUESTED",
                    can_cancel=False,
                    updated_at=current_now,
                )
            return active_snapshot
        return self._highest_priority_snapshot(self._receipts, now=current_now)

    def _observe_running(self, snapshot: MaschineLongOperationSnapshot, *, now: float) -> None:
        existing = self._active.get(snapshot.source)
        started_at = existing.started_at if existing is not None else snapshot.started_at
        normalized = replace(
            snapshot,
            progress=_clamp_progress(snapshot.progress),
            started_at=started_at,
            updated_at=now,
        )
        self._active[snapshot.source] = normalized
        self._receipts.pop(snapshot.source, None)
        self._last_status[snapshot.source] = normalized.status

    def _store_receipt(
        self,
        *,
        source: str,
        title: str,
        subtitle: str,
        detail: str,
        progress: float,
        status: str,
        now: float,
    ) -> None:
        active = self._active.get(source)
        operation_id = active.operation_id if active is not None else source
        started_at = active.started_at if active is not None else now
        self._receipts[source] = MaschineLongOperationSnapshot(
            source=source,
            operation_id=operation_id,
            title=title,
            subtitle=subtitle,
            detail=detail,
            progress=_clamp_progress(progress),
            status=status,
            can_cancel=False,
            cancel_path=None,
            started_at=started_at,
            updated_at=now,
            receipt_until=now + self._receipt_hold_seconds,
        )
        self._last_status[source] = status

    def _clear_source(self, source: str, *, preserve_receipt: bool = False) -> None:
        self._active.pop(source, None)
        self._cancel_requested_until.pop(source, None)
        if not preserve_receipt:
            self._receipts.pop(source, None)

    def _was_running(self, source: str) -> bool:
        return source in self._active or self._last_status.get(source) in {"running", "cancel_requested"}

    def _prune_expired_receipts(self, *, now: float) -> None:
        expired = [
            source
            for source, snapshot in self._receipts.items()
            if snapshot.receipt_until is not None and snapshot.receipt_until <= now
        ]
        for source in expired:
            self._receipts.pop(source, None)

    def _highest_priority_snapshot(
        self,
        snapshots: dict[str, MaschineLongOperationSnapshot],
        *,
        now: float,
    ) -> MaschineLongOperationSnapshot | None:
        if not snapshots:
            return None
        priority_index = {name: index for index, name in enumerate(self._SOURCE_PRIORITY)}
        return min(
            snapshots.values(),
            key=lambda snapshot: (
                priority_index.get(snapshot.source, len(priority_index)),
                -(snapshot.updated_at or now),
            ),
        )
