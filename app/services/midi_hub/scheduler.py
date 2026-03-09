"""Timed MIDI message scheduling queue service."""

from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.services.midi_hub.hub import MidiHub, get_midi_hub


def _default_scheduler_path() -> Path:
    return Path("~/.map2/midi_hub_scheduler.json").expanduser()


@dataclass
class ScheduledMidiMessage:
    schedule_id: str
    destination_port: str
    message_hex: str
    run_at_ns: int
    created_at: float
    metadata: Dict[str, Any] = field(default_factory=dict)
    status: str = "scheduled"  # scheduled|sent|cancelled|failed
    sent_at: Optional[float] = None
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "schedule_id": self.schedule_id,
            "destination_port": self.destination_port,
            "message_hex": self.message_hex,
            "run_at_ns": int(self.run_at_ns),
            "created_at": self.created_at,
            "metadata": dict(self.metadata),
            "status": self.status,
            "sent_at": self.sent_at,
            "error": self.error,
        }


class MidiMessageScheduler:
    def __init__(self, hub: Optional[MidiHub] = None, *, storage_path: Optional[Path] = None) -> None:
        self._hub = hub or get_midi_hub()
        self._storage_path = storage_path or _default_scheduler_path()
        self._entries: Dict[str, ScheduledMidiMessage] = {}
        self._tasks: Dict[str, asyncio.Task] = {}
        self._load()

    def list(self, *, include_finished: bool = True) -> List[Dict[str, Any]]:
        rows = []
        for item in self._entries.values():
            if not include_finished and item.status in {"sent", "cancelled", "failed"}:
                continue
            rows.append(item.to_dict())
        return sorted(rows, key=lambda row: int(row["run_at_ns"]))

    def get(self, schedule_id: str) -> Optional[Dict[str, Any]]:
        row = self._entries.get(schedule_id)
        return row.to_dict() if row else None

    async def schedule(
        self,
        *,
        schedule_id: str,
        destination_port: str,
        message: bytes,
        delay_ms: Optional[int] = None,
        run_at_ns: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        if run_at_ns is None:
            delay_ns = int(max(0, int(delay_ms or 0)) * 1_000_000)
            run_at_ns = time.time_ns() + delay_ns

        row = ScheduledMidiMessage(
            schedule_id=schedule_id,
            destination_port=destination_port,
            message_hex=bytes(message).hex(),
            run_at_ns=int(run_at_ns),
            created_at=time.time(),
            metadata=dict(metadata or {}),
        )
        self._entries[schedule_id] = row
        self._cancel_task(schedule_id)
        self._tasks[schedule_id] = asyncio.create_task(self._dispatch(row), name=f"midi_schedule:{schedule_id}")
        self._persist()
        return row.to_dict()

    async def update(
        self,
        schedule_id: str,
        *,
        destination_port: Optional[str] = None,
        message: Optional[bytes] = None,
        delay_ms: Optional[int] = None,
        run_at_ns: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        row = self._entries.get(schedule_id)
        if row is None:
            return None
        if row.status in {"sent", "cancelled"}:
            return row.to_dict()
        if destination_port is not None:
            row.destination_port = destination_port
        if message is not None:
            row.message_hex = bytes(message).hex()
        if run_at_ns is not None:
            row.run_at_ns = int(run_at_ns)
        elif delay_ms is not None:
            row.run_at_ns = time.time_ns() + int(max(0, delay_ms) * 1_000_000)
        if metadata is not None:
            row.metadata = dict(metadata)
        row.status = "scheduled"
        row.error = None
        row.sent_at = None
        self._cancel_task(schedule_id)
        self._tasks[schedule_id] = asyncio.create_task(self._dispatch(row), name=f"midi_schedule:{schedule_id}")
        self._persist()
        return row.to_dict()

    def cancel(self, schedule_id: str) -> bool:
        row = self._entries.get(schedule_id)
        if row is None:
            return False
        row.status = "cancelled"
        row.error = None
        row.sent_at = time.time()
        self._cancel_task(schedule_id)
        self._persist()
        return True

    def clear_finished(self) -> Dict[str, Any]:
        remove_ids = [
            schedule_id
            for schedule_id, row in self._entries.items()
            if row.status in {"sent", "cancelled", "failed"}
        ]
        for schedule_id in remove_ids:
            self._entries.pop(schedule_id, None)
            self._cancel_task(schedule_id)
        self._persist()
        return {"removed": len(remove_ids)}

    async def _dispatch(self, row: ScheduledMidiMessage) -> None:
        wait_ns = int(row.run_at_ns) - time.time_ns()
        if wait_ns > 0:
            await asyncio.sleep(wait_ns / 1_000_000_000.0)
        if row.status == "cancelled":
            return
        try:
            payload = bytes.fromhex(row.message_hex)
            ok = self._hub.send(
                source_port=f"midi_scheduler:{row.schedule_id}",
                destination_port=row.destination_port,
                data=payload,
                metadata={
                    "schedule_id": row.schedule_id,
                    **dict(row.metadata or {}),
                },
            )
            if ok:
                row.status = "sent"
                row.error = None
            else:
                row.status = "failed"
                row.error = "hub_send_failed"
            row.sent_at = time.time()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            row.status = "failed"
            row.sent_at = time.time()
            row.error = str(exc)
        finally:
            self._persist()
            self._tasks.pop(row.schedule_id, None)

    def _cancel_task(self, schedule_id: str) -> None:
        task = self._tasks.pop(schedule_id, None)
        if task is not None:
            task.cancel()

    def _load(self) -> None:
        if not self._storage_path.exists():
            return
        try:
            payload = json.loads(self._storage_path.read_text(encoding="utf-8"))
        except Exception:
            return
        entries = payload.get("entries") or {}
        loaded: Dict[str, ScheduledMidiMessage] = {}
        now_ns = time.time_ns()
        for schedule_id, raw in entries.items():
            if not isinstance(raw, dict):
                continue
            row = ScheduledMidiMessage(
                schedule_id=str(raw.get("schedule_id") or schedule_id),
                destination_port=str(raw.get("destination_port") or ""),
                message_hex=str(raw.get("message_hex") or ""),
                run_at_ns=int(raw.get("run_at_ns") or now_ns),
                created_at=float(raw.get("created_at") or time.time()),
                metadata=dict(raw.get("metadata") or {}),
                status=str(raw.get("status") or "scheduled"),
                sent_at=raw.get("sent_at"),
                error=raw.get("error"),
            )
            loaded[row.schedule_id] = row
        self._entries = loaded

    def _persist(self) -> None:
        payload = {
            "entries": {schedule_id: row.to_dict() for schedule_id, row in self._entries.items()},
            "updated_at": time.time(),
        }
        self._storage_path.parent.mkdir(parents=True, exist_ok=True)
        temp = self._storage_path.with_suffix(".tmp")
        temp.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
        temp.replace(self._storage_path)


_midi_scheduler_singleton: Optional[MidiMessageScheduler] = None


def get_midi_scheduler() -> MidiMessageScheduler:
    global _midi_scheduler_singleton
    if _midi_scheduler_singleton is None:
        _midi_scheduler_singleton = MidiMessageScheduler()
    return _midi_scheduler_singleton
