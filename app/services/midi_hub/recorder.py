"""MIDI performance recorder/playback with JSON persistence and SMF export."""

from __future__ import annotations

import asyncio
import json
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.services.midi_hub.hub import MidiHub, get_midi_hub
from app.services.midi_hub.ports import MidiMessage


def _default_recordings_dir() -> Path:
    return Path("~/.map2/midi_hub_recordings").expanduser()


def _varlen(value: int) -> bytes:
    # SMF variable-length quantity.
    buffer = value & 0x7F
    value >>= 7
    while value:
        buffer <<= 8
        buffer |= ((value & 0x7F) | 0x80)
        value >>= 7
    out = bytearray()
    while True:
        out.append(buffer & 0xFF)
        if buffer & 0x80:
            buffer >>= 8
        else:
            break
    return bytes(out)


@dataclass
class MidiRecordingEvent:
    timestamp_ns: int
    source_port: str
    destination_port: Optional[str]
    raw_hex: str
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp_ns": int(self.timestamp_ns),
            "source_port": self.source_port,
            "destination_port": self.destination_port,
            "raw_hex": self.raw_hex,
            "metadata": dict(self.metadata),
        }


@dataclass
class MidiRecordingSession:
    session_id: str
    name: str
    created_at: float
    started_at: Optional[float] = None
    stopped_at: Optional[float] = None
    loop_enabled: bool = False
    events: List[MidiRecordingEvent] = field(default_factory=list)

    def to_dict(self, *, include_events: bool = False) -> Dict[str, Any]:
        payload = {
            "session_id": self.session_id,
            "name": self.name,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "stopped_at": self.stopped_at,
            "loop_enabled": self.loop_enabled,
            "event_count": len(self.events),
        }
        if include_events:
            payload["events"] = [row.to_dict() for row in self.events]
        return payload


