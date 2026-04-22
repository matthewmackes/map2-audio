"""Tests for the reconciliation scheduler + Prometheus metrics layer."""

from __future__ import annotations

import asyncio

import pytest

from app.services.state_authority_reconciliation_scheduler import (
    DEFAULT_LOCAL_RECONCILE_INTERVAL_S,
    DEFAULT_RECONCILE_TOLERANCE,
    ReconciliationMetrics,
    ReconciliationSchedulerConfig,
    StateAuthorityReconciliationScheduler,
    render_metrics_as_prometheus,
)


def test_default_interval_is_five_seconds():
    """Plan Q44 — local Layer 1 runs every 5 seconds."""
    assert DEFAULT_LOCAL_RECONCILE_INTERVAL_S == 5.0


def test_default_tolerance_is_one_percent():
    """Plan Q23 — parameter drift >1% triggers correction."""
    assert DEFAULT_RECONCILE_TOLERANCE == 0.01


def test_metrics_as_dict_surfaces_every_counter_and_timestamp():
    metrics = ReconciliationMetrics(
        local_runs_total=7,
        local_drift_detected_total=3,
        local_corrections_applied_total=2,
        last_local_status="self_healed",
    )
    payload = metrics.as_dict()
    assert payload["local_runs_total"] == 7
    assert payload["local_drift_detected_total"] == 3
    assert payload["local_corrections_applied_total"] == 2
    assert payload["last_local_status"] == "self_healed"


def test_render_prometheus_contains_expected_series():
    metrics = ReconciliationMetrics(
        local_runs_total=42,
        local_corrections_applied_total=5,
        last_local_reconcile_unix_s=1_700_000_000.0,
    )
    body = render_metrics_as_prometheus(metrics)
    assert "map2_state_authority_local_runs_total 42" in body
    assert "map2_state_authority_local_corrections_total 5" in body
    assert "map2_state_authority_last_local_reconcile_unix_s 1700000000.0" in body
    assert "# TYPE map2_state_authority_local_runs_total counter" in body


@pytest.mark.asyncio
async def test_run_local_once_records_healthy_payload():
    async def payload_producer() -> dict | None:
        return {"chains": [{"plugins": []}]}

    async def local_reconciler(payload, tolerance, apply):  # noqa: ARG001
        return {
            "status": "healthy",
            "parameter_drift_count": 0,
            "bypass_drift_count": 0,
            "correction_count": 0,
            "reactivation_required": False,
        }

    scheduler = StateAuthorityReconciliationScheduler(
        live_payload_producer=payload_producer,
        local_reconciler=local_reconciler,
    )
    report = await scheduler.run_local_once()
    assert report["status"] == "healthy"
    assert scheduler.metrics.local_runs_total == 1
    assert scheduler.metrics.last_local_status == "healthy"
    assert scheduler.metrics.local_drift_detected_total == 0
    assert scheduler.metrics.local_corrections_applied_total == 0


@pytest.mark.asyncio
async def test_run_local_once_records_self_healed_counters():
    async def payload_producer() -> dict | None:
        return {"chains": [{"plugins": [{"uri": "map2:fx:nam", "parameters": {"0": 0.7}}]}]}

    async def local_reconciler(payload, tolerance, apply):  # noqa: ARG001
        return {
            "status": "self_healed",
            "parameter_drift_count": 3,
            "bypass_drift_count": 1,
            "correction_count": 4,
            "reactivation_required": False,
        }

    scheduler = StateAuthorityReconciliationScheduler(
        live_payload_producer=payload_producer,
        local_reconciler=local_reconciler,
    )
    await scheduler.run_local_once()
    assert scheduler.metrics.local_drift_detected_total == 4  # 3 + 1
    assert scheduler.metrics.local_corrections_applied_total == 4
    assert scheduler.metrics.last_local_status == "self_healed"


@pytest.mark.asyncio
async def test_run_local_once_counts_reactivation_required():
    async def payload_producer() -> dict | None:
        return {"chains": []}

    async def local_reconciler(payload, tolerance, apply):  # noqa: ARG001
        return {
            "status": "reactivation_required",
            "reactivation_required": True,
            "parameter_drift_count": 0,
            "bypass_drift_count": 0,
            "correction_count": 0,
        }

    scheduler = StateAuthorityReconciliationScheduler(
        live_payload_producer=payload_producer,
        local_reconciler=local_reconciler,
    )
    await scheduler.run_local_once()
    assert scheduler.metrics.local_reactivations_required_total == 1


