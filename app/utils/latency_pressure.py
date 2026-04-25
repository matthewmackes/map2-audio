"""
Latency Pressure — first-class, platform-wide realtime-audio health score.

Mirrors web/src/app/utils/latencyPressure.ts verbatim (same thresholds, same
weights, same xrun cap, same status bands) so the score is identical no matter
where it is computed. The frontend uses the TypeScript implementation for
locally-collected telemetry; the backend uses this Python implementation to
publish per-node scores on NodeHealth via the topology endpoint.

Inputs are five realtime metrics scored 0..10 each, then weighted into a single
0..10 operator score. The xrun cap enforces "even one glitch can't be 'stable'".

Outputs:
  score              : 0..10 (rounded), None when no telemetry yet
  pressure_percent   : 100 - score*10 (0 = healthy, 100 = critical)
  status             : waiting | offline | stable | watch | critical

This is purely a math function — no I/O, fully deterministic, safe to call
from any thread.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional


LatencyPressureStatus = Literal["waiting", "offline", "stable", "watch", "critical"]


@dataclass(frozen=True)
class LatencyPressureInputs:
    running: Optional[bool] = None
    total_latency_ms: Optional[float] = None
    rtl_p95_ms: Optional[float] = None
    jitter_p95_ms: Optional[float] = None
    xrun_count: Optional[int] = None
    callback_budget_ms: Optional[float] = None
    current_callback_ms: Optional[float] = None
    headroom_percent: Optional[float] = None


@dataclass(frozen=True)
class LatencyPressureAnalysis:
    is_available: bool
    score: Optional[int]
    pressure_percent: Optional[int]
    status: LatencyPressureStatus


def _clamp(value: float, lo: float, hi: float) -> float:
    if value != value:  # NaN
        return lo
    return max(lo, min(hi, value))


def _finite(value: Optional[float]) -> Optional[float]:
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    if f != f or f in (float("inf"), float("-inf")):
        return None
    return f


def _score_bad_metric(value: Optional[float], good_threshold: float, bad_threshold: float) -> float:
    """Higher input is worse — score 10 at <= good, 0 at >= bad, linear between."""
    if value is None:
        return 10.0
    if value <= good_threshold:
        return 10.0
    if value >= bad_threshold:
        return 0.0
    normalized = (value - good_threshold) / (bad_threshold - good_threshold)
    return _clamp(10.0 * (1.0 - normalized), 0.0, 10.0)


def _score_good_metric(value: Optional[float], bad_threshold: float, good_threshold: float) -> float:
    """Higher input is better — score 0 at <= bad, 10 at >= good, linear between."""
    if value is None:
        return 10.0
    if value >= good_threshold:
        return 10.0
    if value <= bad_threshold:
        return 0.0
    normalized = (value - bad_threshold) / (good_threshold - bad_threshold)
    return _clamp(10.0 * normalized, 0.0, 10.0)


def _xrun_score(xrun_count: Optional[int]) -> float:
    if xrun_count is None or xrun_count <= 0:
        return 10.0
    return 0.0


def _xrun_score_cap(xrun_count: Optional[int]) -> float:
    if xrun_count is None or xrun_count <= 0:
        return 10.0
    if xrun_count == 1:
        return 6.0
    if xrun_count <= 3:
        return 4.0
    return 2.0


def _describe_status(score: Optional[float], running: Optional[bool], is_available: bool) -> LatencyPressureStatus:
    if not is_available or score is None:
        return "waiting"
    if running is False:
        return "offline"
    if score <= 3:
        return "critical"
    if score <= 7:
        return "watch"
    return "stable"


def compute_latency_pressure(inputs: LatencyPressureInputs) -> LatencyPressureAnalysis:
    running = inputs.running if isinstance(inputs.running, bool) else None
    total_latency_ms = _finite(inputs.total_latency_ms)
    rtl_p95_ms = _finite(inputs.rtl_p95_ms)
    jitter_p95_ms = _finite(inputs.jitter_p95_ms)
    xrun_count = _finite(inputs.xrun_count)
    xrun_count_int = int(xrun_count) if xrun_count is not None else None
    callback_budget_ms = _finite(inputs.callback_budget_ms)
    current_callback_ms = _finite(inputs.current_callback_ms)
    headroom_percent = _finite(inputs.headroom_percent)

    if total_latency_ms is not None or rtl_p95_ms is not None:
        effective_latency_ms: Optional[float] = max(total_latency_ms or 0.0, rtl_p95_ms or 0.0)
    else:
        effective_latency_ms = None

    callback_ratio: Optional[float]
    if callback_budget_ms is not None and callback_budget_ms > 0 and current_callback_ms is not None:
        callback_ratio = current_callback_ms / callback_budget_ms
    else:
        callback_ratio = None

    has_any_metric = (
        effective_latency_ms is not None
        or jitter_p95_ms is not None
        or callback_ratio is not None
        or headroom_percent is not None
        or (xrun_count_int is not None and xrun_count_int > 0)
    )

    if not has_any_metric:
        return LatencyPressureAnalysis(
            is_available=False,
            score=None,
            pressure_percent=None,
            status=_describe_status(None, running, False),
        )

    if running is False:
        return LatencyPressureAnalysis(
            is_available=True,
            score=0,
            pressure_percent=100,
            status=_describe_status(0.0, False, True),
        )

    callback_score = _score_bad_metric(callback_ratio, 0.45, 1.0)
    latency_score = _score_bad_metric(effective_latency_ms, 4.5, 12.0)
    jitter_score = _score_bad_metric(jitter_p95_ms, 0.12, 0.8)
    headroom_score = _score_good_metric(headroom_percent, 10.0, 45.0)
    xrun_component = _xrun_score(xrun_count_int)

    weighted_score = (
        callback_score * 0.32
        + latency_score * 0.30
        + jitter_score * 0.18
        + headroom_score * 0.10
        + xrun_component * 0.10
    )

    capped_score = min(weighted_score, _xrun_score_cap(xrun_count_int))
    score = int(_clamp(round(capped_score), 0, 10))
    raw_pressure_percent = int(_clamp(round((1.0 - weighted_score / 10.0) * 100.0), 0, 100))
    capped_pressure_percent = int(_clamp(round((1.0 - score / 10.0) * 100.0), 0, 100))
    pressure_percent = max(raw_pressure_percent, capped_pressure_percent)
    status = _describe_status(float(score), True, True)

    return LatencyPressureAnalysis(
        is_available=True,
        score=score,
        pressure_percent=pressure_percent,
        status=status,
    )


__all__ = [
    "LatencyPressureInputs",
    "LatencyPressureAnalysis",
    "LatencyPressureStatus",
    "compute_latency_pressure",
]
