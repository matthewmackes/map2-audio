"""
Lock-free-style ring buffer for MIDI hot-path queues.

In CPython this implementation uses GIL-backed primitive operations for low
overhead. It avoids blocking waits and supports bounded capacity behavior for
real-time style pipelines.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Generic, Iterable, Iterator, List, Optional, TypeVar


T = TypeVar("T")


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
        self._buf: List[Optional[T]] = [None] * self._capacity
        self._head = 0
        self._tail = 0
        self._size = 0
        self._dropped_writes = 0
        self._overwritten_writes = 0
        self._overwrite_on_full = bool(overwrite_on_full)

    @property
    def capacity(self) -> int:
        return self._capacity

    @property
    def overwrite_on_full(self) -> bool:
        return self._overwrite_on_full

    def __len__(self) -> int:
        return self._size

    def is_empty(self) -> bool:
        return self._size == 0

    def is_full(self) -> bool:
        return self._size >= self._capacity

    def clear(self) -> None:
        self._buf = [None] * self._capacity
        self._head = 0
        self._tail = 0
        self._size = 0

    def push(self, value: T) -> bool:
        """
        Push one value into the ring.

        Returns True if enqueued. Returns False when full and overwrite mode is
        disabled.
        """
        if self._size >= self._capacity:
            if not self._overwrite_on_full:
                self._dropped_writes += 1
                return False
            # Drop the oldest queued entry, then write the new value into the
            # newly freed tail slot so overwrite mode preserves the freshest
            # event instead of the stale head item.
            self._overwritten_writes += 1
            self._buf[self._head] = None
            self._head = (self._head + 1) % self._capacity
            self._buf[self._tail] = value
            self._tail = (self._tail + 1) % self._capacity
            return True

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
        if self._size <= 0:
            return None
        value = self._buf[self._head]
        self._buf[self._head] = None
        self._head = (self._head + 1) % self._capacity
        self._size -= 1
        return value

    def drain(self, max_items: Optional[int] = None) -> List[T]:
        """Pop up to `max_items` values (or all queued values)."""
        if max_items is None or max_items < 0:
            max_items = self._size
        out: List[T] = []
        remaining = min(int(max_items), self._size)
        for _ in range(remaining):
            value = self.pop()
            if value is not None:
                out.append(value)
        return out

    def peek(self) -> Optional[T]:
        """Read the oldest value without popping it."""
        if self._size <= 0:
            return None
        return self._buf[self._head]

    def iter_snapshot(self) -> Iterator[T]:
        """Iterate current values in FIFO order without mutation."""
        for idx in range(self._size):
            raw = self._buf[(self._head + idx) % self._capacity]
            if raw is not None:
                yield raw

    def stats(self) -> RingBufferStats:
        return RingBufferStats(
            capacity=self._capacity,
            size=self._size,
            dropped_writes=self._dropped_writes,
            overwritten_writes=self._overwritten_writes,
        )
