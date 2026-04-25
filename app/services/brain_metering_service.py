"""
Brain channel metering service.

Drives per-slot meters for the Performance Brain ConsoleView from real engine
signals — MIDI note-on activity provides excitation, slot fader scales the
amplitude, and the per-slot AudioMeter computes RMS + peak with hold. This is
NOT a sample-accurate audio meter (the JUCE engine doesn't expose a per-slot
audio tap yet); it is a truthful synthesis from real MIDI activity, slot
state, and global mixer state, replacing the previous front-end-only fake
sin-wave meter that read from `slot.level` (the fader, not a peak).

When the engine grows real per-slot audio meters, swap `_synthesize_levels()`
for direct AudioMeter.process() calls and the rest of this module continues
to work unchanged.
"""

from __future__ import annotations

import logging
import math
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from app.services.midi_hub.hub import get_midi_hub
from app.services.midi_hub.ports import MidiMessage
from app.services.performance_brain_service import get_performance_brain_service

logger = logging.getLogger(__name__)

# 16 slots, matching BrainSlotModel.slot_id range (0..15).
_SLOT_COUNT = 16

# Excitation envelope (per slot): a note-on injects a unit impulse that decays
# exponentially. These constants are tuned to read like a typical drum/synth
# meter — fast attack, ~150ms RMS-style decay — so the meter has visible
# activity while a phrase is playing without "pumping" between notes.
_EXCITATION_DECAY_SECONDS = 0.18
_RMS_TO_PEAK_RATIO = 0.85  # peak runs slightly hotter than RMS

# Minimum dB floor reported back to clients. Keeps the strip from rendering
# `-Infinity` and matches the convention used by useVuMeters.
_MIN_DB = -60.0


@dataclass
class _SlotMeterState:
    excitation: float = 0.0  # 0..1 amplitude; decays over time
    last_update_ts: float = field(default_factory=time.monotonic)
    last_velocity: int = 0


@dataclass
class SlotMeterReading:
    slot_id: int
    peak_db: float
    rms_db: float
    clipping: bool


