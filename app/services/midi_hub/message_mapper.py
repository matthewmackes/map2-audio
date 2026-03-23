"""Persisted node-backed message mapper slots for MIDI Hub processing."""

from __future__ import annotations

import json
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.services.midi_hub.hub import MidiHub, get_midi_hub
from app.services.midi_hub.ports import MidiMessage


def _default_storage_path() -> Path:
    return Path("~/.map2/midi_hub_message_mapper.json").expanduser()


def _normalize_message_type(value: str) -> str:
    normalized = str(value or "control_change").strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "cc": "control_change",
        "controlchange": "control_change",
        "pc": "program_change",
        "programchange": "program_change",
        "pitch_bend": "pitchbend",
        "pitch": "pitchbend",
    }
    return aliases.get(normalized, normalized)


def _clamp_midi(value: int) -> int:
    return max(0, min(127, int(value)))


def _apply_curve(value: float, curve: str) -> float:
    v = max(0.0, min(1.0, float(value)))
    mode = str(curve or "linear").strip().lower()
    if mode in {"log", "logarithmic"}:
        return v * v
    if mode in {"exp", "exponential"}:
        return v ** 0.5
    if mode in {"s", "s_curve", "sigmoid"}:
        return (3.0 * v * v) - (2.0 * v * v * v)
    if mode in {"reverse", "invert"}:
        return 1.0 - v
    return v


def _slot_sort_key(slot_id: str) -> tuple[int, str]:
    suffix = str(slot_id or "").strip().split("-")[-1]
    try:
        return (int(suffix), str(slot_id))
    except ValueError:
        return (9999, str(slot_id))


def _parse_message(data: bytes) -> Dict[str, Any]:
    if not data:
        return {"message_type": "empty", "channel": None, "value": None}

    status = int(data[0])
    if status == 0xF0:
        return {"message_type": "sysex", "channel": None, "value": None}
    if status >= 0xF8:
        return {"message_type": "system_realtime", "channel": None, "value": None}

    status_family = status & 0xF0
    channel = (status & 0x0F) + 1
    data1 = int(data[1]) if len(data) > 1 else None
    data2 = int(data[2]) if len(data) > 2 else None

    if status_family == 0x80:
        return {"message_type": "note_off", "channel": channel, "data1": data1, "data2": data2, "value": data2}
    if status_family == 0x90:
        message_type = "note_off" if data2 == 0 else "note_on"
        return {"message_type": message_type, "channel": channel, "data1": data1, "data2": data2, "value": data2}
    if status_family == 0xB0:
        return {"message_type": "control_change", "channel": channel, "data1": data1, "data2": data2, "value": data2}
    if status_family == 0xC0:
        return {"message_type": "program_change", "channel": channel, "data1": data1, "data2": None, "value": data1}
    if status_family == 0xE0 and len(data) >= 3:
        raw14 = ((int(data[2]) & 0x7F) << 7) | (int(data[1]) & 0x7F)
        value7 = int(round((raw14 / 16383.0) * 127.0))
        return {"message_type": "pitchbend", "channel": channel, "data1": data1, "data2": data2, "value": value7}
    return {"message_type": "system", "channel": channel, "data1": data1, "data2": data2, "value": data2}


