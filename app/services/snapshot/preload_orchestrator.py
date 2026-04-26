"""T2454 slice 1 — snapshot preload orchestrator.

Owns the warm-cache state for operator-pinned snapshots. Backed by
`ChainService.stage_detached_chain_plugins()` and
`release_detached_instance_ids()` — the same RT-safe primitives the existing
`schedule_preload` activation hook uses, just driven by explicit operator
pins instead of automatic next-program prediction.

Key invariants:
- One warm-cache entry per pinned snapshot. Keyed by `Snapshot.id`.
- Each entry tracks `version` (from `Snapshot.version`, T2449) so the reconciler
  can detect drift and re-warm.
- `staged_instance_ids` is the engine handle returned by
  `stage_detached_chain_plugins()`. On evict, we hand them to
  `release_detached_instance_ids()` so the engine can free the prewarm slots.
- The orchestrator is a process-singleton (mirrors how ChainService is used);
  not Raft-replicated. Each node holds its own warm cache derived from the
  Raft-replicated pin list. This is correct: the warm cache is inherently
  node-local engine state, not durable cluster state.

Slice 1 does NOT change the activation FSM. Activation still flows through the
existing cold rebuild path. The win in slice 1 is operator-visible state
(durable pins, warm dots, blocking Go Live until warm) plus the engine actually
holding the plugin instances ready. Slice 2 (T2454-B) adds the warm-path
delta activation that turns this into sub-20ms recall.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Optional

from app.database import get_session, Snapshot, SnapshotChain
from sqlalchemy import select
from sqlalchemy.orm import selectinload

logger = logging.getLogger(__name__)


@dataclass
class PreloadEntry:
    """One warm-cache entry per pinned snapshot."""

    snapshot_id: int
    version: int
    staged_instance_ids: list[int] = field(default_factory=list)
    warmed_at: float = field(default_factory=time.monotonic)
    warm: bool = False
    last_error: Optional[str] = None
    # T2454-B: in-flight lock so concurrent reconciler ticks don't release
    # the staged instances out from under an activation that has claimed
    # this entry. Set by `claim()`, cleared by `mark_consumed()`.
    in_flight: bool = False


@dataclass(frozen=True)
class PreloadClaim:
    """Snapshot of an in-flight warm-cache entry handed to the activation FSM."""

    snapshot_id: int
    version: int
    staged_instance_ids: tuple[int, ...]


class SnapshotPreloadOrchestrator:
    """Process-wide warm cache for operator-pinned snapshots.

    Methods are coroutine-safe via a single `_lock` — the cache is read on every
    Go Live and written by the reconciler + manual `POST /api/snapshots/{id}/preload`,
    so we serialize all mutations.
    """

    _instance: "Optional[SnapshotPreloadOrchestrator]" = None

    def __init__(self) -> None:
        self._entries: dict[int, PreloadEntry] = {}
        self._lock = asyncio.Lock()

    @classmethod
    def get_instance(cls) -> "SnapshotPreloadOrchestrator":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @classmethod
    def reset_for_tests(cls) -> None:
        """Drop the singleton so tests can build a fresh orchestrator."""
        cls._instance = None

    async def is_warm(self, snapshot_id: int) -> bool:
        async with self._lock:
            entry = self._entries.get(int(snapshot_id))
            return bool(entry and entry.warm)

    async def get_entry(self, snapshot_id: int) -> Optional[PreloadEntry]:
        async with self._lock:
            entry = self._entries.get(int(snapshot_id))
            if entry is None:
                return None
            # Return a shallow copy so callers can't mutate the cache.
            return PreloadEntry(
                snapshot_id=entry.snapshot_id,
                version=entry.version,
                staged_instance_ids=list(entry.staged_instance_ids),
                warmed_at=entry.warmed_at,
                warm=entry.warm,
                last_error=entry.last_error,
            )

    async def snapshot_status(self) -> list[dict[str, Any]]:
        """Read-only snapshot of the warm cache for the status endpoint."""
        async with self._lock:
            return [
                {
                    "snapshot_id": entry.snapshot_id,
                    "version": entry.version,
                    "warm": entry.warm,
                    "warmed_at": entry.warmed_at,
                    "staged_instance_count": len(entry.staged_instance_ids),
                    "last_error": entry.last_error,
                }
                for entry in self._entries.values()
            ]

    async def preload(self, snapshot_id: int) -> dict[str, Any]:
        """Warm the cache for `snapshot_id`. Idempotent: re-running on a
        warm-and-current entry is a no-op. If the snapshot's version has
        drifted, re-stage and replace.

        Returns a status dict the route layer can return to the client."""
        snapshot_id = int(snapshot_id)

        # Resolve fresh row + version under a session, outside the orchestrator
        # lock — the session is per-request.
        async with get_session() as session:
            from app.services.snapshot import SnapshotService

            service = SnapshotService(session)
            snapshot_row = await self._read_snapshot_row(session, snapshot_id)
            if snapshot_row is None:
                return {
                    "snapshot_id": snapshot_id,
                    "warm": False,
                    "reason": "not_found",
                }

            target_version = int(snapshot_row.version or 1)

            async with self._lock:
                existing = self._entries.get(snapshot_id)
                # T2454-B: refuse to re-stage an in-flight entry — the FSM has
                # claim()-ed the staged instances and is mid-activation.
                # Re-staging would race the adopt path and could leak
                # instances. Checked BEFORE the already_warm fast-path so a
                # caller probing during activation gets the truthful answer.
                if existing is not None and existing.in_flight:
                    return {
                        "snapshot_id": snapshot_id,
                        "warm": existing.warm,
                        "version": existing.version,
                        "staged_instance_count": len(existing.staged_instance_ids),
                        "reason": "in_flight",
                    }
                # Fast path: already warm and not drifted.
                if existing and existing.warm and existing.version == target_version:
                    return {
                        "snapshot_id": snapshot_id,
                        "warm": True,
                        "version": target_version,
                        "staged_instance_count": len(existing.staged_instance_ids),
                        "reason": "already_warm",
                    }

            # Stage the snapshot's plugins via ChainService. We call the
            # same primitive `schedule_preload` uses internally, so the
            # RT-safety + engine capability-gap handling is shared.
            stage_plugins = service._snapshot_preload_stage_plugins(snapshot_row)
            staged = await service.chain_service.stage_detached_chain_plugins(stage_plugins)
            staged_instance_ids: list[int] = []
            for raw in staged.get("staged_instance_ids", []) or []:
                try:
                    instance_id = int(raw)
                except (TypeError, ValueError):
                    continue
                if instance_id > 0:
                    staged_instance_ids.append(instance_id)

            status = str(staged.get("status") or "ready").lower()
            warmings_succeeded = status in {"ready", "ok"} and bool(staged_instance_ids or not stage_plugins)
            warnings = list(staged.get("warnings") or [])

            # Replace any existing entry — release the old engine handles
            # before overwriting so we don't leak.
            async with self._lock:
                old = self._entries.get(snapshot_id)
                if old and old.staged_instance_ids:
                    try:
                        await service.chain_service.release_detached_instance_ids(
                            list(old.staged_instance_ids)
                        )
                    except Exception as exc:
                        logger.debug(
                            "Preload orchestrator: release of stale instances "
                            "for snapshot %s failed: %s",
                            snapshot_id, exc,
                        )

                self._entries[snapshot_id] = PreloadEntry(
                    snapshot_id=snapshot_id,
                    version=target_version,
                    staged_instance_ids=staged_instance_ids,
                    warmed_at=time.monotonic(),
                    warm=warmings_succeeded,
                    last_error=(None if warmings_succeeded else (warnings[0] if warnings else status)),
                )

            return {
                "snapshot_id": snapshot_id,
                "warm": warmings_succeeded,
                "version": target_version,
                "staged_instance_count": len(staged_instance_ids),
                "status": status,
                "warnings": warnings,
                "reason": "warmed" if warmings_succeeded else "stage_failed",
            }

    async def evict(self, snapshot_id: int, *, force: bool = False) -> dict[str, Any]:
        """Drop a warm entry and release its staged engine instances.

        T2454-B: respects the `in_flight` lock — an entry that's been
        `claim()`-ed by an in-flight activation will not be evicted unless
        `force=True`. The reconciler always passes `force=False`; the FSM's
        `mark_consumed(success=False)` path passes `force=True` because at
        that point it owns the staged instances.
        """
        snapshot_id = int(snapshot_id)
        released: list[int] = []
        async with self._lock:
            entry = self._entries.get(snapshot_id)
            if entry is None:
                return {"snapshot_id": snapshot_id, "evicted": False, "reason": "not_warm"}
            if entry.in_flight and not force:
                return {
                    "snapshot_id": snapshot_id,
                    "evicted": False,
                    "reason": "in_flight",
                }
            self._entries.pop(snapshot_id, None)
            released = list(entry.staged_instance_ids)

        if released:
            try:
                from app.services.chain_service import ChainService

                # Release happens against engine state, not DB — no session needed.
                chain_service = ChainService()
                await chain_service.release_detached_instance_ids(released)
            except Exception as exc:
                logger.warning(
                    "Preload orchestrator: release of instances %s for snapshot %s failed: %s",
                    released, snapshot_id, exc,
                )

        return {
            "snapshot_id": snapshot_id,
            "evicted": True,
            "released_instance_count": len(released),
        }

    async def claim(self, snapshot_id: int) -> Optional[PreloadClaim]:
        """T2454-B: hand the activation FSM a snapshot of the warm entry's
        staged instance ids and mark the entry in-flight so the reconciler
        won't release them mid-activation. Returns None if the entry is
        cold, missing, or already in-flight.

        Always pair with `mark_consumed(snapshot_id, success=...)` once
        activation either commits or aborts — even on exception paths."""
        snapshot_id = int(snapshot_id)
        async with self._lock:
            entry = self._entries.get(snapshot_id)
            if entry is None or not entry.warm or entry.in_flight:
                return None
            entry.in_flight = True
            return PreloadClaim(
                snapshot_id=entry.snapshot_id,
                version=entry.version,
                staged_instance_ids=tuple(entry.staged_instance_ids),
            )

    async def mark_consumed(self, snapshot_id: int, *, success: bool) -> dict[str, Any]:
        """T2454-B: clear the in-flight lock set by `claim()`.

        On `success=True`: the FSM's warm path adopted the staged instances
        and the engine has incorporated them into the live graph. The cache
        entry is invalidated (the staged instances are now part of the live
        graph, not the warm cache) so the next reconciler tick re-warms
        from a clean slate. We force-evict to skip the in-flight check we
        ourselves set.

        On `success=False`: the warm path failed (engine reject, partial
        adopt, etc.). Force-evict the entry so the reconciler re-warms it
        on the next tick (Q4=D self-healing fallback)."""
        snapshot_id = int(snapshot_id)
        async with self._lock:
            entry = self._entries.get(snapshot_id)
            if entry is None:
                return {"snapshot_id": snapshot_id, "consumed": False, "reason": "not_warm"}
            entry.in_flight = False

        # Both success and failure invalidate the warm-cache entry — the
        # staged instances are no longer ours to hand out (success: live
        # graph owns them now; failure: they may have been partially
        # consumed and we cannot trust the cache state).
        result = await self.evict(snapshot_id, force=True)
        result["consumed"] = True
        result["consume_outcome"] = "success" if success else "failure"
        return result

    async def reconcile(self, pinned_ids: list[int]) -> dict[str, Any]:
        """Walk the pinned set, evict orphans, warm anything cold or
        version-drifted. Capped concurrency = 2. Returns a summary the
        reconciler logger can use to track progress."""
        pinned_ids = [int(value) for value in pinned_ids if isinstance(value, (int, str))]
        pinned_set = {value for value in pinned_ids if value > 0}

        # 1. Evict warmed entries that are no longer pinned.
        async with self._lock:
            stale = [snapshot_id for snapshot_id in self._entries if snapshot_id not in pinned_set]

        evicted = 0
        for snapshot_id in stale:
            try:
                result = await self.evict(snapshot_id)
                if result.get("evicted"):
                    evicted += 1
            except Exception as exc:
                logger.warning("Preload reconciler: evict %s failed: %s", snapshot_id, exc)

        # 2. Warm any pinned snapshot that's cold or whose version drifted.
        # T2454-B: skip in-flight entries — the FSM has claim()-ed them and
        # is mid-activation; re-warming would race the adopt path.
        targets: list[int] = []
        async with get_session() as session:
            for snapshot_id in pinned_ids:
                snapshot_row = await self._read_snapshot_row(session, snapshot_id)
                if snapshot_row is None:
                    continue
                target_version = int(snapshot_row.version or 1)
                async with self._lock:
                    existing = self._entries.get(snapshot_id)
                    if existing is not None and existing.in_flight:
                        continue
                if existing is None or not existing.warm or existing.version != target_version:
                    targets.append(snapshot_id)

        warmed = 0
        if targets:
            semaphore = asyncio.Semaphore(2)

            async def _warm(snapshot_id: int) -> None:
                async with semaphore:
                    try:
                        result = await self.preload(snapshot_id)
                        if result.get("warm"):
                            return
                    except Exception as exc:
                        logger.warning(
                            "Preload reconciler: warm %s failed: %s", snapshot_id, exc
                        )

            await asyncio.gather(*(_warm(snapshot_id) for snapshot_id in targets))
            # Recount warmed count from the cache (preload is idempotent so a
            # second-pass query under the lock is the truth).
            async with self._lock:
                warmed = sum(
                    1 for sid in targets if (entry := self._entries.get(sid)) and entry.warm
                )

        return {
            "pinned_count": len(pinned_ids),
            "evicted": evicted,
            "warmed": warmed,
            "targets_attempted": len(targets),
        }

    async def _read_snapshot_row(self, session, snapshot_id: int) -> Optional[Snapshot]:
        # Eager-load channels and chains→plugins so `_snapshot_preload_stage_plugins`
        # can walk the relationship graph after the session has yielded back to
        # the orchestrator. Without this, lazy-loading mid-preload triggers
        # `greenlet_spawn` errors under the async-engine.
        result = await session.execute(
            select(Snapshot)
            .options(
                selectinload(Snapshot.channels),
                selectinload(Snapshot.chains).selectinload(SnapshotChain.plugins),
            )
            .where(Snapshot.id == int(snapshot_id))
        )
        return result.scalar_one_or_none()


def get_preload_orchestrator() -> SnapshotPreloadOrchestrator:
    return SnapshotPreloadOrchestrator.get_instance()
