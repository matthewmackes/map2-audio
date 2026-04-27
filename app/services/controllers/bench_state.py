"""Bench-state tracker for the Hardware Store.

T2459-G1. Holds the in-memory side of the connected/known device
state — pinned profiles (operator-curated) and recently-seen profiles
(from detector snapshots). The Q12 lifecycle is:

  - Connected: matched by the detector right now.
  - Recently disconnected: matched within the last 30 s but not now.
  - Known to bench: pinned (forever) OR seen within the last 24 h.

Pinned state is persisted via the standard MAP2 user-state file
(``~/.map2/hardware_store_pins.json``) so it survives backend
restarts. Recently-seen state is in-memory; on backend restart the
detector re-populates it on first poll.

Architecture: ``docs/architecture/HARDWARE_STORE_INTEGRATION.md`` §2.
Worklist: ``T2459-G1``.
"""

from __future__ import annotations

import dataclasses
import json
import logging
import threading
import time
from pathlib import Path

logger = logging.getLogger(__name__)

DEFAULT_PIN_FILE = Path.home() / ".map2" / "hardware_store_pins.json"

RECENTLY_DISCONNECTED_GRACE_S = 30.0
KNOWN_RETENTION_S = 24 * 3600.0


@dataclasses.dataclass
class _Sighting:
    profile_key: str
    last_seen_at: float


class BenchStateTracker:
    """Process-singleton tracker.

    Thread-safe; the detector runs on the FastAPI event loop while the
    WS broadcaster (G2) and HTTP routes read concurrently.
    """

    def __init__(self, pin_file: Path | None = None) -> None:
        self._pin_file = pin_file or DEFAULT_PIN_FILE
        self._pinned: set[str] = set()
        self._sightings: dict[str, _Sighting] = {}
        self._lock = threading.RLock()
        self._load_pins()

    # ----- pin persistence ------------------------------------------------

    def _load_pins(self) -> None:
        if not self._pin_file.is_file():
            return
        try:
            data = json.loads(self._pin_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("Pin file unreadable, ignoring: %s", exc)
            return
        if not isinstance(data, dict):
            return
        keys = data.get("pinned")
        if isinstance(keys, list):
            self._pinned = {str(k) for k in keys}

    def _save_pins(self) -> None:
        try:
            self._pin_file.parent.mkdir(parents=True, exist_ok=True)
            self._pin_file.write_text(
                json.dumps({"pinned": sorted(self._pinned)}, indent=2) + "\n",
                encoding="utf-8",
            )
        except OSError as exc:
            logger.warning("Could not persist pin file %s: %s", self._pin_file, exc)

    # ----- pin API --------------------------------------------------------

    def pin(self, profile_key: str) -> bool:
        with self._lock:
            if profile_key in self._pinned:
                return False
            self._pinned.add(profile_key)
            self._save_pins()
            return True

    def unpin(self, profile_key: str) -> bool:
        with self._lock:
            if profile_key not in self._pinned:
                return False
            self._pinned.discard(profile_key)
            self._save_pins()
            return True

    def is_pinned(self, profile_key: str) -> bool:
        with self._lock:
            return profile_key in self._pinned

    def pinned_keys(self) -> tuple[str, ...]:
        with self._lock:
            return tuple(sorted(self._pinned))

    # ----- sighting tracker ----------------------------------------------

    def record_seen(self, profile_keys: list[str], *, now: float | None = None) -> None:
        """Mark these profile keys as just-seen by the detector."""
        ts = now if now is not None else time.time()
        with self._lock:
            for key in profile_keys:
                self._sightings[key] = _Sighting(key, ts)
            # Compact: drop entries past KNOWN_RETENTION_S to keep the dict small.
            cutoff = ts - KNOWN_RETENTION_S
            stale = [k for k, s in self._sightings.items() if s.last_seen_at < cutoff]
            for k in stale:
                self._sightings.pop(k, None)

    def last_seen(self, profile_key: str) -> float | None:
        with self._lock:
            s = self._sightings.get(profile_key)
            return s.last_seen_at if s else None

    def known_keys(self, *, now: float | None = None) -> tuple[str, ...]:
        """Pinned ∪ seen-within-24h."""
        ts = now if now is not None else time.time()
        cutoff = ts - KNOWN_RETENTION_S
        with self._lock:
            seen = {k for k, s in self._sightings.items() if s.last_seen_at >= cutoff}
            return tuple(sorted(self._pinned | seen))

    def recently_disconnected_keys(
        self, currently_connected: set[str], *, now: float | None = None,
    ) -> tuple[str, ...]:
        """Profile keys seen within the 30 s grace window but not in the
        current detector snapshot.
        """
        ts = now if now is not None else time.time()
        cutoff = ts - RECENTLY_DISCONNECTED_GRACE_S
        with self._lock:
            recent = {
                k for k, s in self._sightings.items()
                if s.last_seen_at >= cutoff and k not in currently_connected
            }
            return tuple(sorted(recent))


_singleton: BenchStateTracker | None = None
_singleton_lock = threading.Lock()


def get_bench_state_tracker() -> BenchStateTracker:
    global _singleton
    with _singleton_lock:
        if _singleton is None:
            _singleton = BenchStateTracker()
        return _singleton


def reset_bench_state_for_tests(pin_file: Path | None = None) -> BenchStateTracker:
    """Reset the singleton; used by tests to get a clean tracker."""
    global _singleton
    with _singleton_lock:
        _singleton = BenchStateTracker(pin_file=pin_file)
        return _singleton
