"""Parity tests for app.utils.latency_pressure mirroring the TS counterpart
(web/src/app/utils/latencyPressure.test.ts). Same inputs => same scores.
"""

from __future__ import annotations

from app.utils.latency_pressure import (
    LatencyPressureInputs,
    compute_latency_pressure,
)


def test_healthy_telemetry_top_band():
    analysis = compute_latency_pressure(
        LatencyPressureInputs(
            running=True,
            total_latency_ms=4.4,
            rtl_p95_ms=4.6,
            jitter_p95_ms=0.18,
            xrun_count=0,
            callback_budget_ms=2.67,
            current_callback_ms=1.02,
            headroom_percent=61.0,
        )
    )
    assert analysis.is_available is True
    assert analysis.score == 10
    assert analysis.pressure_percent is not None and analysis.pressure_percent <= 10
    assert analysis.status == "stable"


def test_xrun_caps_score_even_when_averages_look_healthy():
    analysis = compute_latency_pressure(
        LatencyPressureInputs(
            running=True,
            total_latency_ms=4.3,
            rtl_p95_ms=4.5,
            jitter_p95_ms=0.15,
            xrun_count=1,
            callback_budget_ms=2.67,
            current_callback_ms=1.0,
            headroom_percent=58.0,
        )
    )
    assert analysis.score == 6
    assert analysis.pressure_percent is not None and analysis.pressure_percent >= 40
    assert analysis.status == "watch"


def test_stacked_pressure_drops_to_red():
    analysis = compute_latency_pressure(
        LatencyPressureInputs(
            running=True,
            total_latency_ms=11.5,
            rtl_p95_ms=12.2,
            jitter_p95_ms=0.72,
            xrun_count=4,
            callback_budget_ms=2.67,
            current_callback_ms=2.54,
            headroom_percent=12.0,
        )
    )
    assert analysis.score is not None and analysis.score <= 2
    assert analysis.pressure_percent is not None and analysis.pressure_percent >= 80
    assert analysis.status == "critical"


def test_engine_offline_with_known_telemetry():
    analysis = compute_latency_pressure(
        LatencyPressureInputs(
            running=False,
            total_latency_ms=4.8,
            rtl_p95_ms=5.0,
            jitter_p95_ms=0.2,
            xrun_count=0,
            callback_budget_ms=2.67,
            current_callback_ms=0.9,
            headroom_percent=50.0,
        )
    )
    assert analysis.score == 0
    assert analysis.pressure_percent == 100
    assert analysis.status == "offline"


def test_no_signal_returns_waiting():
    analysis = compute_latency_pressure(LatencyPressureInputs())
    assert analysis.is_available is False
    assert analysis.score is None
    assert analysis.pressure_percent is None
    assert analysis.status == "waiting"
