"""MIDI Connections Visualization — rolling 5-min edge traffic buffer.

T2500-MV-B1.

Stores recent MIDI activity per topology edge so the
``/ws/midi/visualization`` endpoint can hand a fresh subscriber a
"replay" of the last 5 minutes when they connect. Without this, opening
the visualization page after a quiet period would show an empty canvas
even though traffic just stopped a second ago — which makes
debugging mis-routed mappings effectively impossible.

Design notes
============

- **In-memory only.** This is observability, not authority. A backend
  restart drops the buffer; the page reconnects and starts fresh.
- **Per-edge bounded.** Each ``(source_node_id, target_node_id)`` edge
  keeps at most ``per_edge_max`` events (default 600 = 2 evt/s × 300 s).
  This caps worst-case memory at roughly ``edge_count × per_edge_max ×
  ~200 B`` (~24 MB for 200 edges). Excess events overwrite oldest.
- **Eviction by age happens lazily on read.** A separate sweeper thread
  is unnecessary at this scale and would add a needless concurrency
  hazard. ``replay()`` and ``stats()`` both walk the buffer and discard
  events older than ``ttl_s``.
- **Thread-safe.** Producers come from at least three sources at
  runtime — the controller-host reader thread (raw MIDI via the
  ``midi:traffic`` topic), the engine-command dispatcher thread (B2),
  and any router callbacks. Consumers (the WS endpoint) are async on
  the FastAPI loop. We use a single ``threading.RLock`` and keep
  critical sections O(1) for ``append`` and O(events_for_edge) for
  ``replay`` / eviction.

Event shape
===========

Events are plain dicts (not dataclasses) so the WS endpoint can pass
them straight through to ``json.dumps``. The buffer enforces only the
keys it needs; extra keys are preserved verbatim. Callers should
include at minimum:

  - ``kind``: ``"raw"`` | ``"dispatched"``
  - ``source_node_id``: e.g. ``"device:alsa:24:0"``
  - ``target_node_id``: e.g. ``"mapping:alsa:24:0"``
  - ``ts_ms``: float epoch milliseconds (auto-filled if missing)
  - any extra payload (raw bytes, decoded MIDI, target name, etc.)
"""

from __future__ import annotations

import threading
import time
from collections import deque
from typing import Any, Callable, Iterable, Optional


# ----------------------------------------------------------------------
# MIDI clock + active-sense filter helper
# ----------------------------------------------------------------------

# Status bytes that the visualization defaults to dropping. These
# saturate the event rate (24 ppq × every channel) and overwhelm the
# rolling-rate metric without telling the operator anything they can
# act on. The frontend still has a toggle to re-enable them.
_NOISE_STATUS_BYTES = frozenset({0xF8, 0xFE})  # MIDI clock, active sense


def is_noise_event(event: dict[str, Any]) -> bool:
    """Return True for events the operator usually wants filtered.

    Looks at the canonical ``midi:traffic`` payload shape (raw_hex
    string, decoded.status byte) and at the simpler ``status_byte`` key
    that B2 callers may pass directly.
    """
    raw_hex = event.get("raw_hex")
    if isinstance(raw_hex, str) and len(raw_hex) >= 2:
        try:
            first = int(raw_hex[:2], 16)
            if first in _NOISE_STATUS_BYTES:
                return True
        except ValueError:
            pass
    decoded = event.get("decoded")
    if isinstance(decoded, dict):
        status = decoded.get("status")
        if isinstance(status, int) and status in _NOISE_STATUS_BYTES:
            return True
    status_byte = event.get("status_byte")
    if isinstance(status_byte, int) and status_byte in _NOISE_STATUS_BYTES:
        return True
    return False


# ----------------------------------------------------------------------
# Buffer
# ----------------------------------------------------------------------