@dataclass
class MidiMessageMapperSlot:
    slot_id: str
    enabled: bool = False
    source_port: str = ""
    message_type: str = "control_change"
    channel_min: int = 1
    channel_max: int = 16
    value_min: int = 0
    value_max: int = 127
    target: str = ""
    curve: str = "linear"
    created_at: float = 0.0
    updated_at: float = 0.0
    match_count: int = 0
    last_matched_at: Optional[float] = None
    last_source_port: Optional[str] = None
    last_event_hex: Optional[str] = None
    last_output_hex: Optional[str] = None
    last_error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "slot_id": self.slot_id,
            "enabled": self.enabled,
            "source_port": self.source_port,
            "message_type": self.message_type,
            "channel_min": self.channel_min,
            "channel_max": self.channel_max,
            "value_min": self.value_min,
            "value_max": self.value_max,
            "target": self.target,
            "curve": self.curve,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "match_count": self.match_count,
            "last_matched_at": self.last_matched_at,
            "last_source_port": self.last_source_port,
            "last_event_hex": self.last_event_hex,
            "last_output_hex": self.last_output_hex,
            "last_error": self.last_error,
        }

    def persisted_dict(self) -> Dict[str, Any]:
        return {
            "slot_id": self.slot_id,
            "enabled": self.enabled,
            "source_port": self.source_port,
            "message_type": self.message_type,
            "channel_min": self.channel_min,
            "channel_max": self.channel_max,
            "value_min": self.value_min,
            "value_max": self.value_max,
            "target": self.target,
            "curve": self.curve,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


def _create_default_slot(index: int) -> MidiMessageMapperSlot:
    now = time.time()
    return MidiMessageMapperSlot(slot_id=f"mapper-{index + 1}", created_at=now, updated_at=now)


class MidiMessageMapperService:
    def __init__(
        self,
        *,
        hub: Optional[MidiHub] = None,
        storage_path: Optional[Path] = None,
    ) -> None:
        self._hub = hub or get_midi_hub()
        self._storage_path = storage_path or _default_storage_path()
        self._lock = threading.RLock()
        self._subscriber_id = "midi_message_mapper_service"
        self._slots: Dict[str, MidiMessageMapperSlot] = {}
        self._load()
        self._ensure_default_slots()
        self._hub.subscribe(self._subscriber_id, self._handle_message)

    def close(self) -> None:
        self._hub.unsubscribe(self._subscriber_id)

    def list_slots(self) -> List[Dict[str, Any]]:
        with self._lock:
            return [self._slots[slot_id].to_dict() for slot_id in sorted(self._slots.keys(), key=_slot_sort_key)]

    def get_slot(self, slot_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            slot = self._slots.get(str(slot_id))
            return slot.to_dict() if slot is not None else None

    def upsert_slot(
        self,
        *,
        slot_id: str,
        enabled: bool = False,
        source_port: str = "",
        message_type: str = "control_change",
        channel_min: int = 1,
        channel_max: int = 16,
        value_min: int = 0,
        value_max: int = 127,
        target: str = "",
        curve: str = "linear",
    ) -> Dict[str, Any]:
        slot_key = str(slot_id or "").strip()
        if not slot_key:
            raise ValueError("slot_id is required")

        normalized_type = _normalize_message_type(message_type)
        if normalized_type not in {"control_change", "note_on", "note_off", "program_change", "pitchbend"}:
            raise ValueError(f"unsupported message_type: {message_type}")

        normalized_source = str(source_port or "").strip()
        normalized_target = str(target or "").strip()
        normalized_curve = str(curve or "linear").strip().lower() or "linear"
        ch_min = max(1, min(16, int(channel_min)))
        ch_max = max(1, min(16, int(channel_max)))
        val_min = max(0, min(127, int(value_min)))
        val_max = max(0, min(127, int(value_max)))
        if ch_min > ch_max:
            ch_min, ch_max = ch_max, ch_min
        if val_min > val_max:
            val_min, val_max = val_max, val_min
        if enabled and not normalized_target:
            raise ValueError("enabled mapper slots require a destination target")

        with self._lock:
            existing = self._slots.get(slot_key)
            now = time.time()
            slot = MidiMessageMapperSlot(
                slot_id=slot_key,
                enabled=bool(enabled),
                source_port=normalized_source,
                message_type=normalized_type,
                channel_min=ch_min,
                channel_max=ch_max,
                value_min=val_min,
                value_max=val_max,
                target=normalized_target,
                curve=normalized_curve,
                created_at=existing.created_at if existing is not None else now,
                updated_at=now,
                match_count=existing.match_count if existing is not None else 0,
                last_matched_at=existing.last_matched_at if existing is not None else None,
                last_source_port=existing.last_source_port if existing is not None else None,
                last_event_hex=existing.last_event_hex if existing is not None else None,
                last_output_hex=existing.last_output_hex if existing is not None else None,
                last_error=existing.last_error if existing is not None else None,
            )
            self._slots[slot_key] = slot
            self._persist()
            return slot.to_dict()

    def clear_slot(self, slot_id: str) -> Dict[str, Any]:
        slot_key = str(slot_id or "").strip()
        if not slot_key:
            raise ValueError("slot_id is required")
        with self._lock:
            existing = self._slots.get(slot_key)
            if existing is None:
                raise ValueError(f"unknown mapper slot: {slot_key}")
            reset = _create_default_slot(max(0, _slot_sort_key(slot_key)[0] - 1))
            reset.slot_id = slot_key
            self._slots[slot_key] = reset
            self._persist()
            return reset.to_dict()

    def reset_slots(self) -> List[Dict[str, Any]]:
        with self._lock:
            self._slots = {
                f"mapper-{index + 1}": _create_default_slot(index)
                for index in range(16)
            }
            self._persist()
            return [self._slots[slot_id].to_dict() for slot_id in sorted(self._slots.keys(), key=_slot_sort_key)]

    def process_message(self, message: MidiMessage) -> List[Dict[str, Any]]:
        parsed = _parse_message(message.data)
        if parsed["message_type"] not in {"control_change", "note_on", "note_off", "program_change", "pitchbend"}:
            return []

        emitted: List[Dict[str, Any]] = []
        with self._lock:
            slots = [self._slots[slot_id] for slot_id in sorted(self._slots.keys(), key=_slot_sort_key)]
            for slot in slots:
                if not slot.enabled:
                    continue
                if slot.source_port and slot.source_port != message.source_port:
                    continue
                if slot.message_type != parsed["message_type"]:
                    continue
                channel = parsed.get("channel")
                if channel is not None and not (slot.channel_min <= int(channel) <= slot.channel_max):
                    continue

                outbound = self._build_outbound_message(message, parsed, slot)
                if outbound is None:
                    slot.last_error = "unsupported_payload"
                    continue

                ok = self._hub.send(
                    source_port=f"midi_mapper:{slot.slot_id}",
                    destination_port=slot.target,
                    data=outbound,
                    metadata={
                        "mapper_slot_id": slot.slot_id,
                        "mapper_source_port": message.source_port,
                        "mapper_message_type": slot.message_type,
                    },
                )
                slot.match_count += 1
                slot.last_matched_at = time.time()
                slot.last_source_port = message.source_port
                slot.last_event_hex = message.data.hex(" ").upper()
                slot.last_output_hex = outbound.hex(" ").upper()
                slot.last_error = None if ok else "send_failed"
                emitted.append(
                    {
                        "slot_id": slot.slot_id,
                        "target": slot.target,
                        "ok": ok,
                        "output_hex": slot.last_output_hex,
                    }
                )
        return emitted

    def _build_outbound_message(
        self,
        message: MidiMessage,
        parsed: Dict[str, Any],
        slot: MidiMessageMapperSlot,
    ) -> Optional[bytes]:
        if not slot.target:
            return None

        status = int(message.data[0]) if message.data else None
        if status is None:
            return None

        raw_value = parsed.get("value")
        normalized_value = max(0.0, min(1.0, float(raw_value if raw_value is not None else 0) / 127.0))
        curved = _apply_curve(normalized_value, slot.curve)
        mapped7 = _clamp_midi(int(round(slot.value_min + ((slot.value_max - slot.value_min) * curved))))

        message_type = parsed["message_type"]
        if message_type == "program_change" and len(message.data) >= 2:
            return bytes([status, mapped7])
        if message_type == "pitchbend" and len(message.data) >= 3:
            mapped14 = max(0, min(16383, int(round((mapped7 / 127.0) * 16383.0))))
            return bytes([status, mapped14 & 0x7F, (mapped14 >> 7) & 0x7F])
        if len(message.data) >= 3:
            return bytes([status, int(message.data[1]) & 0x7F, mapped7])
        return None

    def _handle_message(self, message: MidiMessage) -> None:
        self.process_message(message)

    def _persist(self) -> None:
        payload = {
            "slots": {slot_id: slot.persisted_dict() for slot_id, slot in self._slots.items()},
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
            raw_slots = payload.get("slots") or {}
            for slot_id, raw in raw_slots.items():
                if not isinstance(raw, dict):
                    continue
                slot = MidiMessageMapperSlot(
                    slot_id=str(raw.get("slot_id") or slot_id),
                    enabled=bool(raw.get("enabled", False)),
                    source_port=str(raw.get("source_port") or ""),
                    message_type=_normalize_message_type(str(raw.get("message_type") or "control_change")),
                    channel_min=max(1, min(16, int(raw.get("channel_min", 1)))),
                    channel_max=max(1, min(16, int(raw.get("channel_max", 16)))),
                    value_min=max(0, min(127, int(raw.get("value_min", 0)))),
                    value_max=max(0, min(127, int(raw.get("value_max", 127)))),
                    target=str(raw.get("target") or ""),
                    curve=str(raw.get("curve") or "linear"),
                    created_at=float(raw.get("created_at") or time.time()),
                    updated_at=float(raw.get("updated_at") or time.time()),
                )
                self._slots[slot.slot_id] = slot
        except Exception:
            self._slots = {}

    def _ensure_default_slots(self) -> None:
        updated = False
        with self._lock:
            for index in range(16):
                slot_id = f"mapper-{index + 1}"
                if slot_id not in self._slots:
                    self._slots[slot_id] = _create_default_slot(index)
                    updated = True
            if updated:
                self._persist()


_midi_message_mapper_service_singleton: Optional[MidiMessageMapperService] = None


def get_midi_message_mapper_service() -> MidiMessageMapperService:
    global _midi_message_mapper_service_singleton
    if _midi_message_mapper_service_singleton is None:
        _midi_message_mapper_service_singleton = MidiMessageMapperService()
    return _midi_message_mapper_service_singleton
