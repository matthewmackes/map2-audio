"""Sequencer capture buffer — T2461-A6 foundation.

Process-singleton ring buffer that the Sequencer Step view writes to and
the MIDI Assignments wizard's Calibrate step reads back. The buffer
holds the most recent N seconds of Sequencer output frames (slot id +
peak dB + RMS dB + clip flag + timestamp) so the wizard can render
the Sequencer response alongside the MIDI source stream during a
calibrate session.

Lifecycle:

  - ``start_capture(slot_id, duration_s)`` arms the buffer, replacing
    any prior capture window. Returns a capture session id.
  - ``record_frame(slot_id, peak_db, rms_db, clipping, ts)`` is called
    by the Sequencer meter pipeline each WS tick to append one frame for
    the active session; frames outside the active window are dropped.
  - ``stop_capture()`` finalises the buffer and returns the recorded
    frames keyed by capture session id.
  - ``get_session(session_id)`` returns the recorded frames for any
    completed session (kept for 5 minutes after stop).

The backend dispatcher writes synthetic frames during automated
testing; in production the existing `SequencerMeteringService` calls
`record_frame()` from its WS broadcast tick.

Worklist: T2461-A6.
"""

from __future__ import annotations

import dataclasses
import secrets
import threading
import time
from typing import Any

CAPTURE_RETENTION_S = 300.0   # keep finalised sessions for 5 min
MAX_FRAMES_PER_SESSION = 30 * 60   # 30 fps * 60 s safety cap


@dataclasses.dataclass(frozen=True)
class CaptureFrame:
    slot_id: int
    peak_db: float
    rms_db: float
    clipping: bool
    ts: float


@dataclasses.dataclass
class _CaptureSession:
    session_id: str
    slot_id: int
    started_at: float
    duration_s: float
    frames: list[CaptureFrame]
    finalised_at: float | None


class SequencerCaptureBuffer:
    """Process-singleton wizard-calibrate capture buffer."""

    def __init__(self) -> None:
        self._active: _CaptureSession | None = None
        self._completed: dict[str, _CaptureSession] = {}
        self._lock = threading.RLock()

    # ----- session control -----------------------------------------------

    def start_capture(self, slot_id: int, duration_s: float) -> str:
        if duration_s <= 0 or duration_s > 60:
            raise ValueError(f"duration_s out of range: {duration_s}")
        with self._lock:
            self._gc_locked()
            session_id = secrets.token_urlsafe(8)
            self._active = _CaptureSession(
                session_id=session_id,
                slot_id=slot_id,
                started_at=time.time(),
                duration_s=duration_s,
                frames=[],
                finalised_at=None,
            )
            return session_id

    def stop_capture(self) -> _CaptureSession | None:
        with self._lock:
            if self._active is None:
                return None
            session = self._active
            session.finalised_at = time.time()
            self._completed[session.session_id] = session
            self._active = None
            self._gc_locked()
            return session

    def is_active(self) -> bool:
        with self._lock:
            if self._active is None:
                return False
            elapsed = time.time() - self._active.started_at
            if elapsed > self._active.duration_s:
                # Auto-finalise when the duration expires.
                self.stop_capture()
                return False
            return True

    # ----- frame recording -----------------------------------------------

    def record_frame(
        self,
        slot_id: int,
        peak_db: float,
        rms_db: float,
        clipping: bool,
        ts: float | None = None,
    ) -> None:
        ts = ts if ts is not None else time.time()
        with self._lock:
            if self._active is None:
                return
            if self._active.slot_id != slot_id:
                return   # only record the slot the operator asked for
            elapsed = ts - self._active.started_at
            if elapsed < 0 or elapsed > self._active.duration_s:
                return
            if len(self._active.frames) >= MAX_FRAMES_PER_SESSION:
                return
            self._active.frames.append(CaptureFrame(
                slot_id=slot_id,
                peak_db=peak_db,
                rms_db=rms_db,
                clipping=clipping,
                ts=ts,
            ))

    # ----- session lookup ------------------------------------------------

    def get_session(self, session_id: str) -> _CaptureSession | None:
        with self._lock:
            self._gc_locked()
            return self._completed.get(session_id)

    def session_payload(self, session_id: str) -> dict[str, Any] | None:
        session = self.get_session(session_id)
        if session is None:
            return None
        return {
            "session_id": session.session_id,
            "slot_id": session.slot_id,
            "started_at": session.started_at,
            "duration_s": session.duration_s,
            "finalised_at": session.finalised_at,
            "frame_count": len(session.frames),
            "frames": [
                {
                    "slot_id": f.slot_id, "peak_db": f.peak_db,
                    "rms_db": f.rms_db, "clipping": f.clipping, "ts": f.ts,
                }
                for f in session.frames
            ],
        }

    # ----- internals -----------------------------------------------------

    def _gc_locked(self) -> None:
        cutoff = time.time() - CAPTURE_RETENTION_S
        expired = [
            sid for sid, s in self._completed.items()
            if (s.finalised_at or 0) < cutoff
        ]
        for sid in expired:
            self._completed.pop(sid, None)


# ---------------------------------------------------------------------------
# Singleton accessor
# ---------------------------------------------------------------------------

_singleton: SequencerCaptureBuffer | None = None
_singleton_lock = threading.Lock()


def get_sequencer_capture_buffer() -> SequencerCaptureBuffer:
    global _singleton
    with _singleton_lock:
        if _singleton is None:
            _singleton = SequencerCaptureBuffer()
        return _singleton


def reset_sequencer_capture_buffer_for_tests() -> SequencerCaptureBuffer:
    global _singleton
    with _singleton_lock:
        _singleton = SequencerCaptureBuffer()
        return _singleton
