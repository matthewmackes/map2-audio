"""Capture replay helpers for Push protocol discovery."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

from app.services.midi_hub.ports import MidiMessage


@dataclass(frozen=True)
class CaptureMessageRecord:
    """Serializable raw MIDI capture record."""

    timestamp_ns: int
    direction: str
    port: str
    data_hex: str
    annotation: str | None = None

    @property
    def data(self) -> bytes:
        return bytes.fromhex(self.data_hex.replace(" ", ""))


def save_capture(path: Path, records: Iterable[CaptureMessageRecord]) -> Path:
    """Persist a capture session as JSONL."""

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(asdict(record), sort_keys=True) + "\n")
    return path


def load_capture(path: Path) -> list[CaptureMessageRecord]:
    """Load JSONL capture records."""

    records: list[CaptureMessageRecord] = []
    if not path.exists():
        return records
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        payload = json.loads(line)
        if not isinstance(payload, dict):
            continue
        records.append(
            CaptureMessageRecord(
                timestamp_ns=int(payload.get("timestamp_ns", 0)),
                direction=str(payload.get("direction") or "in"),
                port=str(payload.get("port") or "unknown"),
                data_hex=str(payload.get("data_hex") or ""),
                annotation=str(payload.get("annotation")) if payload.get("annotation") is not None else None,
            )
        )
    return records


def to_midi_messages(records: Iterable[CaptureMessageRecord], *, source_port: str = "capture") -> list[MidiMessage]:
    """Convert capture records into MidiHub messages for replay tests."""

    messages: list[MidiMessage] = []
    for record in records:
        messages.append(
            MidiMessage(
                data=record.data,
                timestamp_ns=record.timestamp_ns,
                source_port=source_port,
                destination_port=record.port,
                metadata={"direction": record.direction, "annotation": record.annotation},
            )
        )
    return messages
