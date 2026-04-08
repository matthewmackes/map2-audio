"""
Lock-free-style ring buffer for MIDI hot-path queues.

In CPython this implementation uses GIL-backed primitive operations for low
overhead. It avoids blocking waits and supports bounded capacity behavior for
real-time style pipelines.
"""

from __future__ import annotations

from dataclasses import dataclass
import threading
from typing import Generic, Iterable, Iterator, List, Optional, TypeVar


T = TypeVar("T")
_EMPTY = object()


@dataclass(frozen=True)
class RingBufferStats:
    capacity: int
    size: int
    dropped_writes: int
    overwritten_writes: int


class MidiRingBuffer(Generic[T]):
    """Bounded ring buffer with O(1) push/pop semantics.

    Concurrency contract:
    - safe for a single producer thread and a single consumer thread under the
      CPython GIL-backed mutation model used by the MIDI hub
    - not a general multi-producer or multi-consumer synchronization primitive
    - overwrite mode always drops the oldest queued item to preserve the newest
      incoming event in real-time pipelines
    """

    def __init__(self, capacity: int, *, overwrite_on_full: bool = False):
        if capacity <= 0:
            raise ValueError("capacity must be > 0")
        self._capacity = int(capacity)
        self._buf: List[object] = [_EMPTY] * self._capacity
        self._head = 0
        self._tail = 0
        self._size = 0
        self._dropped_writes = 0
        self._overwritten_writes = 0
        self._overwrite_on_full = bool(overwrite_on_full)
        self._lock = threading.Lock()

    @property
    def capacity(self) -> int:
        return self._capacity

    @property
    def overwrite_on_full(self) -> bool:
        return self._overwrite_on_full

    def __len__(self) -> int:
        with self._lock:
            return self._size

    def is_empty(self) -> bool:
        with self._lock:
            return self._size == 0

    def is_full(self) -> bool:
        with self._lock:
            return self._size >= self._capacity

    def clear(self) -> None:
        with self._lock:
            self._buf = [_EMPTY] * self._capacity
            self._head = 0
            self._tail = 0
            self._size = 0

    def _pop_unlocked(self) -> Optional[T]:
        if self._size <= 0:
            return None
        raw = self._buf[self._head]
        self._buf[self._head] = _EMPTY
        self._head = (self._head + 1) % self._capacity
        self._size -= 1
        return raw if raw is not _EMPTY else None

    def push(self, value: T) -> bool:
        """
        Push one value into the ring.

        Returns True if enqueued. Returns False when full and overwrite mode is
        disabled.
        """
        with self._lock:
            if self._size >= self._capacity:
                if not self._overwrite_on_full:
                    self._dropped_writes += 1
                    return False
                # Drop the oldest queued entry, then write the new value into the
                # newly freed tail slot so overwrite mode preserves the freshest
                # event instead of the stale head item.
                self._overwritten_writes += 1
                self._buf[self._head] = _EMPTY
                self._head = (self._head + 1) % self._capacity
                self._size -= 1

            self._buf[self._tail] = value
            self._tail = (self._tail + 1) % self._capacity
            self._size += 1
            return True

    def extend(self, values: Iterable[T]) -> int:
        """Push a sequence of values. Returns count successfully enqueued."""
        count = 0
        for value in values:
            if self.push(value):
                count += 1
        return count

    def pop(self) -> Optional[T]:
        """Pop one value from the ring, returning None when empty."""
        with self._lock:
            return self._pop_unlocked()

    def drain(self, max_items: Optional[int] = None) -> List[T]:
        """Pop up to `max_items` values (or all queued values)."""
        out: List[T] = []
        with self._lock:
            if max_items is None or max_items < 0:
                max_items = self._size
            remaining = min(int(max_items), self._size)
            for _ in range(remaining):
                raw = self._buf[self._head]
                self._buf[self._head] = _EMPTY
                self._head = (self._head + 1) % self._capacity
                self._size -= 1
                if raw is not _EMPTY:
                    out.append(raw)  # type: ignore[arg-type]
        return out

    def peek(self) -> Optional[T]:
        """Read the oldest value without popping it."""
        with self._lock:
            if self._size <= 0:
                return None
            raw = self._buf[self._head]
            return raw if raw is not _EMPTY else None  # type: ignore[return-value]

    def iter_snapshot(self) -> Iterator[T]:
        """Iterate current values in FIFO order without mutation."""
        with self._lock:
            snapshot = [
                self._buf[(self._head + idx) % self._capacity]
                for idx in range(self._size)
                if self._buf[(self._head + idx) % self._capacity] is not _EMPTY
            ]
        for raw in snapshot:
            yield raw  # type: ignore[misc]

    def stats(self) -> RingBufferStats:
        with self._lock:
            return RingBufferStats(
                capacity=self._capacity,
                size=self._size,
                dropped_writes=self._dropped_writes,
                overwritten_writes=self._overwritten_writes,
            )
