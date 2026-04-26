"""T2454 slice 1 — preload reconciler background task.

Walks the operator-pinned snapshot set every ~30s and self-heals the warm
cache: evicts orphans, re-warms entries that have gone cold (memory pressure
on the engine, version drift after a snapshot edit, engine restart). The
operator never has to think about warming — pins stay always-warm and
always-fresh.

Concurrency is capped at 2 inside `SnapshotPreloadOrchestrator.reconcile()`,
so the reconciler can be safely co-resident with manual `POST /preload`
calls and the activation FSM.

Started/stopped from the FastAPI lifespan in `app.main`.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

from sqlalchemy import select

from app.database import get_session, SpecialSettings
from app.services.snapshot.preload_orchestrator import get_preload_orchestrator
from app.services.special_settings_normalization import (
    resolve_snapshot_preload_pins_from_settings,
)

logger = logging.getLogger(__name__)

# 30s reconciliation interval per the locked Q4=D answer for T2454.
# Picked so that operator pin changes are reflected within one tick on an
# idle node, while keeping the audit/load on the warm cache low.
DEFAULT_RECONCILE_INTERVAL_SECONDS = 30.0


class PreloadReconciler:
    """Background task that reconciles the warm cache against the pinned set."""

    def __init__(self, interval_seconds: float = DEFAULT_RECONCILE_INTERVAL_SECONDS) -> None:
        self._interval = max(1.0, float(interval_seconds))
        self._task: Optional[asyncio.Task] = None
        self._stop_event: Optional[asyncio.Event] = None

    def start(self) -> None:
        if self._task is not None and not self._task.done():
            return
        self._stop_event = asyncio.Event()
        self._task = asyncio.create_task(self._run(), name="snapshot-preload-reconciler")
        logger.info("Snapshot preload reconciler started (interval=%.1fs)", self._interval)

    async def stop(self) -> None:
        if self._stop_event is not None:
            self._stop_event.set()
        task = self._task
        if task is None:
            return
        if task.done():
            self._task = None
            return
        try:
            await asyncio.wait_for(task, timeout=5.0)
        except asyncio.TimeoutError:
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
        self._task = None
        logger.info("Snapshot preload reconciler stopped")

    async def reconcile_once(self) -> dict:
        """Run a single reconciliation pass. Exposed for tests."""
        try:
            pinned_ids = await self._read_pinned_ids()
        except Exception as exc:
            logger.warning("Preload reconciler: failed to read pinned ids: %s", exc)
            return {"error": str(exc)}

        try:
            orchestrator = get_preload_orchestrator()
            return await orchestrator.reconcile(pinned_ids)
        except Exception as exc:
            logger.warning("Preload reconciler: orchestrator.reconcile failed: %s", exc)
            return {"error": str(exc)}

    async def _read_pinned_ids(self) -> list[int]:
        async with get_session() as session:
            settings = (
                await session.execute(select(SpecialSettings).where(SpecialSettings.id == 1))
            ).scalar_one_or_none()
            if settings is None:
                return []
            return resolve_snapshot_preload_pins_from_settings(settings)

    async def _run(self) -> None:
        # First pass runs immediately so a fresh boot warms pinned snapshots
        # without the operator having to wait a full interval. Subsequent
        # passes pace at `_interval` and respect the stop_event for clean
        # cancellation.
        assert self._stop_event is not None
        while not self._stop_event.is_set():
            try:
                summary = await self.reconcile_once()
                if summary.get("error"):
                    logger.debug("Preload reconciler tick error: %s", summary["error"])
                else:
                    logger.debug(
                        "Preload reconciler tick: pinned=%s warmed=%s evicted=%s",
                        summary.get("pinned_count"),
                        summary.get("warmed"),
                        summary.get("evicted"),
                    )
            except Exception as exc:
                logger.warning("Preload reconciler tick crashed: %s", exc)

            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=self._interval)
            except asyncio.TimeoutError:
                continue
            else:
                break


_reconciler: Optional[PreloadReconciler] = None


def get_preload_reconciler() -> PreloadReconciler:
    global _reconciler
    if _reconciler is None:
        _reconciler = PreloadReconciler()
    return _reconciler


def reset_preload_reconciler_for_tests() -> None:
    global _reconciler
    _reconciler = None
