"""Event list, timecode, RTC scheduling, learn mode, and MSC support."""

from __future__ import annotations

import asyncio
import json
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from app.services.midi_hub.hub import MidiHub, get_midi_hub
from app.services.midi_hub.macros import MidiMacroService, get_midi_macro_service
from app.services.midi_hub.preset_service import MidiHubPresetService, get_midi_hub_preset_service


def _default_storage_path() -> Path:
    return Path("~/.map2/midi_hub_event_lists.json").expanduser()


def _parse_timecode(value: str, fps: int) -> int:
    parts = [segment.strip() for segment in str(value or "").split(":")]
    if len(parts) != 4:
      raise ValueError("timecode must use HH:MM:SS:FF")
    hours, minutes, seconds, frames = [int(part) for part in parts]
    total_seconds = (hours * 3600) + (minutes * 60) + seconds
    return total_seconds * fps + frames


def _format_timecode(frame_index: int, fps: int) -> str:
    safe_fps = max(1, int(fps or 30))
    total_frames = max(0, int(frame_index))
    total_seconds, frames = divmod(total_frames, safe_fps)
    hours, rem = divmod(total_seconds, 3600)
    minutes, seconds = divmod(rem, 60)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}:{frames:02d}"


def _resolve_timezone(name: Optional[str]) -> ZoneInfo:
    try:
        return ZoneInfo(name or "UTC")
    except Exception:
        return ZoneInfo("UTC")


def _utc_now() -> datetime:
    return datetime.now(tz=ZoneInfo("UTC"))


@dataclass
class EventListEvent:
    event_id: str
    order: int
    time_address: str
    action_type: str
    label: str
    payload: Dict[str, Any] = field(default_factory=dict)
    enabled: bool = True
    last_fired_at: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "event_id": self.event_id,
            "order": self.order,
            "time_address": self.time_address,
            "action_type": self.action_type,
            "label": self.label,
            "payload": dict(self.payload),
            "enabled": self.enabled,
            "last_fired_at": self.last_fired_at,
        }


@dataclass
class EventListDefinition:
    event_list_id: str
    name: str
    list_type: str
    source_id: str
    internal_clock_enabled: bool
    first_time: str
    last_time: str
    fps: int
    timezone: str
    enabled: bool = True
    running: bool = False
    current_frame: int = 0
    current_datetime: Optional[str] = None
    clock_source: str = "internal"
    learn_mode_enabled: bool = False
    learn_action_type: str = "RecallPreset"
    learn_label: str = "Learned cue"
    learn_payload: Dict[str, Any] = field(default_factory=dict)
    fired_event_ids: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "event_list_id": self.event_list_id,
            "name": self.name,
            "list_type": self.list_type,
            "source_id": self.source_id,
            "internal_clock_enabled": self.internal_clock_enabled,
            "first_time": self.first_time,
            "last_time": self.last_time,
            "fps": self.fps,
            "timezone": self.timezone,
            "enabled": self.enabled,
            "running": self.running,
            "current_timecode": _format_timecode(self.current_frame, self.fps),
            "current_frame": self.current_frame,
            "current_datetime": self.current_datetime,
            "clock_source": self.clock_source,
            "learn_mode_enabled": self.learn_mode_enabled,
            "learn_action_type": self.learn_action_type,
            "learn_label": self.learn_label,
            "learn_payload": dict(self.learn_payload),
            "fired_event_ids": list(self.fired_event_ids),
        }