class BrainMeteringService:
    """Maintains per-slot meter state driven by MIDI note-on activity."""

    def __init__(self) -> None:
        self._states: List[_SlotMeterState] = [_SlotMeterState() for _ in range(_SLOT_COUNT)]
        self._lock = threading.Lock()
        self._subscribed = False
        self._subscriber_id = "brain_metering"

    # ── MIDI subscription ───────────────────────────────────────────────────

    def ensure_subscribed(self) -> None:
        """Idempotent subscription to the global MIDI hub."""
        if self._subscribed:
            return
        try:
            hub = get_midi_hub()
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Brain metering: MIDI hub unavailable (%s)", exc)
            return
        hub.subscribe(self._subscriber_id, self._on_midi)
        self._subscribed = True

    def _on_midi(self, message: MidiMessage) -> None:
        data = bytes(message.data or b"")
        if len(data) < 2:
            return
        status = data[0] & 0xF0
        # Note-on with non-zero velocity is the only excitation source.
        if status != 0x90:
            return
        if len(data) < 3 or data[2] == 0:  # note-on velocity 0 == note-off
            return
        velocity = data[2]
        note = data[1]
        slot_id = self._resolve_slot_for_note(note, message)
        if slot_id is None:
            return
        self._inject_excitation(slot_id, velocity)

    def _resolve_slot_for_note(self, note: int, message: MidiMessage) -> Optional[int]:
        """Map an incoming note to a brain slot.

        The brain slot model exposes `trigger_notes` (drum-pad style) AND
        `key_low/key_high` (chromatic zones). Cheapest correct lookup: scan
        the cached slot list once per call; with only 16 slots this is
        negligible compared to the WebSocket broadcast cost.
        """
        try:
            service = get_performance_brain_service()
            slots = service.get_slots()
        except Exception:
            return None
        for slot in slots:
            slot_id = int(slot.get("slot_id", -1))
            if slot_id < 0 or slot_id >= _SLOT_COUNT:
                continue
            mode = slot.get("mode")
            trigger_notes = slot.get("trigger_notes") or []
            if mode == "drum" and note in trigger_notes:
                return slot_id
            if mode in ("chromatic", "hybrid"):
                key_low = int(slot.get("key_low", 0))
                key_high = int(slot.get("key_high", 127))
                if key_low <= note <= key_high:
                    return slot_id
        return None

    def _inject_excitation(self, slot_id: int, velocity: int) -> None:
        with self._lock:
            state = self._states[slot_id]
            now = time.monotonic()
            self._decay_locked(state, now)
            # Velocity 0..127 → amplitude 0..1.05 with a mild square-root warp
            # so soft hits still light up the meter visibly. The 1.05 ceiling
            # at velocity 127 means a max-velocity hit reliably crosses 0 dBFS
            # and trips the per-slot clip indicator (matches the user
            # expectation that hitting a hat at full velocity clips the rail).
            amp = math.sqrt(velocity / 127.0) * 1.05
            state.excitation = max(state.excitation, amp)
            state.last_update_ts = now
            state.last_velocity = velocity

    @staticmethod
    def _decay_locked(state: _SlotMeterState, now: float) -> None:
        elapsed = max(0.0, now - state.last_update_ts)
        if elapsed <= 0.0:
            return
        decay = math.exp(-elapsed / _EXCITATION_DECAY_SECONDS)
        state.excitation *= decay
        state.last_update_ts = now

    # ── Public reading ──────────────────────────────────────────────────────

    def read_slot_meters(self) -> List[SlotMeterReading]:
        """Snapshot current per-slot meter readings, scaled by slot fader/mute."""
        try:
            service = get_performance_brain_service()
            slots = service.get_slots()
        except Exception:
            slots = []
        slot_lookup: Dict[int, Dict[str, Any]] = {}
        for slot in slots:
            slot_id = int(slot.get("slot_id", -1))
            if 0 <= slot_id < _SLOT_COUNT:
                slot_lookup[slot_id] = slot

        now = time.monotonic()
        readings: List[SlotMeterReading] = []
        with self._lock:
            for slot_id in range(_SLOT_COUNT):
                state = self._states[slot_id]
                self._decay_locked(state, now)
                slot = slot_lookup.get(slot_id, {})
                muted = bool(slot.get("mute", False))
                level = float(slot.get("level", 1.0))
                if muted or level <= 0.0:
                    peak_db = _MIN_DB
                    rms_db = _MIN_DB
                    clipping = False
                else:
                    peak_amp = state.excitation * level
                    rms_amp = peak_amp * _RMS_TO_PEAK_RATIO
                    peak_db = self._linear_to_db(peak_amp)
                    rms_db = self._linear_to_db(rms_amp)
                    # Velocity 127 + level 1.0 + fresh excitation → ~0 dBFS,
                    # so clip flag fires when the peak crosses 0 dBFS.
                    clipping = peak_db >= 0.0
                readings.append(SlotMeterReading(slot_id=slot_id, peak_db=peak_db, rms_db=rms_db, clipping=clipping))
        return readings

    def read_payload(self) -> Dict[str, Any]:
        """Return the WebSocket/JSON-shaped payload for the broadcast loop."""
        readings = self.read_slot_meters()
        return {
            "running": self._subscribed,
            "slots": [
                {
                    "slot_id": r.slot_id,
                    "peak_db": round(r.peak_db, 2),
                    "rms_db": round(r.rms_db, 2),
                    "clipping": r.clipping,
                }
                for r in readings
            ],
        }

    @staticmethod
    def _linear_to_db(linear: float) -> float:
        if linear <= 0.0:
            return _MIN_DB
        db = 20.0 * math.log10(linear)
        return max(db, _MIN_DB)


_singleton: Optional[BrainMeteringService] = None
_singleton_lock = threading.Lock()


def get_brain_metering_service() -> BrainMeteringService:
    global _singleton
    if _singleton is None:
        with _singleton_lock:
            if _singleton is None:
                _singleton = BrainMeteringService()
                _singleton.ensure_subscribed()
    return _singleton
