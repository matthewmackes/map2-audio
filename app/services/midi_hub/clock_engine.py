"""MIDI Clock engine for generation, detection, and distribution."""

from __future__ import annotations

import asyncio
import statistics
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from app.services.midi_hub.hub import MidiHub, get_midi_hub
from app.services.midi_hub.ports import MidiMessage


PPQN = 24


@dataclass
class MidiClockConfig:
    bpm: float = 120.0
    running: bool = False
    source_mode: str = "internal"  # internal|external
    output_ports: List[str] = field(default_factory=list)
    snapshot_sync_enabled: bool = False
    divider: float = 1.0
    multiplier: float = 1.0
    offset_ms: float = 0.0
    tap_note: Optional[int] = None
    tap_cc: Optional[int] = None


class MidiClockEngine:
    def __init__(self, hub: Optional[MidiHub] = None) -> None:
        self._hub = hub or get_midi_hub()
        self._config = MidiClockConfig()
        self._detected_bpm: Optional[float] = None
        self._last_tick_time: Optional[float] = None
        self._last_tick_timestamp_ns: Optional[int] = None
        self._tick_intervals: List[float] = []
        self._tap_times: List[float] = []
        self._task: Optional[asyncio.Task] = None
        self._song_position = 0
        self._hub.subscribe("consumer:midi_clock_engine", self._on_hub_message)

    def status(self) -> Dict[str, Any]:
        return {
            "bpm": float(self._config.bpm),
            "running": bool(self._config.running),
            "source_mode": self._config.source_mode,
            "output_ports": list(self._config.output_ports),
            "snapshot_sync_enabled": bool(self._config.snapshot_sync_enabled),
            "divider": float(self._config.divider),
            "multiplier": float(self._config.multiplier),
            "offset_ms": float(self._config.offset_ms),
            "detected_bpm": self._detected_bpm,
            "song_position": int(self._song_position),
            "tap_note": self._config.tap_note,
            "tap_cc": self._config.tap_cc,
        }

    def configure(self, **updates: Any) -> Dict[str, Any]:
        if "bpm" in updates:
            self._config.bpm = max(20.0, min(300.0, float(updates["bpm"])))
        if "source_mode" in updates:
            mode = str(updates["source_mode"]).strip().lower()
            self._config.source_mode = "external" if mode == "external" else "internal"
        if "output_ports" in updates:
            ports = [str(port) for port in (updates["output_ports"] or []) if str(port).strip()]
            self._config.output_ports = ports
        if "snapshot_sync_enabled" in updates:
            self._config.snapshot_sync_enabled = bool(updates["snapshot_sync_enabled"])
        if "divider" in updates:
            self._config.divider = max(0.25, min(16.0, float(updates["divider"])))
        if "multiplier" in updates:
            self._config.multiplier = max(0.25, min(16.0, float(updates["multiplier"])))
        if "offset_ms" in updates:
            self._config.offset_ms = max(-500.0, min(500.0, float(updates["offset_ms"])))
        if "tap_note" in updates:
            value = updates["tap_note"]
            self._config.tap_note = None if value is None else int(value)
        if "tap_cc" in updates:
            value = updates["tap_cc"]
            self._config.tap_cc = None if value is None else int(value)
        return self.status()

    async def start(self) -> Dict[str, Any]:
        self._config.running = True
        self._send_realtime(0xFA)  # Start
        self._ensure_task()
        return self.status()

    async def stop(self) -> Dict[str, Any]:
        self._config.running = False
        self._send_realtime(0xFC)  # Stop
        await self._cancel_task()
        return self.status()

    async def cont(self) -> Dict[str, Any]:
        self._config.running = True
        self._send_realtime(0xFB)  # Continue
        self._ensure_task()
        return self.status()

    async def tap(self) -> Dict[str, Any]:
        self._record_tap()
        return self.status()

    def set_external_sync(self, bpm: float, offset_ms: float = 0.0) -> Dict[str, Any]:
        self._config.source_mode = "external"
        self._detected_bpm = max(1.0, min(500.0, float(bpm)))
        self._config.offset_ms = max(-500.0, min(500.0, float(offset_ms)))
        self._last_tick_timestamp_ns = time.time_ns()
        return self.status()

    def get_tick_timestamp_ns(self) -> int:
        return int(self._last_tick_timestamp_ns or 0)

    def _record_tap(self) -> None:
        now = time.monotonic()
        self._tap_times.append(now)
        if len(self._tap_times) > 6:
            self._tap_times = self._tap_times[-6:]
        if len(self._tap_times) >= 2:
            intervals = [b - a for a, b in zip(self._tap_times, self._tap_times[1:]) if b > a]
            if intervals:
                avg = statistics.mean(intervals)
                if avg > 0:
                    self._config.bpm = max(20.0, min(300.0, 60.0 / avg))

    def observe_external_tick(self, timestamp_ns: Optional[int] = None) -> None:
        now = time.monotonic()
        if self._last_tick_time is not None:
            interval = now - self._last_tick_time
            if interval > 0:
                self._tick_intervals.append(interval)
                if len(self._tick_intervals) > 192:
                    self._tick_intervals = self._tick_intervals[-192:]
                avg = statistics.mean(self._tick_intervals)
                if avg > 0:
                    self._detected_bpm = max(1.0, min(500.0, 60.0 / (avg * PPQN)))
        self._last_tick_time = now
        self._last_tick_timestamp_ns = int(timestamp_ns if timestamp_ns is not None else time.time_ns())

    def _effective_bpm(self) -> float:
        bpm = self._detected_bpm if self._config.source_mode == "external" and self._detected_bpm else self._config.bpm
        scaled = bpm * self._config.multiplier / self._config.divider
        return max(20.0, min(300.0, scaled))

    def _ensure_task(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._clock_loop(), name="midi_clock_engine")

    async def _cancel_task(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        self._task = None

    async def _clock_loop(self) -> None:
        while self._config.running:
            tick_interval = 60.0 / (self._effective_bpm() * PPQN)
            if self._config.offset_ms > 0:
                await asyncio.sleep(self._config.offset_ms / 1000.0)
            self._last_tick_timestamp_ns = time.time_ns()
            self._send_realtime(0xF8)  # Clock tick
            self._song_position += 1
            await asyncio.sleep(max(0.0005, tick_interval))

    def _send_realtime(self, status_byte: int) -> None:
        payload = bytes([status_byte & 0xFF])
        for port in self._config.output_ports:
            self._hub.send(source_port="midi_clock", destination_port=port, data=payload)

    def _on_hub_message(self, message: MidiMessage) -> None:
        if not message.data:
            return
        status = int(message.data[0]) & 0xFF
        if status == 0xF8:
            self.observe_external_tick(message.timestamp_ns)
            return

        if (status & 0xF0) == 0x90 and len(message.data) >= 3:
            note = int(message.data[1]) & 0x7F
            velocity = int(message.data[2]) & 0x7F
            if velocity > 0 and self._config.tap_note is not None and note == self._config.tap_note:
                self._record_tap()
            return

        if (status & 0xF0) == 0xB0 and len(message.data) >= 3:
            cc = int(message.data[1]) & 0x7F
            value = int(message.data[2]) & 0x7F
            if value > 0 and self._config.tap_cc is not None and cc == self._config.tap_cc:
                self._record_tap()


_midi_clock_engine_singleton: Optional[MidiClockEngine] = None


def get_midi_clock_engine() -> MidiClockEngine:
    global _midi_clock_engine_singleton
    if _midi_clock_engine_singleton is None:
        _midi_clock_engine_singleton = MidiClockEngine()
    return _midi_clock_engine_singleton