class MidiHubEventListService:
    def __init__(
        self,
        *,
        hub: Optional[MidiHub] = None,
        preset_service: Optional[MidiHubPresetService] = None,
        macro_service: Optional[MidiMacroService] = None,
        storage_path: Optional[Path] = None,
    ) -> None:
        self._hub = hub or get_midi_hub()
        self._preset_service = preset_service or get_midi_hub_preset_service()
        self._macro_service = macro_service or get_midi_macro_service()
        self._storage_path = storage_path or _default_storage_path()
        self._event_lists: Dict[str, EventListDefinition] = {}
        self._events: Dict[str, Dict[str, EventListEvent]] = {}
        self._tasks: Dict[str, asyncio.Task[None]] = {}
        self._lock = threading.RLock()
        self._load()

    def list_event_lists(self) -> List[Dict[str, Any]]:
        with self._lock:
            rows = [self._serialize_event_list(row) for row in self._event_lists.values()]
        return sorted(rows, key=lambda row: row["name"].lower())

    def get_event_list(self, event_list_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            row = self._event_lists.get(event_list_id)
            return self._serialize_event_list(row) if row else None

    def upsert_event_list(
        self,
        *,
        event_list_id: str,
        name: str,
        list_type: str,
        source_id: str,
        internal_clock_enabled: bool,
        first_time: str,
        last_time: str,
        fps: int,
        timezone: str,
        enabled: bool = True,
    ) -> Dict[str, Any]:
        normalized_type = "rtc" if str(list_type).lower() == "rtc" else "mtc"
        with self._lock:
            existing = self._event_lists.get(event_list_id)
            row = EventListDefinition(
                event_list_id=event_list_id,
                name=name,
                list_type=normalized_type,
                source_id=source_id,
                internal_clock_enabled=bool(internal_clock_enabled),
                first_time=first_time,
                last_time=last_time,
                fps=int(fps or 30),
                timezone=timezone or "UTC",
                enabled=bool(enabled),
                running=existing.running if existing else False,
                current_frame=existing.current_frame if existing else _parse_timecode(first_time, int(fps or 30)) if normalized_type == "mtc" else 0,
                current_datetime=existing.current_datetime if existing else None,
                clock_source=existing.clock_source if existing else ("internal" if internal_clock_enabled else "external"),
                learn_mode_enabled=existing.learn_mode_enabled if existing else False,
                learn_action_type=existing.learn_action_type if existing else "RecallPreset",
                learn_label=existing.learn_label if existing else "Learned cue",
                learn_payload=dict(existing.learn_payload) if existing else {},
                fired_event_ids=list(existing.fired_event_ids) if existing else [],
            )
            self._event_lists[event_list_id] = row
            self._events.setdefault(event_list_id, {})
        self._persist()
        return self._serialize_event_list(row)

    def delete_event_list(self, event_list_id: str) -> bool:
        with self._lock:
            removed = self._event_lists.pop(event_list_id, None)
            self._events.pop(event_list_id, None)
        self._cancel_task(event_list_id)
        if removed is None:
            return False
        self._persist()
        return True

    def list_events(self, event_list_id: str) -> List[Dict[str, Any]]:
        with self._lock:
            rows = list(self._events.get(event_list_id, {}).values())
        return [row.to_dict() for row in sorted(rows, key=lambda item: (item.order, item.time_address, item.event_id))]

    def upsert_event(
        self,
        *,
        event_list_id: str,
        event_id: str,
        order: int,
        time_address: str,
        action_type: str,
        label: str,
        payload: Optional[Dict[str, Any]] = None,
        enabled: bool = True,
    ) -> Dict[str, Any]:
        with self._lock:
            if event_list_id not in self._event_lists:
                raise ValueError("event list not found")
            row = EventListEvent(
                event_id=event_id,
                order=int(order),
                time_address=time_address,
                action_type=action_type,
                label=label,
                payload=dict(payload or {}),
                enabled=bool(enabled),
                last_fired_at=self._events.get(event_list_id, {}).get(event_id, EventListEvent("", 0, "", "", "")).last_fired_at
                if self._events.get(event_list_id, {}).get(event_id)
                else None,
            )
            self._events.setdefault(event_list_id, {})[event_id] = row
        self._persist()
        return row.to_dict()

    def delete_event(self, event_list_id: str, event_id: str) -> bool:
        with self._lock:
            removed = self._events.get(event_list_id, {}).pop(event_id, None)
        if removed is None:
            return False
        self._persist()
        return True

    async def start_event_list(self, event_list_id: str) -> Dict[str, Any]:
        with self._lock:
            row = self._event_lists.get(event_list_id)
            if row is None:
                raise ValueError("event list not found")
            row.running = True
            row.clock_source = "internal" if row.internal_clock_enabled else "external"
            row.fired_event_ids = []
            if row.list_type == "mtc":
                row.current_frame = _parse_timecode(row.first_time, row.fps)
            else:
                tz = _resolve_timezone(row.timezone)
                row.current_datetime = datetime.now(tz=tz).isoformat()
        self._cancel_task(event_list_id)
        self._tasks[event_list_id] = asyncio.create_task(self._run_event_list(event_list_id), name=f"event_list:{event_list_id}")
        self._persist()
        return self.get_event_list(event_list_id) or {}

    async def stop_event_list(self, event_list_id: str) -> Dict[str, Any]:
        with self._lock:
            row = self._event_lists.get(event_list_id)
            if row is None:
                raise ValueError("event list not found")
            row.running = False
        self._cancel_task(event_list_id)
        self._persist()
        return self.get_event_list(event_list_id) or {}

    async def set_learn_mode(
        self,
        event_list_id: str,
        *,
        enabled: bool,
        action_type: str = "RecallPreset",
        label: str = "Learned cue",
        payload: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        with self._lock:
            row = self._event_lists.get(event_list_id)
            if row is None:
                raise ValueError("event list not found")
            row.learn_mode_enabled = bool(enabled)
            row.learn_action_type = action_type
            row.learn_label = label
            row.learn_payload = dict(payload or {})
        self._persist()
        return self.get_event_list(event_list_id) or {}

    def capture_learn_event(self, event_list_id: str) -> Dict[str, Any]:
        with self._lock:
            row = self._event_lists.get(event_list_id)
            if row is None:
                raise ValueError("event list not found")
            if not row.learn_mode_enabled:
                raise ValueError("learn mode not enabled")
            next_order = len(self._events.get(event_list_id, {})) + 1
            if row.list_type == "mtc":
                time_address = _format_timecode(row.current_frame, row.fps)
            else:
                tz = _resolve_timezone(row.timezone)
                current_dt = row.current_datetime or datetime.now(tz=tz).isoformat()
                time_address = current_dt
            event_id = f"{event_list_id}-learn-{next_order}"
        created = self.upsert_event(
            event_list_id=event_list_id,
            event_id=event_id,
            order=next_order,
            time_address=time_address,
            action_type=row.learn_action_type,
            label=row.learn_label,
            payload=row.learn_payload,
            enabled=True,
        )
        return created

    def get_event_list_status(self, event_list_id: str) -> Dict[str, Any]:
        with self._lock:
            row = self._event_lists.get(event_list_id)
            if row is None:
                raise ValueError("event list not found")
            return self._serialize_event_list(row)

    def build_msc_message(
        self,
        *,
        device_id: int,
        command_format: int,
        command: str,
        cue_number: str,
        list_number: Optional[str] = None,
    ) -> Dict[str, Any]:
        command_map = {
            "go": 0x01,
            "stop": 0x02,
            "resume": 0x03,
            "timed_go": 0x04,
            "set": 0x06,
            "fire": 0x07,
            "all_off": 0x08,
        }
        if command not in command_map:
            raise ValueError("unsupported_msc_command")

        ascii_payload = cue_number
        if list_number:
            ascii_payload = f"{list_number}\x00{cue_number}"
        data = bytes([
            0xF0,
            0x7F,
            int(device_id) & 0x7F,
            0x02,
            int(command_format) & 0x7F,
            command_map[command] & 0x7F,
        ]) + ascii_payload.encode("ascii", errors="ignore") + bytes([0xF7])
        return {
            "device_id": int(device_id) & 0x7F,
            "command_format": int(command_format) & 0x7F,
            "command": command,
            "cue_number": cue_number,
            "list_number": list_number,
            "message_hex": data.hex(),
            "message": list(data),
        }

    async def send_msc_message(
        self,
        *,
        destination_port: str,
        device_id: int,
        command_format: int,
        command: str,
        cue_number: str,
        list_number: Optional[str] = None,
    ) -> Dict[str, Any]:
        built = self.build_msc_message(
            device_id=device_id,
            command_format=command_format,
            command=command,
            cue_number=cue_number,
            list_number=list_number,
        )
        ok = self._hub.send(
            source_port="midi_hub_event_lists",
            destination_port=destination_port,
            data=bytes(built["message"]),
            metadata={"msc": True, "command": command, "cue_number": cue_number, "list_number": list_number},
        )
        return {"ok": ok, **built}

    async def _run_event_list(self, event_list_id: str) -> None:
        try:
            while True:
                with self._lock:
                    row = self._event_lists.get(event_list_id)
                    if row is None or not row.running:
                        return
                    snapshot = self._serialize_event_list(row)
                if snapshot["list_type"] == "mtc":
                    await self._tick_mtc(event_list_id)
                    await asyncio.sleep(1.0 / max(1, snapshot["fps"]))
                else:
                    await self._tick_rtc(event_list_id)
                    await asyncio.sleep(0.2)
        except asyncio.CancelledError:
            raise

    async def _tick_mtc(self, event_list_id: str) -> None:
        with self._lock:
            row = self._event_lists.get(event_list_id)
            if row is None:
                return
            last_frame = _parse_timecode(row.last_time, row.fps)
            current_frame = row.current_frame
            pending = [
                event
                for event in self._events.get(event_list_id, {}).values()
                if event.enabled and event.event_id not in row.fired_event_ids and _parse_timecode(event.time_address, row.fps) <= current_frame
            ]
        for event in sorted(pending, key=lambda item: item.order):
            await self._fire_event(event_list_id, event)
        with self._lock:
            row = self._event_lists.get(event_list_id)
            if row is None:
                return
            row.current_frame += 1
            if row.current_frame > last_frame:
                row.current_frame = _parse_timecode(row.first_time, row.fps)
                row.fired_event_ids = []
        self._persist()

    async def _tick_rtc(self, event_list_id: str) -> None:
        with self._lock:
            row = self._event_lists.get(event_list_id)
            if row is None:
                return
            tz = _resolve_timezone(row.timezone)
            now_dt = datetime.now(tz=tz)
            row.current_datetime = now_dt.isoformat()
            pending = [
                event
                for event in self._events.get(event_list_id, {}).values()
                if event.enabled and self._is_rtc_due(event, now_dt)
            ]
        for event in sorted(pending, key=lambda item: item.order):
            await self._fire_event(event_list_id, event)
        self._persist()

    def _is_rtc_due(self, event: EventListEvent, now_dt: datetime) -> bool:
        recurrence = str(event.payload.get("recurrence") or "").strip().lower()
        last_fired_at = event.last_fired_at or 0.0
        if recurrence.startswith("weekly:"):
            try:
                _, weekday_token, time_token = recurrence.split(":", 2)
                weekday = int(weekday_token)
                if now_dt.weekday() != weekday:
                    return False
                target = datetime.strptime(time_token, "%H:%M").time()
                due = now_dt.replace(hour=target.hour, minute=target.minute, second=0, microsecond=0)
                return now_dt >= due and last_fired_at < due.timestamp()
            except Exception:
                return False
        try:
            due_dt = datetime.fromisoformat(event.time_address)
            if due_dt.tzinfo is None:
                due_dt = due_dt.replace(tzinfo=now_dt.tzinfo)
            return now_dt >= due_dt and last_fired_at < due_dt.timestamp()
        except Exception:
            return False

    async def _fire_event(self, event_list_id: str, event: EventListEvent) -> None:
        await self._execute_action(event.action_type, event.payload)
        with self._lock:
            event.last_fired_at = time.time()
            row = self._event_lists.get(event_list_id)
            if row is not None and event.event_id not in row.fired_event_ids:
                row.fired_event_ids.append(event.event_id)

    async def _execute_action(self, action_type: str, payload: Dict[str, Any]) -> None:
        if action_type == "RecallPreset":
            preset_id = str(payload.get("preset_id") or "")
            if preset_id:
                await self._preset_service.recall_preset(preset_id)
            return
        if action_type == "FireMacro":
            macro_id = str(payload.get("macro_id") or "")
            if macro_id:
                await self._macro_service.trigger_macro(macro_id, payload=payload)
            return
        if action_type == "SendMidiRaw":
            destination_port = str(payload.get("destination_port") or "dst")
            message = payload.get("message") or []
            data = bytes(int(item) & 0xFF for item in message)
            self._hub.send(source_port="midi_hub_event_lists", destination_port=destination_port, data=data, metadata={"event_action": action_type})
            return
        if action_type == "SendMSC":
            await self.send_msc_message(
                destination_port=str(payload.get("destination_port") or "dst"),
                device_id=int(payload.get("device_id") or 0),
                command_format=int(payload.get("command_format") or 0),
                command=str(payload.get("command") or "go"),
                cue_number=str(payload.get("cue_number") or "1"),
                list_number=payload.get("list_number"),
            )
            return

    def _serialize_event_list(self, row: EventListDefinition) -> Dict[str, Any]:
        data = row.to_dict()
        data["event_count"] = len(self._events.get(row.event_list_id, {}))
        return data

    def _cancel_task(self, event_list_id: str) -> None:
        task = self._tasks.pop(event_list_id, None)
        if task is not None:
            task.cancel()

    def _persist(self) -> None:
        with self._lock:
            payload = {
                "event_lists": {event_list_id: row.to_dict() for event_list_id, row in self._event_lists.items()},
                "events": {
                    event_list_id: {event_id: event.to_dict() for event_id, event in event_rows.items()}
                    for event_list_id, event_rows in self._events.items()
                },
                "updated_at": time.time(),
            }
        self._storage_path.parent.mkdir(parents=True, exist_ok=True)
        temp = self._storage_path.with_suffix(".tmp")
        temp.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
        temp.replace(self._storage_path)

    def _load(self) -> None:
        if not self._storage_path.exists():
            return
        try:
            payload = json.loads(self._storage_path.read_text(encoding="utf-8"))
        except Exception:
            return
        loaded_lists: Dict[str, EventListDefinition] = {}
        loaded_events: Dict[str, Dict[str, EventListEvent]] = {}
        for event_list_id, raw in (payload.get("event_lists") or {}).items():
            if not isinstance(raw, dict):
                continue
            loaded_lists[event_list_id] = EventListDefinition(
                event_list_id=str(raw.get("event_list_id") or event_list_id),
                name=str(raw.get("name") or event_list_id),
                list_type=str(raw.get("list_type") or "mtc"),
                source_id=str(raw.get("source_id") or "local"),
                internal_clock_enabled=bool(raw.get("internal_clock_enabled", True)),
                first_time=str(raw.get("first_time") or "00:00:00:00"),
                last_time=str(raw.get("last_time") or "00:10:00:00"),
                fps=int(raw.get("fps") or 30),
                timezone=str(raw.get("timezone") or "UTC"),
                enabled=bool(raw.get("enabled", True)),
                running=False,
                current_frame=int(raw.get("current_frame") or 0),
                current_datetime=raw.get("current_datetime"),
                clock_source=str(raw.get("clock_source") or "internal"),
                learn_mode_enabled=bool(raw.get("learn_mode_enabled", False)),
                learn_action_type=str(raw.get("learn_action_type") or "RecallPreset"),
                learn_label=str(raw.get("learn_label") or "Learned cue"),
                learn_payload=dict(raw.get("learn_payload") or {}),
                fired_event_ids=list(raw.get("fired_event_ids") or []),
            )
        for event_list_id, raw_events in (payload.get("events") or {}).items():
            if not isinstance(raw_events, dict):
                continue
            loaded_events[event_list_id] = {}
            for event_id, raw in raw_events.items():
                if not isinstance(raw, dict):
                    continue
                loaded_events[event_list_id][event_id] = EventListEvent(
                    event_id=str(raw.get("event_id") or event_id),
                    order=int(raw.get("order") or 0),
                    time_address=str(raw.get("time_address") or "00:00:00:00"),
                    action_type=str(raw.get("action_type") or "RecallPreset"),
                    label=str(raw.get("label") or event_id),
                    payload=dict(raw.get("payload") or {}),
                    enabled=bool(raw.get("enabled", True)),
                    last_fired_at=raw.get("last_fired_at"),
                )
        self._event_lists = loaded_lists
        self._events = loaded_events


_midi_hub_event_list_service_singleton: Optional[MidiHubEventListService] = None


def get_midi_hub_event_list_service() -> MidiHubEventListService:
    global _midi_hub_event_list_service_singleton
    if _midi_hub_event_list_service_singleton is None:
        _midi_hub_event_list_service_singleton = MidiHubEventListService()
    return _midi_hub_event_list_service_singleton