@pytest.mark.asyncio
async def test_run_local_once_captures_error_without_crashing_the_scheduler():
    async def payload_producer() -> dict | None:
        raise RuntimeError("no live snapshot")

    async def local_reconciler(payload, tolerance, apply):  # noqa: ARG001
        return {"status": "healthy"}

    scheduler = StateAuthorityReconciliationScheduler(
        live_payload_producer=payload_producer,
        local_reconciler=local_reconciler,
    )
    report = await scheduler.run_local_once()
    assert report["status"] == "error"
    assert scheduler.metrics.last_local_status == "error"
    assert "no live snapshot" in (scheduler.metrics.last_local_error or "")


@pytest.mark.asyncio
async def test_run_cluster_once_respects_disabled_when_no_reconciler():
    async def payload_producer() -> dict | None:
        return None

    async def local_reconciler(payload, tolerance, apply):  # noqa: ARG001
        return {"status": "healthy"}

    scheduler = StateAuthorityReconciliationScheduler(
        live_payload_producer=payload_producer,
        local_reconciler=local_reconciler,
        cluster_reconciler=None,
    )
    report = await scheduler.run_cluster_once()
    assert report["status"] == "disabled"
    assert scheduler.metrics.cluster_runs_total == 0


@pytest.mark.asyncio
async def test_run_cluster_once_records_nodes_with_drift():
    async def payload_producer() -> dict | None:
        return None

    async def local_reconciler(payload, tolerance, apply):  # noqa: ARG001
        return {"status": "healthy"}

    async def cluster_reconciler():
        return {"status": "drift", "nodes_with_drift": 2}

    scheduler = StateAuthorityReconciliationScheduler(
        live_payload_producer=payload_producer,
        local_reconciler=local_reconciler,
        cluster_reconciler=cluster_reconciler,
    )
    await scheduler.run_cluster_once()
    assert scheduler.metrics.cluster_runs_total == 1
    assert scheduler.metrics.cluster_nodes_with_drift_total == 2
    assert scheduler.metrics.last_cluster_status == "drift"


@pytest.mark.asyncio
async def test_start_and_stop_cleanly_cancel_tasks():
    async def payload_producer() -> dict | None:
        return None

    async def local_reconciler(payload, tolerance, apply):  # noqa: ARG001
        return {"status": "healthy"}

    scheduler = StateAuthorityReconciliationScheduler(
        config=ReconciliationSchedulerConfig(local_interval_s=0.05),
        live_payload_producer=payload_producer,
        local_reconciler=local_reconciler,
    )
    await scheduler.start()
    await asyncio.sleep(0.15)  # let a couple of ticks land
    await scheduler.stop()
    assert scheduler.metrics.local_runs_total >= 2
    assert scheduler.metrics.last_local_status == "healthy"


@pytest.mark.asyncio
async def test_management_node_runs_both_loops_when_cluster_reconciler_is_set():
    async def payload_producer() -> dict | None:
        return None

    async def local_reconciler(payload, tolerance, apply):  # noqa: ARG001
        return {"status": "healthy"}

    async def cluster_reconciler():
        return {"status": "healthy", "nodes_with_drift": 0}

    scheduler = StateAuthorityReconciliationScheduler(
        config=ReconciliationSchedulerConfig(
            local_interval_s=0.05,
            cluster_interval_s=0.05,
            is_management_node=True,
        ),
        live_payload_producer=payload_producer,
        local_reconciler=local_reconciler,
        cluster_reconciler=cluster_reconciler,
    )
    await scheduler.start()
    await asyncio.sleep(0.20)
    await scheduler.stop()
    assert scheduler.metrics.local_runs_total >= 2
    assert scheduler.metrics.cluster_runs_total >= 1


@pytest.mark.asyncio
async def test_worker_node_does_not_start_cluster_loop_even_if_reconciler_provided():
    async def payload_producer() -> dict | None:
        return None

    async def local_reconciler(payload, tolerance, apply):  # noqa: ARG001
        return {"status": "healthy"}

    async def cluster_reconciler():
        return {"status": "should-not-be-called"}

    scheduler = StateAuthorityReconciliationScheduler(
        config=ReconciliationSchedulerConfig(
            local_interval_s=0.05,
            is_management_node=False,
        ),
        live_payload_producer=payload_producer,
        local_reconciler=local_reconciler,
        cluster_reconciler=cluster_reconciler,
    )
    await scheduler.start()
    await asyncio.sleep(0.12)
    await scheduler.stop()
    assert scheduler.metrics.cluster_runs_total == 0