class MidiRecorder:
    def __init__(self, hub: Optional[MidiHub] = None, *, storage_dir: Optional[Path] = None) -> None:
        self._hub = hub or get_midi_hub()
        self._storage_dir = storage_dir or _default_recordings_dir()
        self._sessions: Dict[str, MidiRecordingSession] = {}
        self._active_session_id: Optional[str] = None
        self._subscriber_id = "midi_hub_recorder"
        self._playback_tasks: Dict[str, asyncio.Task] = {}
        self._load()

    def list_sessions(self) -> List[Dict[str, Any]]:
        return [row.to_dict(include_events=False) for row in self._sessions.values()]

    def get_session(self, session_id: str, *, include_events: bool = False) -> Optional[Dict[str, Any]]:
        row = self._sessions.get(session_id)
        return row.to_dict(include_events=include_events) if row else None

    def start_recording(self, *, session_id: str, name: Optional[str] = None) -> Dict[str, Any]:
        if self._active_session_id and self._active_session_id != session_id:
            raise ValueError("another recording session is already active")
        now = time.time()
        row = self._sessions.get(session_id)
        if row is None:
            row = MidiRecordingSession(session_id=session_id, name=name or session_id, created_at=now)
            self._sessions[session_id] = row
        row.name = name or row.name
        row.started_at = now
        row.stopped_at = None
        row.events = []
        self._active_session_id = session_id
        self._hub.subscribe(self._subscriber_id, self._on_message)
        return row.to_dict(include_events=False)

    def stop_recording(self) -> Optional[Dict[str, Any]]:
        if not self._active_session_id:
            return None
        row = self._sessions.get(self._active_session_id)
        self._active_session_id = None
        self._hub.unsubscribe(self._subscriber_id)
        if row is None:
            return None
        row.stopped_at = time.time()
        self._persist_session(row)
        return row.to_dict(include_events=False)

    def delete_session(self, session_id: str) -> bool:
        removed = self._sessions.pop(session_id, None) is not None
        task = self._playback_tasks.pop(session_id, None)
        if task is not None:
            task.cancel()
        if removed:
            path = self._storage_dir / f"{session_id}.json"
            if path.exists():
                path.unlink()
        return removed

    async def playback(
        self,
        session_id: str,
        *,
        destination_override: Optional[str] = None,
        loop: bool = False,
        speed: float = 1.0,
    ) -> Dict[str, Any]:
        row = self._sessions.get(session_id)
        if row is None:
            raise ValueError("session not found")
        if not row.events:
            return {"ok": False, "reason": "empty"}
        speed = max(0.1, min(8.0, float(speed)))
        self.stop_playback(session_id)
        row.loop_enabled = bool(loop)
        task = asyncio.create_task(
            self._playback_task(
                row=row,
                destination_override=destination_override,
                loop=loop,
                speed=speed,
            ),
            name=f"midi_recorder_playback:{session_id}",
        )
        self._playback_tasks[session_id] = task
        return {"ok": True, "session_id": session_id, "loop": loop, "speed": speed}

    def stop_playback(self, session_id: str) -> bool:
        task = self._playback_tasks.pop(session_id, None)
        if task is None:
            return False
        task.cancel()
        return True

    def export_smf(
        self,
        session_id: str,
        *,
        export_path: Optional[str] = None,
        bpm: float = 120.0,
        ticks_per_quarter: int = 480,
    ) -> Dict[str, Any]:
        row = self._sessions.get(session_id)
        if row is None:
            raise ValueError("session not found")
        if not row.events:
            raise ValueError("session has no events")

        target = Path(export_path).expanduser() if export_path else (
            self._storage_dir / f"{session_id}.mid"
        )
        target.parent.mkdir(parents=True, exist_ok=True)
        midi = self._build_smf(row.events, bpm=bpm, ticks_per_quarter=ticks_per_quarter)
        target.write_bytes(midi)
        return {"ok": True, "session_id": session_id, "path": str(target), "event_count": len(row.events)}

    async def _playback_task(
        self,
        *,
        row: MidiRecordingSession,
        destination_override: Optional[str],
        loop: bool,
        speed: float,
    ) -> None:
        while True:
            events = sorted(row.events, key=lambda event: event.timestamp_ns)
            base_ns = int(events[0].timestamp_ns)
            previous_ns = base_ns
            for event in events:
                target_ns = int(event.timestamp_ns)
                delta_s = max(0.0, (target_ns - previous_ns) / 1_000_000_000.0) / speed
                previous_ns = target_ns
                await asyncio.sleep(delta_s)
                try:
                    payload = bytes.fromhex(event.raw_hex)
                except Exception:
                    continue
                destination_port = destination_override or event.destination_port or event.source_port
                self._hub.send(
                    source_port=f"midi_recorder:{row.session_id}",
                    destination_port=destination_port,
                    data=payload,
                    metadata={"recording_session_id": row.session_id},
                )
            if not loop:
                break

    def _on_message(self, message: MidiMessage) -> None:
        session_id = self._active_session_id
        if not session_id:
            return
        row = self._sessions.get(session_id)
        if row is None:
            return
        row.events.append(
            MidiRecordingEvent(
                timestamp_ns=message.timestamp_ns,
                source_port=message.source_port,
                destination_port=message.destination_port,
                raw_hex=bytes(message.data).hex(),
                metadata=dict(message.metadata or {}),
            )
        )

    def _build_smf(self, events: List[MidiRecordingEvent], *, bpm: float, ticks_per_quarter: int) -> bytes:
        tempo = int(60_000_000 / max(1.0, bpm))
        ordered = sorted(events, key=lambda event: event.timestamp_ns)
        track = bytearray()

        # Tempo meta event at delta 0.
        track.extend(_varlen(0))
        track.extend(b"\xFF\x51\x03")
        track.extend(tempo.to_bytes(3, "big", signed=False))

        start_ns = int(ordered[0].timestamp_ns)
        previous_ticks = 0
        for event in ordered:
            try:
                data = bytes.fromhex(event.raw_hex)
            except Exception:
                continue
            elapsed_s = max(0.0, (int(event.timestamp_ns) - start_ns) / 1_000_000_000.0)
            ticks = int(round(elapsed_s * (ticks_per_quarter * bpm / 60.0)))
            delta = max(0, ticks - previous_ticks)
            previous_ticks = ticks
            track.extend(_varlen(delta))
            if data and data[0] == 0xF0:
                track.extend(b"\xF0")
                track.extend(_varlen(max(0, len(data) - 1)))
                track.extend(data[1:])
            else:
                track.extend(data)

        # End of track.
        track.extend(_varlen(0))
        track.extend(b"\xFF\x2F\x00")

        header = bytearray()
        header.extend(b"MThd")
        header.extend((6).to_bytes(4, "big"))
        header.extend((0).to_bytes(2, "big"))  # Format 0
        header.extend((1).to_bytes(2, "big"))  # One track
        header.extend(int(ticks_per_quarter).to_bytes(2, "big"))

        chunk = bytearray()
        chunk.extend(b"MTrk")
        chunk.extend(len(track).to_bytes(4, "big"))
        chunk.extend(track)

        return bytes(header + chunk)

    def _load(self) -> None:
        self._storage_dir.mkdir(parents=True, exist_ok=True)
        for path in self._storage_dir.glob("*.json"):
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                continue
            if not isinstance(payload, dict):
                continue
            session_id = str(payload.get("session_id") or path.stem)
            events = []
            for raw in payload.get("events") or []:
                if not isinstance(raw, dict):
                    continue
                events.append(
                    MidiRecordingEvent(
                        timestamp_ns=int(raw.get("timestamp_ns") or 0),
                        source_port=str(raw.get("source_port") or ""),
                        destination_port=raw.get("destination_port"),
                        raw_hex=str(raw.get("raw_hex") or ""),
                        metadata=dict(raw.get("metadata") or {}),
                    )
                )
            self._sessions[session_id] = MidiRecordingSession(
                session_id=session_id,
                name=str(payload.get("name") or session_id),
                created_at=float(payload.get("created_at") or time.time()),
                started_at=payload.get("started_at"),
                stopped_at=payload.get("stopped_at"),
                loop_enabled=bool(payload.get("loop_enabled", False)),
                events=events,
            )

    def _persist_session(self, session: MidiRecordingSession) -> None:
        self._storage_dir.mkdir(parents=True, exist_ok=True)
        path = self._storage_dir / f"{session.session_id}.json"
        path.write_text(
            json.dumps(session.to_dict(include_events=True), indent=2, sort_keys=True),
            encoding="utf-8",
        )


_midi_recorder_singleton: Optional[MidiRecorder] = None
_midi_recorder_singleton_lock = threading.Lock()


def get_midi_recorder() -> MidiRecorder:
    global _midi_recorder_singleton
    if _midi_recorder_singleton is None:
        with _midi_recorder_singleton_lock:
            if _midi_recorder_singleton is None:
                _midi_recorder_singleton = MidiRecorder()
    return _midi_recorder_singleton
