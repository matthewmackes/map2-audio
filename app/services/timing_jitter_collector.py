"""
Rolling collector for audio callback timing jitter samples.

Maintains a 60-second in-memory window and exposes percentile stats for API use.
"""

from __future__ import annotations

from collections import deque
from threading import Lock
import time
from typing import Deque, Dict, List, Optional


def _percentile(values: List[float], percentile: float) -> float:
    """Linear-interpolated percentile for a sorted numeric list."""
    if not values:
        return 0.0
    if len(values) == 1:
        return float(values[0])

    rank = (len(values) - 1) * max(0.0, min(100.0, percentile)) / 100.0
    lower = int(rank)
    upper = min(lower + 1, len(values) - 1)
    if lower == upper:
        return float(values[lower])
    fraction = rank - lower
    return float(values[lower] + (values[upper] - values[lower]) * fraction)


class TimingJitterCollector:
    """Thread-safe rolling jitter/deviation sample store."""

    def __init__(self, window_seconds: int = 60, max_samples: int = 6000) -> None:
        self.window_seconds = max(1, int(window_seconds))
        self._samples: Deque[Dict[str, float | int]] = deque(maxlen=max_samples)
        self._lock = Lock()

    def _trim_locked(self, now_monotonic: float) -> None:
        cutoff = now_monotonic - self.window_seconds
        while self._samples and float(self._samples[0]["ts_monotonic"]) < cutoff:
            self._samples.popleft()

    def record(
        self,
        *,
        delta_ms: float,
        deviation_ms: float,
        callback_count: int,
        xrun_count: int,
        rtl_ms: Optional[float] = None,
        running: bool = True,
    ) -> None:
        now_monotonic = time.monotonic()
        sample = {
            "ts_monotonic": now_monotonic,
            "timestamp_ms": int(time.time() * 1000),
            "delta_ms": max(0.0, float(delta_ms)),
            "deviation_ms": max(0.0, float(deviation_ms)),
            "callback_count": max(0, int(callback_count)),
            "xrun_count": max(0, int(xrun_count)),
            "running": 1 if running else 0,
        }
        if rtl_ms is not None:
            sample["rtl_ms"] = max(0.0, float(rtl_ms))

        with self._lock:
            self._samples.append(sample)
            self._trim_locked(now_monotonic)

    def recent_samples(self) -> List[Dict[str, float | int]]:
        now_monotonic = time.monotonic()
        with self._lock:
            self._trim_locked(now_monotonic)
            return list(self._samples)

    def get_stats(self) -> Dict[str, float | int | bool]:
        now_monotonic = time.monotonic()
        with self._lock:
            self._trim_locked(now_monotonic)
            samples = list(self._samples)

        if not samples:
            return {
                "p50_ms": 0.0,
                "p95_ms": 0.0,
                "p99_ms": 0.0,
                "max_ms": 0.0,
                "rtl_p95_ms": 0.0,
                "xrun_count": 0,
                "window_seconds": self.window_seconds,
                "sample_count": 0,
                "running": False,
            }

        deviations = sorted(float(sample.get("deviation_ms", 0.0)) for sample in samples)
        rtl_values = sorted(
            float(sample.get("rtl_ms", 0.0))
            for sample in samples
            if float(sample.get("rtl_ms", 0.0)) > 0.0
        )

        last_sample = samples[-1]
        return {
            "p50_ms": round(_percentile(deviations, 50), 4),
            "p95_ms": round(_percentile(deviations, 95), 4),
            "p99_ms": round(_percentile(deviations, 99), 4),
            "max_ms": round(max(deviations), 4),
            "rtl_p95_ms": round(_percentile(rtl_values, 95), 4) if rtl_values else 0.0,
            "xrun_count": int(last_sample.get("xrun_count", 0)),
            "window_seconds": self.window_seconds,
            "sample_count": len(samples),
            "running": bool(last_sample.get("running", 0)),
        }


_timing_jitter_collector = TimingJitterCollector()


def get_timing_jitter_collector() -> TimingJitterCollector:
    return _timing_jitter_collector
