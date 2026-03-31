"""Diagnostics and capture support for the Push surface subsystem."""

from __future__ import annotations

import json
import time
from collections import deque
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

from app.services.midi_hub.ports import MidiMessage
from app.services.push_surface.models.capabilities import SurfaceColor
from app.services.push_surface.models.events import SurfaceEvent
from app.services.push_surface.models.render_state import ControlLightState, DisplayFrame, RenderFrame
from app.services.push_surface.models.state import DiagnosticsSnapshot
from app.services.push_surface.protocol.replay import CaptureMessageRecord, save_capture


@dataclass
class PushSurfaceDiagnostics:
    """Rolling diagnostics buffers plus export helpers."""

    max_events: int = 256

    def __post_init__(self) -> None:
        self._raw_events: deque[str] = deque(maxlen=self.max_events)
        self._decoded_events: deque[str] = deque(maxlen=self.max_events)
        self._capture_records: deque[CaptureMessageRecord] = deque(maxlen=max(self.max_events, 1024))
        self._last_render_summary: str = ""
        self._render_count = 0
        self.midi_events_in = 0
        self.midi_events_out = 0

    def record_raw(self, message: MidiMessage) -> None:
        self.midi_events_in += 1
        summary = {
            "timestamp_ns": message.timestamp_ns,
            "source_port": message.source_port,
            "destination_port": message.destination_port,
            "data_hex": bytes(message.data).hex(" "),
        }
        self._raw_events.append(json.dumps(summary, sort_keys=True))
        self._capture_records.append(
            CaptureMessageRecord(
                timestamp_ns=message.timestamp_ns,
                direction="in",
                port=message.source_port,
                data_hex=bytes(message.data).hex(" "),
                annotation=message.metadata.get("annotation"),
            )
        )

    def record_decoded(self, event: SurfaceEvent) -> None:
        self._decoded_events.append(json.dumps(asdict(event), sort_keys=True, default=str))

    def record_render(self, frame: RenderFrame, *, emitted_messages: int = 0) -> None:
        self.midi_events_out += int(emitted_messages)
        self._render_count += 1
        summary = {
            "pads": len(frame.pad_lights),
            "buttons": len(frame.button_lights),
            "encoder_rings": len(frame.encoder_rings),
            "display": frame.display.title if frame.display else None,
        }
        self._last_render_summary = json.dumps(summary, sort_keys=True)

    def snapshot(self) -> DiagnosticsSnapshot:
        return DiagnosticsSnapshot(
            raw_events=tuple(self._raw_events),
            decoded_events=tuple(self._decoded_events),
            last_render_summary=self._last_render_summary,
            render_count=self._render_count,
            midi_events_in=self.midi_events_in,
            midi_events_out=self.midi_events_out,
        )

    def dump_capabilities(self, capabilities: object) -> dict[str, object]:
        return json.loads(json.dumps(asdict(capabilities), default=str))

    def build_test_pattern(self) -> RenderFrame:
        pad_lights = {
            "grid_0_0": ControlLightState(color=SurfaceColor.WHITE),
            "grid_1_0": ControlLightState(color=SurfaceColor.BLUE),
            "grid_2_0": ControlLightState(color=SurfaceColor.CYAN),
            "grid_3_0": ControlLightState(color=SurfaceColor.GREEN),
            "grid_4_0": ControlLightState(color=SurfaceColor.YELLOW),
            "grid_5_0": ControlLightState(color=SurfaceColor.AMBER),
            "grid_6_0": ControlLightState(color=SurfaceColor.RED),
            "grid_7_0": ControlLightState(color=SurfaceColor.MAGENTA),
        }
        return RenderFrame(
            pad_lights=pad_lights,
            display=DisplayFrame(title="Diagnostics", lines=("Test pattern",)),
        )

    def export_bundle(self, directory: Path | None = None) -> Path:
        output_dir = directory or Path.home() / ".map2" / "push_surface" / "diagnostics"
        output_dir.mkdir(parents=True, exist_ok=True)
        timestamp = time.strftime("%Y%m%d-%H%M%S")
        capture_path = output_dir / f"push-surface-capture-{timestamp}.jsonl"
        save_capture(capture_path, list(self._capture_records))
        summary_path = output_dir / f"push-surface-summary-{timestamp}.json"
        summary_path.write_text(
            json.dumps(asdict(self.snapshot()), indent=2, sort_keys=True, default=str),
            encoding="utf-8",
        )
        return output_dir
