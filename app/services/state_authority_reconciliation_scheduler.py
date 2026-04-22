"""State Authority reconciliation scheduler + Prometheus metrics.

Plan §Reconciliation (Q11, Q23, Q44, Q55, Q66, Q95) specifies a two-layer
reconciliation system:

  Layer 1 — Per-node local self-heal. Every 5s compare engine runtime state
            against local desired-state cache; parameter drift >1% tolerance
            triggers targeted `set_parameter()` calls; topology drift reports
            to the management node (can't self-fix topology).

  Layer 2 — Management-node cross-node coordination. Every 5s query all node
            runtime endpoints; compare vs etcd AuthoritativeAudioState;
            tiered response: param fix → full re-activation → asset redeploy
            → failover.

This module owns the scheduler + Prometheus exposition. The actual drift
detection lives in
`app/services/state_authority_reconciliation_service.py` (Layer 1 local).
Layer 2 composition sits atop Layer 1 reports.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

logger = logging.getLogger(__name__)


# Plan Q44 — every 5 seconds.
DEFAULT_LOCAL_RECONCILE_INTERVAL_S = 5.0
DEFAULT_CLUSTER_RECONCILE_INTERVAL_S = 5.0

# Plan Q23 — >1% (0.01) tolerance for parameter drift.
DEFAULT_RECONCILE_TOLERANCE = 0.01


@dataclass
class ReconciliationMetrics:
    """In-memory Prometheus-adjacent counters. A thin layer mirrors these to
    the real Prometheus registry on publish."""

    local_runs_total: int = 0
    local_drift_detected_total: int = 0
    local_corrections_applied_total: int = 0
    local_reactivations_required_total: int = 0
    cluster_runs_total: int = 0
    cluster_nodes_with_drift_total: int = 0
    last_local_reconcile_unix_s: float = 0.0
    last_cluster_reconcile_unix_s: float = 0.0
    last_local_status: str = "never_run"
    last_cluster_status: str = "never_run"
    last_local_error: str | None = None
    last_cluster_error: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "local_runs_total": self.local_runs_total,
            "local_drift_detected_total": self.local_drift_detected_total,
            "local_corrections_applied_total": self.local_corrections_applied_total,
            "local_reactivations_required_total": self.local_reactivations_required_total,
            "cluster_runs_total": self.cluster_runs_total,
            "cluster_nodes_with_drift_total": self.cluster_nodes_with_drift_total,
            "last_local_reconcile_unix_s": self.last_local_reconcile_unix_s,
            "last_cluster_reconcile_unix_s": self.last_cluster_reconcile_unix_s,
            "last_local_status": self.last_local_status,
            "last_cluster_status": self.last_cluster_status,
            "last_local_error": self.last_local_error,
            "last_cluster_error": self.last_cluster_error,
        }


@dataclass
class ReconciliationSchedulerConfig:
    local_interval_s: float = DEFAULT_LOCAL_RECONCILE_INTERVAL_S
    cluster_interval_s: float = DEFAULT_CLUSTER_RECONCILE_INTERVAL_S
    tolerance: float = DEFAULT_RECONCILE_TOLERANCE
    apply_corrections: bool = True  # Layer 1: targeted fixes are safe
    is_management_node: bool = False  # Only management runs Layer 2


# Injected producers:
#   - `get_live_snapshot_payload()` returns the current desired-state live
#     snapshot dict (or None).
#   - `run_local_reconciliation(payload, tolerance, apply_corrections)` is the
#     Layer 1 entry point (returns the report dict).
#   - `run_cluster_reconciliation()` is the Layer 2 entry point (returns dict
#     describing per-node reports + tiered responses).
LiveSnapshotProducer = Callable[[], Awaitable[dict[str, Any] | None]]
LocalReconciler = Callable[[dict[str, Any] | None, float, bool], Awaitable[dict[str, Any]]]
ClusterReconciler = Callable[[], Awaitable[dict[str, Any]]]


class StateAuthorityReconciliationScheduler:
    """Background scheduler that ticks Layer 1 (+ optional Layer 2) on intervals."""

    def __init__(
        self,
        *,
        config: ReconciliationSchedulerConfig | None = None,
        live_payload_producer: LiveSnapshotProducer,
        local_reconciler: LocalReconciler,
        cluster_reconciler: ClusterReconciler | None = None,
        metrics: ReconciliationMetrics | None = None,
        now_s: Callable[[], float] | None = None,
    ) -> None:
        self._config = config or ReconciliationSchedulerConfig()
        self._live_payload = live_payload_producer
        self._local_reconciler = local_reconciler
        self._cluster_reconciler = cluster_reconciler
        self._metrics = metrics or ReconciliationMetrics()
        self._now_s = now_s or time.time
        self._local_task: asyncio.Task | None = None
        self._cluster_task: asyncio.Task | None = None
        self._started = False

    @property
    def metrics(self) -> ReconciliationMetrics:
        return self._metrics

    async def run_local_once(self) -> dict[str, Any]:
        """Execute one Layer 1 tick and update metrics. Returns the report."""
        self._metrics.local_runs_total += 1
        try:
            payload = await self._live_payload()
            report = await self._local_reconciler(
                payload,
                self._config.tolerance,
                self._config.apply_corrections,
            )
            self._apply_local_metrics(report)
            return report
        except Exception as exc:  # noqa: BLE001 — scheduler must survive upstream errors
            logger.exception("Layer 1 reconciliation tick failed")
            self._metrics.last_local_status = "error"
            self._metrics.last_local_error = repr(exc)
            self._metrics.last_local_reconcile_unix_s = self._now_s()
            return {"status": "error", "error": repr(exc)}

    async def run_cluster_once(self) -> dict[str, Any]:
        """Execute one Layer 2 tick (management node only). Returns the report."""
        if self._cluster_reconciler is None:
            return {"status": "disabled"}
        self._metrics.cluster_runs_total += 1
        try:
            report = await self._cluster_reconciler()
            self._apply_cluster_metrics(report)
            return report
        except Exception as exc:  # noqa: BLE001
            logger.exception("Layer 2 reconciliation tick failed")
            self._metrics.last_cluster_status = "error"
            self._metrics.last_cluster_error = repr(exc)
            self._metrics.last_cluster_reconcile_unix_s = self._now_s()
            return {"status": "error", "error": repr(exc)}

    async def start(self) -> None:
        if self._started:
            return
        self._started = True
        self._local_task = asyncio.create_task(self._local_loop())
        if self._config.is_management_node and self._cluster_reconciler is not None:
            # Offset cluster ticks by half the interval so the two layers
            # don't hammer the engine simultaneously.
            self._cluster_task = asyncio.create_task(self._cluster_loop())

    async def stop(self) -> None:
        if not self._started:
            return
        self._started = False
        for task in (self._local_task, self._cluster_task):
            if task is None:
                continue
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._local_task = None
        self._cluster_task = None

    async def _local_loop(self) -> None:
        interval = max(0.05, float(self._config.local_interval_s))
        while self._started:
            await self.run_local_once()
            try:
                await asyncio.sleep(interval)
            except asyncio.CancelledError:
                break

    async def _cluster_loop(self) -> None:
        interval = max(0.05, float(self._config.cluster_interval_s))
        # Start offset so the two loops interleave.
        try:
            await asyncio.sleep(interval / 2)
        except asyncio.CancelledError:
            return
        while self._started:
            await self.run_cluster_once()
            try:
                await asyncio.sleep(interval)
            except asyncio.CancelledError:
                break

    def _apply_local_metrics(self, report: dict[str, Any]) -> None:
        self._metrics.last_local_reconcile_unix_s = self._now_s()
        status = str(report.get("status") or "unknown")
        self._metrics.last_local_status = status
        self._metrics.last_local_error = None
        if status in {"self_healed", "drift_detected"}:
            drift_count = int(report.get("parameter_drift_count", 0)) + int(
                report.get("bypass_drift_count", 0)
            )
            if drift_count > 0:
                self._metrics.local_drift_detected_total += drift_count
            corrections = int(report.get("correction_count", 0))
            if corrections > 0:
                self._metrics.local_corrections_applied_total += corrections
        if report.get("reactivation_required"):
            self._metrics.local_reactivations_required_total += 1

    def _apply_cluster_metrics(self, report: dict[str, Any]) -> None:
        self._metrics.last_cluster_reconcile_unix_s = self._now_s()
        status = str(report.get("status") or "unknown")
        self._metrics.last_cluster_status = status
        self._metrics.last_cluster_error = None
        nodes_with_drift = int(report.get("nodes_with_drift", 0))
        if nodes_with_drift > 0:
            self._metrics.cluster_nodes_with_drift_total += nodes_with_drift


# -----------------------------------------------------------------------------
# Prometheus exposition helper — formats metrics as a plaintext exposition
# body without requiring the prometheus_client library. The real Prometheus
# route can compose this body with its own registry output.
# -----------------------------------------------------------------------------


_PROMETHEUS_PREFIX = "map2_state_authority"


def render_metrics_as_prometheus(metrics: ReconciliationMetrics) -> str:
    """Render reconciliation metrics in the Prometheus text exposition format."""
    lines: list[str] = []
    lines.append(f"# HELP {_PROMETHEUS_PREFIX}_local_runs_total Total Layer 1 (local) reconciliation ticks")
    lines.append(f"# TYPE {_PROMETHEUS_PREFIX}_local_runs_total counter")
    lines.append(f"{_PROMETHEUS_PREFIX}_local_runs_total {metrics.local_runs_total}")

    lines.append(f"# HELP {_PROMETHEUS_PREFIX}_local_drift_total Total local parameter+bypass drift observations")
    lines.append(f"# TYPE {_PROMETHEUS_PREFIX}_local_drift_total counter")
    lines.append(f"{_PROMETHEUS_PREFIX}_local_drift_total {metrics.local_drift_detected_total}")

    lines.append(f"# HELP {_PROMETHEUS_PREFIX}_local_corrections_total Total local self-healed parameters")
    lines.append(f"# TYPE {_PROMETHEUS_PREFIX}_local_corrections_total counter")
    lines.append(f"{_PROMETHEUS_PREFIX}_local_corrections_total {metrics.local_corrections_applied_total}")

    lines.append(f"# HELP {_PROMETHEUS_PREFIX}_local_reactivations_required_total Local topology drift requiring reactivation")
    lines.append(f"# TYPE {_PROMETHEUS_PREFIX}_local_reactivations_required_total counter")
    lines.append(f"{_PROMETHEUS_PREFIX}_local_reactivations_required_total {metrics.local_reactivations_required_total}")

    lines.append(f"# HELP {_PROMETHEUS_PREFIX}_cluster_runs_total Total Layer 2 (cluster) reconciliation ticks")
    lines.append(f"# TYPE {_PROMETHEUS_PREFIX}_cluster_runs_total counter")
    lines.append(f"{_PROMETHEUS_PREFIX}_cluster_runs_total {metrics.cluster_runs_total}")

    lines.append(f"# HELP {_PROMETHEUS_PREFIX}_cluster_nodes_with_drift_total Cumulative cluster nodes reporting drift")
    lines.append(f"# TYPE {_PROMETHEUS_PREFIX}_cluster_nodes_with_drift_total counter")
    lines.append(f"{_PROMETHEUS_PREFIX}_cluster_nodes_with_drift_total {metrics.cluster_nodes_with_drift_total}")

    lines.append(f"# HELP {_PROMETHEUS_PREFIX}_last_local_reconcile_unix_s Unix timestamp of last Layer 1 tick")
    lines.append(f"# TYPE {_PROMETHEUS_PREFIX}_last_local_reconcile_unix_s gauge")
    lines.append(f"{_PROMETHEUS_PREFIX}_last_local_reconcile_unix_s {metrics.last_local_reconcile_unix_s}")

    lines.append(f"# HELP {_PROMETHEUS_PREFIX}_last_cluster_reconcile_unix_s Unix timestamp of last Layer 2 tick")
    lines.append(f"# TYPE {_PROMETHEUS_PREFIX}_last_cluster_reconcile_unix_s gauge")
    lines.append(f"{_PROMETHEUS_PREFIX}_last_cluster_reconcile_unix_s {metrics.last_cluster_reconcile_unix_s}")

    return "\n".join(lines) + "\n"
