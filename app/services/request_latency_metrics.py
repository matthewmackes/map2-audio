"""
Request latency aggregation for API route groups.

This collector is intentionally lightweight: fixed-size in-memory deques
with percentile snapshots for operational diagnostics.
"""

from __future__ import annotations

import threading
from collections import deque
from statistics import mean
from typing import Deque, Dict, List


def _percentile(sorted_values: List[float], p: int) -> float:
    """Nearest-rank percentile for a sorted list."""
    if not sorted_values:
        return 0.0
    index = max(0, min(len(sorted_values) - 1, int((p / 100.0) * len(sorted_values)) - 1))
    return float(sorted_values[index])


def classify_route_group(path: str) -> str:
    if path.startswith("/api/health") or path.startswith("/api/ready") or path.startswith("/api/live") or path.startswith("/api/startup"):
        return "health"
    if path.startswith("/api/chains"):
        return "chains"
    if path.startswith("/api/plugins"):
        return "plugins"
    if path.startswith("/api/audio") or path.startswith("/api/engine"):
        return "audio"
    if path.startswith("/api/mpx1"):
        return "mpx1"
    return "other"


class RequestLatencyCollector:
    """Track request durations grouped by route family."""

    def __init__(self, max_samples_per_group: int = 2000) -> None:
        self._lock = threading.Lock()
        self._max_samples_per_group = max_samples_per_group
        self._groups: Dict[str, Deque[float]] = {
            "health": deque(maxlen=max_samples_per_group),
            "chains": deque(maxlen=max_samples_per_group),
            "plugins": deque(maxlen=max_samples_per_group),
            "audio": deque(maxlen=max_samples_per_group),
            "mpx1": deque(maxlen=max_samples_per_group),
            "other": deque(maxlen=max_samples_per_group),
        }

    def record(self, path: str, duration_ms: float) -> None:
        if not path.startswith("/api/"):
            return
        group = classify_route_group(path)
        with self._lock:
            self._groups[group].append(float(duration_ms))

    def snapshot(self) -> Dict[str, Dict[str, float | int]]:
        output: Dict[str, Dict[str, float | int]] = {}
        with self._lock:
            for group, samples in self._groups.items():
                values = sorted(samples)
                if not values:
                    output[group] = {
                        "count": 0,
                        "p50_ms": 0.0,
                        "p95_ms": 0.0,
                        "p99_ms": 0.0,
                        "mean_ms": 0.0,
                        "max_ms": 0.0,
                    }
                    continue

                output[group] = {
                    "count": len(values),
                    "p50_ms": round(_percentile(values, 50), 3),
                    "p95_ms": round(_percentile(values, 95), 3),
                    "p99_ms": round(_percentile(values, 99), 3),
                    "mean_ms": round(float(mean(values)), 3),
                    "max_ms": round(float(values[-1]), 3),
                }
        return output


_collector = RequestLatencyCollector()


def get_request_latency_collector() -> RequestLatencyCollector:
    return _collector
