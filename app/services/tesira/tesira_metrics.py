"""
In-memory metering history for Tesira blocks.

Stores bounded ring buffers per (device_id, instance_tag) for low-overhead
history and peak reads.
"""

from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import DefaultDict, Deque, Dict, List, Tuple


@dataclass
class MeterReading:
    timestamp: str
    levels_dbu: List[float]
    peak_dbu: float

    def to_dict(self) -> Dict[str, object]:
        return asdict(self)


class TesiraMetricsStore:
    def __init__(self, maxlen: int = 300) -> None:
        self._maxlen = maxlen
        self._store: DefaultDict[Tuple[str, str], Deque[MeterReading]] = defaultdict(
            lambda: deque(maxlen=self._maxlen)
        )

    def push(self, device_id: str, instance_tag: str, levels_dbu: List[float]) -> MeterReading:
        clean_levels = [float(v) for v in levels_dbu]
        reading = MeterReading(
            timestamp=datetime.now(timezone.utc).isoformat(),
            levels_dbu=clean_levels,
            peak_dbu=max(clean_levels) if clean_levels else float("-inf"),
        )
        self._store[(device_id, instance_tag)].append(reading)
        return reading

    def get_history(self, device_id: str, instance_tag: str, limit: int = 300) -> List[MeterReading]:
        if limit < 1:
            return []
        readings = list(self._store.get((device_id, instance_tag), ()))
        if not readings:
            return []
        return readings[-limit:]

    def get_peak(self, device_id: str, instance_tag: str) -> float | None:
        readings = self._store.get((device_id, instance_tag))
        if not readings:
            return None
        peak = max((r.peak_dbu for r in readings), default=float("-inf"))
        if peak == float("-inf"):
            return None
        return peak

