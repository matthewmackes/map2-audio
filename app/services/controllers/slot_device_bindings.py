"""Brain slot ↔ Hardware Store profile_key binding map.

T2461-A2. A thin process-singleton holding the operator's
"this Brain slot is wired to this device" assertion. Both the
Brain ConsoleView and the Hardware Store DeviceCard read this
map to scope pulse animations and clip-warning chips to the
right partner.

The binding is purely a *display* hint — runtime audio routing
is unchanged. Persistence is in-memory only for now; the eventual
Brain library save flow can promote bindings into the saved
performance entry (T2461-A9 already added the connected_keys
snapshot field).

Worklist: T2461-A2.
"""

from __future__ import annotations

import dataclasses
import threading
import time
from typing import Iterable


@dataclasses.dataclass(frozen=True)
class SlotBinding:
    slot_id: int
    profile_key: str
    bound_at: float


class SlotDeviceBindings:
    """Process-singleton bidirectional map.

    A slot can have at most one bound profile_key; a profile_key can
    have at most one bound slot. Setting either side replaces any
    prior assignment on the partner.
    """

    def __init__(self) -> None:
        self._slot_to_key: dict[int, SlotBinding] = {}
        self._key_to_slot: dict[str, int] = {}
        self._lock = threading.RLock()

    # ----- write API -----------------------------------------------------

    def bind(self, slot_id: int, profile_key: str, *, now: float | None = None) -> SlotBinding:
        if slot_id < 0:
            raise ValueError(f"slot_id must be >= 0, got {slot_id}")
        if not profile_key:
            raise ValueError("profile_key cannot be empty")
        ts = now if now is not None else time.time()
        with self._lock:
            # Drop any prior binding on this slot or this key.
            if slot_id in self._slot_to_key:
                old_key = self._slot_to_key[slot_id].profile_key
                self._key_to_slot.pop(old_key, None)
            if profile_key in self._key_to_slot:
                old_slot = self._key_to_slot[profile_key]
                self._slot_to_key.pop(old_slot, None)
            binding = SlotBinding(slot_id=slot_id, profile_key=profile_key, bound_at=ts)
            self._slot_to_key[slot_id] = binding
            self._key_to_slot[profile_key] = slot_id
            return binding

    def unbind_slot(self, slot_id: int) -> bool:
        with self._lock:
            existing = self._slot_to_key.pop(slot_id, None)
            if existing is None:
                return False
            self._key_to_slot.pop(existing.profile_key, None)
            return True

    def unbind_profile(self, profile_key: str) -> bool:
        with self._lock:
            existing_slot = self._key_to_slot.pop(profile_key, None)
            if existing_slot is None:
                return False
            self._slot_to_key.pop(existing_slot, None)
            return True

    def clear(self) -> None:
        with self._lock:
            self._slot_to_key.clear()
            self._key_to_slot.clear()

    # ----- read API ------------------------------------------------------

    def slot_for_profile(self, profile_key: str) -> int | None:
        with self._lock:
            return self._key_to_slot.get(profile_key)

    def profile_for_slot(self, slot_id: int) -> str | None:
        with self._lock:
            binding = self._slot_to_key.get(slot_id)
            return binding.profile_key if binding else None

    def all_bindings(self) -> tuple[SlotBinding, ...]:
        with self._lock:
            return tuple(sorted(self._slot_to_key.values(), key=lambda b: b.slot_id))

    def has_slot(self, slot_id: int) -> bool:
        with self._lock:
            return slot_id in self._slot_to_key

    def has_profile(self, profile_key: str) -> bool:
        with self._lock:
            return profile_key in self._key_to_slot


# ---------------------------------------------------------------------------
# Singleton accessor
# ---------------------------------------------------------------------------

_singleton: SlotDeviceBindings | None = None
_singleton_lock = threading.Lock()


def get_slot_device_bindings() -> SlotDeviceBindings:
    global _singleton
    with _singleton_lock:
        if _singleton is None:
            _singleton = SlotDeviceBindings()
        return _singleton


def reset_slot_device_bindings_for_tests() -> SlotDeviceBindings:
    global _singleton
    with _singleton_lock:
        _singleton = SlotDeviceBindings()
        return _singleton
