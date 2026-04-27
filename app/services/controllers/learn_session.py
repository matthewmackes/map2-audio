"""In-memory MIDI learn sessions.

T2459-D4. The learn flow:

  start(controller_key) → opens a fresh session, returns session_id.
  capture(session_id, bytes) → appends one message to the session
    buffer. Called repeatedly by the controller-host (or by tests
    feeding synthesized MIDI). The classifier runs continuously so
    the GUI can show the live confidence as the operator wiggles.
  finalize(session_id) → returns the final ClassificationResult.
  assign(session_id, target) → persists the binding into the
    pack's profile YAML and clears the session.

Sessions are process-local and short-lived (15-minute TTL). Lost
sessions force the operator to start over — that's fine; they're not
durable state.
"""

from __future__ import annotations

import dataclasses
import logging
import threading
import time
import uuid
from typing import Any

from app.services.controllers.learning_utils import (
    CapturedMessage,
    ClassificationResult,
    classify,
)

logger = logging.getLogger(__name__)

SESSION_TTL_SECONDS = 15 * 60   # 15 minutes


@dataclasses.dataclass
class LearnSession:
    session_id: str
    controller_key: str
    pack_id: str
    model: str
    created_at: float
    captured: list[CapturedMessage]


class LearnSessionRegistry:
    """Process-wide registry of in-flight learn sessions."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._sessions: dict[str, LearnSession] = {}

    def start(self, controller_key: str, pack_id: str, model: str) -> str:
        sid = uuid.uuid4().hex
        with self._lock:
            self._reap_stale_locked()
            self._sessions[sid] = LearnSession(
                session_id=sid,
                controller_key=controller_key,
                pack_id=pack_id,
                model=model,
                created_at=time.monotonic(),
                captured=[],
            )
        logger.info("Learn session %s opened for %s/%s on %s",
                    sid, pack_id, model, controller_key)
        return sid

    def capture(self, session_id: str, bytes_seq: list[int],
                 timestamp_ns: int = 0) -> ClassificationResult:
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                return ClassificationResult(
                    kind="unknown", confidence=0.0,
                    status=None, midino=None, channel=None,
                    notes="session not found",
                )
            ts = timestamp_ns if timestamp_ns > 0 else time.monotonic_ns()
            session.captured.append(
                CapturedMessage(timestamp_ns=ts, bytes=tuple(bytes_seq))
            )
            return classify(session.captured)

    def finalize(self, session_id: str) -> ClassificationResult | None:
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                return None
            return classify(session.captured)

    def assign(self, session_id: str, target: str | None,
               script: str | None, action: str | None,
               fast_path: bool) -> dict[str, Any] | None:
        """Translate the session's classification into a control row
        ready to be appended to the pack's MIDI profile YAML.

        Returns the row dict, or None if the session is missing or
        the classifier couldn't recover a status/midino.
        """
        result = self.finalize(session_id)
        if result is None:
            return None
        if result.status is None:
            return None
        with self._lock:
            session = self._sessions.pop(session_id, None)
        if session is None:
            return None
        row: dict[str, Any] = {
            "status": result.status,
            "channel": result.channel,
            "description": (
                f"Learned {result.kind} (confidence {result.confidence:.2f})"
            ),
        }
        if result.midino is not None:
            row["midino"] = result.midino
        if target is not None:
            row["target"] = target
        if script is not None:
            row["script"] = script
        if action is not None:
            row["action"] = action
        if fast_path:
            row["fast_path"] = True
        return row

    def cancel(self, session_id: str) -> bool:
        with self._lock:
            return self._sessions.pop(session_id, None) is not None

    def get(self, session_id: str) -> LearnSession | None:
        with self._lock:
            return self._sessions.get(session_id)

    def _reap_stale_locked(self) -> None:
        now = time.monotonic()
        stale = [
            sid for sid, sess in self._sessions.items()
            if now - sess.created_at > SESSION_TTL_SECONDS
        ]
        for sid in stale:
            self._sessions.pop(sid, None)
        if stale:
            logger.info("Reaped %d stale learn sessions", len(stale))


_registry: LearnSessionRegistry | None = None


def get_learn_registry() -> LearnSessionRegistry:
    global _registry
    if _registry is None:
        _registry = LearnSessionRegistry()
    return _registry


def reset_learn_registry_for_tests() -> None:
    global _registry
    _registry = None
