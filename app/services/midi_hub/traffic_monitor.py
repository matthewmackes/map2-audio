"""Realtime MIDI traffic capture, snapshot, and export utilities."""

from __future__ import annotations

import csv
import json
import time
from dataclasses import dataclass
from pathlib import Path
from threading import RLock
from typing import Any, Dict, List, Optional

from app.services.midi_hub.ring_buffer import MidiRingBuffer


@dataclass
class MidiTrafficRecord:
    timestamp_ns: int
    source_port: str
    destination_port: str
    direction: str
    raw_hex: str
    decoded: Dict[str, Any]
    route_id: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp_ns": int(self.timestamp_ns),
            "source_port": self.source_port,
            "destination_port": self.destination_port,
            "direction": self.direction,
            "raw_hex": self.raw_hex,
            "decoded": dict(self.decoded),
            "route_id": self.route_id,
        }


class MidiTrafficMonitor:
    def __init__(self, capacity: int = 50_000, export_dir: Optional[Path] = None) -> None:
        self._buffer = MidiRingBuffer[MidiTrafficRecord](capacity, overwrite_on_full=True)
        self._lock = RLock()
        self._captured = 0
        self._export_dir = export_dir or Path("~/.map2/midi_hub_traffic_exports").expanduser()

    def record(self, record: MidiTrafficRecord) -> None:
        with self._lock:
            self._buffer.push(record)
            self._captured += 1

    def clear(self) -> None:
        with self._lock:
            self._buffer.clear()
            self._captured = 0

    def snapshot(
        self,
        *,
        limit: int = 500,
        source_port: Optional[str] = None,
        destination_port: Optional[str] = None,
        message_type: Optional[str] = None,
        direction: Optional[str] = None,
    ) -> Dict[str, Any]:
        with self._lock:
            items = [row.to_dict() for row in self._buffer.iter_snapshot()]
            captured_total = int(self._captured)

        if source_port:
            items = [row for row in items if str(row.get("source_port")) == str(source_port)]
        if destination_port:
            items = [row for row in items if str(row.get("destination_port")) == str(destination_port)]
        if message_type:
            items = [row for row in items if str((row.get("decoded") or {}).get("message_type")) == str(message_type)]
        if direction:
            items = [row for row in items if str(row.get("direction")) == str(direction)]

        if limit > 0:
            items = items[-int(limit):]

        return {
            "count": len(items),
            "captured_total": captured_total,
            "capacity": self._buffer.capacity,
            "records": items,
        }

    def stats(self) -> Dict[str, Any]:
        snapshot = self.snapshot(limit=-1)
        records = snapshot["records"]
        per_source: Dict[str, int] = {}
        per_destination: Dict[str, int] = {}
        per_type: Dict[str, int] = {}

        first_ts: Optional[int] = None
        last_ts: Optional[int] = None
        for row in records:
            source = str(row.get("source_port") or "")
            destination = str(row.get("destination_port") or "")
            msg_type = str((row.get("decoded") or {}).get("message_type") or "unknown")
            per_source[source] = per_source.get(source, 0) + 1
            per_destination[destination] = per_destination.get(destination, 0) + 1
            per_type[msg_type] = per_type.get(msg_type, 0) + 1
            ts = int(row.get("timestamp_ns") or 0)
            first_ts = ts if first_ts is None else min(first_ts, ts)
            last_ts = ts if last_ts is None else max(last_ts, ts)

        window_s = 0.0
        if first_ts is not None and last_ts is not None and last_ts >= first_ts:
            window_s = (last_ts - first_ts) / 1_000_000_000.0
        rate = (len(records) / window_s) if window_s > 0 else float(len(records))

        return {
            "count": len(records),
            "captured_total": snapshot["captured_total"],
            "capacity": snapshot["capacity"],
            "window_seconds": window_s,
            "messages_per_second": rate,
            "per_source": per_source,
            "per_destination": per_destination,
            "per_type": per_type,
        }

    def export(self, *, format: str = "json", limit: int = 5000) -> Dict[str, Any]:
        fmt = str(format or "json").strip().lower()
        snapshot = self.snapshot(limit=limit)
        records = snapshot["records"]

        now = int(time.time())
        self._export_dir.mkdir(parents=True, exist_ok=True)
        if fmt == "csv":
            path = self._export_dir / f"midi-traffic-{now}.csv"
            with path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(
                    handle,
                    fieldnames=[
                        "timestamp_ns",
                        "source_port",
                        "destination_port",
                        "direction",
                        "message_type",
                        "data1",
                        "data2",
                        "raw_hex",
                        "route_id",
                    ],
                )
                writer.writeheader()
                for row in records:
                    decoded = dict(row.get("decoded") or {})
                    writer.writerow(
                        {
                            "timestamp_ns": row.get("timestamp_ns"),
                            "source_port": row.get("source_port"),
                            "destination_port": row.get("destination_port"),
                            "direction": row.get("direction"),
                            "message_type": decoded.get("message_type"),
                            "data1": decoded.get("data1"),
                            "data2": decoded.get("data2"),
                            "raw_hex": row.get("raw_hex"),
                            "route_id": row.get("route_id"),
                        }
                    )
        else:
            path = self._export_dir / f"midi-traffic-{now}.json"
            path.write_text(
                json.dumps(
                    {
                        "generated_at": now,
                        "count": len(records),
                        "records": records,
                    },
                    indent=2,
                    sort_keys=True,
                ),
                encoding="utf-8",
            )

        return {
            "ok": True,
            "format": fmt,
            "path": str(path),
            "count": len(records),
        }


_midi_traffic_monitor_singleton: Optional[MidiTrafficMonitor] = None


def get_midi_traffic_monitor() -> MidiTrafficMonitor:
    global _midi_traffic_monitor_singleton
    if _midi_traffic_monitor_singleton is None:
        _midi_traffic_monitor_singleton = MidiTrafficMonitor()
    return _midi_traffic_monitor_singleton