class MidiTrafficBuffer:
    """Rolling-window per-edge traffic buffer.

    Thread-safe. ``append()`` is O(1). ``replay()`` is O(N) over the
    surviving events and also performs lazy eviction. Subscribers are
    notified synchronously on append so the WS endpoint can fan events
    out without polling — keep callbacks short.
    """

    DEFAULT_TTL_S: float = 300.0
    DEFAULT_PER_EDGE_MAX: int = 600

    def __init__(
        self,
        *,
        ttl_s: float = DEFAULT_TTL_S,
        per_edge_max: int = DEFAULT_PER_EDGE_MAX,
        clock_filter_default: bool = True,
        time_source: Callable[[], float] = time.time,
    ) -> None:
        if ttl_s <= 0:
            raise ValueError("ttl_s must be positive")
        if per_edge_max <= 0:
            raise ValueError("per_edge_max must be positive")
        self._ttl_s = ttl_s
        self._per_edge_max = per_edge_max
        self._clock_filter_default = bool(clock_filter_default)
        self._now = time_source
        self._lock = threading.RLock()
        # Per-edge ring buffer keyed on (source_node_id, target_node_id).
        # Each entry is a bounded deque; deque(maxlen=N).append is O(1)
        # and silently drops the oldest entry when full.
        self._edges: dict[tuple[str, str], deque[dict[str, Any]]] = {}
        # Live observers (WS sockets + tests). One callable per observer;
        # observers must not block. Exceptions are swallowed so a dead
        # socket cannot kill the producer thread.
        self._observers: list[Callable[[dict[str, Any]], None]] = []

    # ------------------------------------------------------------------
    # Producer side
    # ------------------------------------------------------------------

    def append(self, event: dict[str, Any]) -> None:
        """Record an event onto its edge's ring + notify observers.

        Required keys: ``source_node_id``, ``target_node_id``. Missing
        ones are dropped (the producer is responsible for resolving
        node ids from the topology). ``ts_ms`` is auto-filled from the
        injected time source if not present.
        """
        source = event.get("source_node_id")
        target = event.get("target_node_id")
        if not isinstance(source, str) or not isinstance(target, str):
            return

        # Make a shallow copy so producer mutations don't leak into the
        # buffer; the WS endpoint may post-process before serializing.
        out = dict(event)
        out.setdefault("ts_ms", self._now() * 1000.0)

        edge_key = (source, target)
        with self._lock:
            ring = self._edges.get(edge_key)
            if ring is None:
                ring = deque(maxlen=self._per_edge_max)
                self._edges[edge_key] = ring
            ring.append(out)
            observers = list(self._observers)

        # Notify outside the lock so observers can safely call back into
        # the buffer (defence against re-entrancy deadlocks).
        for observer in observers:
            try:
                observer(out)
            except Exception:  # noqa: BLE001 - never trust observers
                pass

    def append_many(self, events: Iterable[dict[str, Any]]) -> None:
        for event in events:
            self.append(event)

    # ------------------------------------------------------------------
    # Consumer side
    # ------------------------------------------------------------------

    def replay(
        self,
        *,
        include_noise: Optional[bool] = None,
    ) -> list[dict[str, Any]]:
        """Return all buffered events newer than ``ttl_s``, sorted by ts.

        ``include_noise``: if ``None``, defer to the buffer's default
        (clock filter on by default). Pass ``True`` to include MIDI
        clock + active sense, ``False`` to force them out.

        Side effect: evicts events older than ``ttl_s`` from each edge's
        ring. This is the only place eviction happens — keeps the
        producer path branch-free.
        """
        if include_noise is None:
            include_noise = not self._clock_filter_default

        cutoff_ms = (self._now() - self._ttl_s) * 1000.0
        snapshot: list[dict[str, Any]] = []

        with self._lock:
            empty_keys: list[tuple[str, str]] = []
            for edge_key, ring in self._edges.items():
                # Evict head while it's older than the cutoff.
                while ring and ring[0].get("ts_ms", 0.0) < cutoff_ms:
                    ring.popleft()
                if not ring:
                    empty_keys.append(edge_key)
                    continue
                for event in ring:
                    if not include_noise and is_noise_event(event):
                        continue
                    snapshot.append(event)
            for k in empty_keys:
                self._edges.pop(k, None)

        snapshot.sort(key=lambda e: e.get("ts_ms", 0.0))
        return snapshot

    def edge_count(self) -> int:
        """Number of edges with at least one buffered event (post-eviction)."""
        # Force eviction-on-read by calling replay() and discarding.
        self.replay(include_noise=True)
        with self._lock:
            return len(self._edges)

    def event_count(self) -> int:
        """Total events buffered across all edges (post-eviction)."""
        self.replay(include_noise=True)
        with self._lock:
            return sum(len(r) for r in self._edges.values())

    # ------------------------------------------------------------------
    # Observer side (used by the WS endpoint to receive live events)
    # ------------------------------------------------------------------

    def subscribe(
        self,
        observer: Callable[[dict[str, Any]], None],
    ) -> Callable[[], None]:
        with self._lock:
            self._observers.append(observer)

        def _unsubscribe() -> None:
            with self._lock:
                try:
                    self._observers.remove(observer)
                except ValueError:
                    pass

        return _unsubscribe

    # ------------------------------------------------------------------
    # Test seam
    # ------------------------------------------------------------------

    def reset(self) -> None:
        """Drop all buffered events and observers. Test-only."""
        with self._lock:
            self._edges.clear()
            self._observers.clear()


# ----------------------------------------------------------------------
# Process-wide singleton accessor
# ----------------------------------------------------------------------

_singleton: Optional[MidiTrafficBuffer] = None
_singleton_lock = threading.Lock()


def get_midi_visualization_buffer() -> MidiTrafficBuffer:
    """Return the process-wide buffer (lazy init)."""
    global _singleton
    if _singleton is None:
        with _singleton_lock:
            if _singleton is None:
                _singleton = MidiTrafficBuffer()
    return _singleton


def reset_midi_visualization_buffer_for_tests() -> None:
    """Drop the singleton so each test gets a fresh buffer."""
    global _singleton
    with _singleton_lock:
        _singleton = None
