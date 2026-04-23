"""
LCD morph evaluator — T2430-J.

Subscribes to morph-pad position updates and drives the LCD cluster to
track the interpolated snapshot-LCD-hook state. Runs at 5 Hz (200 ms
period) — fast enough to feel synchronised with morph knob motion but
slow enough that the HD44780 hardware (≈10 Hz refresh, categorical
display fields) doesn't get flooded with writes.

Morph position source is pluggable so this service is independent of
the C++ engine's MorphEngine evolution. A position source returns either:

    ``None`` — morph inactive, no override should apply.
    ``MorphState(x, y, corners={A,B,C,D}: snapshot_id)`` — interpolate.

When morph is inactive (source returns None), a transition fires to the
current non-morph active snapshot hook (if any) — handled by the
SnapshotFSM integration, not this loop.

Back-pressure: this service only writes when the interpolated result
materially changes (epsilon = 2 for numeric fields, exact for
categorical/bool). Keeps I²C traffic sane during a full morph sweep.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Optional

from app.services.snapshot.lcd_hook_evaluator import (
    interpolate_snapshot_aware,
    get_hook,
    resolve_hook,
)

logger = logging.getLogger(__name__)

# Per Q6b — 5 Hz evaluation (200 ms period).
MORPH_EVAL_PERIOD_S = 0.2

# Back-pressure thresholds: only apply a field if it changed by at least this
# much. Categorical/bool fields always use exact comparison.
NUMERIC_EPSILON = 2.0


@dataclass
class MorphState:
    x: float
    y: float
    # Snapshot ids for each corner (A=0,0 B=1,0 C=0,1 D=1,1). Any may be None.
    corners: dict[str, Optional[str]] = field(default_factory=dict)


PositionSource = Callable[[], Optional[MorphState]]
PresetLoader = Callable[[str], Optional[dict[str, Any]]]
HookApplier = Callable[[dict[str, Any]], Awaitable[None]]


class LCDMorphEvaluator:
    """5 Hz morph-aware hook evaluator."""

    def __init__(
        self,
        position_source: PositionSource,
        apply_hook: HookApplier,
        preset_loader: PresetLoader,
        *,
        period_s: float = MORPH_EVAL_PERIOD_S,
    ) -> None:
        self._position_source = position_source
        self._apply_hook = apply_hook
        self._preset_loader = preset_loader
        self._period_s = period_s
        self._task: Optional[asyncio.Task[None]] = None
        self._last_applied: Optional[dict[str, Any]] = None
        self._running = False
        self._stats = {"evals": 0, "applies": 0, "suppressed": 0, "last_eval_ts": 0.0}

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())
        logger.info("LCDMorphEvaluator started (period=%dms)", int(self._period_s * 1000))

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("LCDMorphEvaluator stopped")

    def get_stats(self) -> dict[str, Any]:
        return dict(self._stats)

    async def _loop(self) -> None:
        while self._running:
            try:
                await self._tick()
            except asyncio.CancelledError:
                break
            except Exception as e:  # noqa: BLE001
                logger.warning("LCDMorphEvaluator tick error: %s", e)
            await asyncio.sleep(self._period_s)

    async def _tick(self) -> None:
        self._stats["evals"] += 1
        self._stats["last_eval_ts"] = time.time()

        state = self._position_source()
        if state is None:
            # Morph inactive; nothing to do. Do NOT clear — the active
            # snapshot's static hook still governs, driven by the FSM.
            return

        # Resolve each corner's hook envelope to projected overrides.
        corners_resolved: dict[str, Optional[dict[str, Any]]] = {}
        for corner_key in ("A", "B", "C", "D"):
            snapshot_id = state.corners.get(corner_key)
            if not snapshot_id:
                corners_resolved[corner_key] = None
                continue
            hook_envelope = get_hook(snapshot_id)
            resolved = resolve_hook(hook_envelope, load_preset=self._preset_loader)
            corners_resolved[corner_key] = resolved

        interpolated = interpolate_snapshot_aware(corners_resolved, x=state.x, y=state.y)
        if interpolated is None:
            return

        if not self._has_materially_changed(interpolated):
            self._stats["suppressed"] += 1
            return

        self._last_applied = interpolated
        self._stats["applies"] += 1
        try:
            await self._apply_hook(interpolated)
        except Exception as e:  # noqa: BLE001
            logger.warning("LCDMorphEvaluator apply failed: %s", e)

    def _has_materially_changed(self, interpolated: dict[str, Any]) -> bool:
        """Back-pressure — return True only if the new value differs enough."""
        if self._last_applied is None:
            return True

        prev_by_id = {d["id"]: d for d in self._last_applied.get("displays", [])}
        for entry in interpolated.get("displays", []):
            prev = prev_by_id.get(entry.get("id"))
            if not prev:
                return True
            for field_name, new_value in entry.items():
                if field_name == "id":
                    continue
                old_value = prev.get(field_name)
                if isinstance(new_value, (int, float)) and isinstance(old_value, (int, float)):
                    if abs(new_value - old_value) >= NUMERIC_EPSILON:
                        return True
                else:
                    if new_value != old_value:
                        return True
        return False
