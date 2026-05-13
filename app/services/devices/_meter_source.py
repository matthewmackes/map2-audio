"""Generic per-device peak-dBFS meter source primitive.

Background: T2515-Follow-up-METER-WIRE introduced an injection seam at
``app/services/devices/tascam_us144mkii_meters.py`` so the
``/api/v1/devices/tascam-us144mkii/meters`` route reads through a
swappable ``TascamMeterSource`` rather than inlining its placeholder
payload. The shape was deliberately Tascam-specific in run-9.

Order-2 of the ninth Continue run handoff asked to generalize that
seam so future devices (UA-1000, Hotone JoGG, MPX-1) can reuse the
same plumbing without copy-pasting four near-identical modules. This
file is the result.

Architecture:

  - One ``MeterSnapshot`` dataclass + ``MeterSource`` Protocol carry
    the shape for every device.
  - ``DeviceMeterSourceRegistry`` owns per-device singleton seams
    keyed by ``device_id``. A device-scoped facade module
    (``tascam_us144mkii_meters.py``,
    ``edirol_ua1000_meters.py``, …) is just a thin wrapper that
    binds a ``device_id`` + default channel counts + module-level
    free functions on top of the registry. Callers see no API
    change.
  - The route handler still calls ``read_snapshot()`` (now bound to
    the device's facade) and awaits the result — sync sources return
    a ``MeterSnapshot`` directly, async sources return a coroutine.

Naming: this module is private (`_meter_source`) because the device
facades are the public seam. New device routes import their facade
module, not this primitive.
"""

from __future__ import annotations

import inspect
from dataclasses import dataclass, field
from threading import Lock
from typing import Awaitable, Dict, List, Optional, Protocol, Tuple, runtime_checkable


SILENCE_DBFS = -150.0
"""Sentinel value indicating "no measurement yet".

Device React panels render any value at or below -149.9 dB as an
em-dash; -150.0 falls cleanly below that threshold across rounding
edges. Sentinel value is shared across all devices so a single
frontend helper (`formatPeakDb`) can interpret every device's meters.
"""


@dataclass(frozen=True)
class MeterSnapshot:
    """One snapshot of per-channel peak dBFS for a device.

    ``input_peak_db[i]`` is the peak dBFS observed on input channel
    ``i`` since the most recent ``MeterSource.snapshot()`` call (or
    similar reset boundary — implementations decide). ``source`` is
    ``"engine"`` for a measured snapshot or ``"placeholder"`` when the
    source is the silence fallback. The route surfaces this field so
    the Carbon panel can label the row differently when measurements
    aren't live yet.
    """

    input_peak_db: List[float] = field(default_factory=list)
    output_peak_db: List[float] = field(default_factory=list)
    source: str = "placeholder"


@runtime_checkable
class MeterSource(Protocol):
    """Implementations supply peak dBFS for a single device.

    The route handler calls ``snapshot()`` and awaits the result if
    it's an awaitable, so concrete implementations can be sync
    (returning a ``MeterSnapshot`` directly) or async (returning a
    coroutine that yields one). This keeps the seam friendly to both
    a thread-shared atomic ring buffer reader (sync, microseconds) and
    an IPC roundtrip to the engine (async, fractional ms).
    """

    def snapshot(self) -> "MeterSnapshot | Awaitable[MeterSnapshot]":
        ...


class PlaceholderMeterSource:
    """Default source — emits the silence sentinel for every channel.

    Constructor takes the channel counts so any device layout can
    reuse the same placeholder shape. Device facades typically pass
    canonical counts from their device-pack profile.
    """

    def __init__(self, input_channels: int, output_channels: int) -> None:
        self._input_channels = int(input_channels)
        self._output_channels = int(output_channels)

    def snapshot(self) -> MeterSnapshot:
        return MeterSnapshot(
            input_peak_db=[SILENCE_DBFS] * self._input_channels,
            output_peak_db=[SILENCE_DBFS] * self._output_channels,
            source="placeholder",
        )


@dataclass
class _DeviceBinding:
    """Per-device entry in the registry.

    Stores the default channel layout (so the registry knows how to
    construct a placeholder if no source is installed) and the
    currently-installed source instance (None means "fall back to
    placeholder").
    """

    input_channels: int
    output_channels: int
    source: Optional[MeterSource] = None


class DeviceMeterSourceRegistry:
    """Process-global registry of per-device meter sources.

    Implements the same install / read / reset semantics that the
    Tascam-specific module shipped in run 9, but keyed by device_id
    so every device can ride the same plumbing.

    Thread safety: writes (register / set / reset) take a small lock.
    Reads (get / read_snapshot) are read-then-call sequences; the
    snapshot itself runs without holding the lock so a slow IPC call
    does not block other devices.
    """

    def __init__(self) -> None:
        self._bindings: Dict[str, _DeviceBinding] = {}
        self._lock = Lock()

    def register_device(
        self,
        device_id: str,
        *,
        input_channels: int,
        output_channels: int,
    ) -> None:
        """Declare a device with its canonical channel counts.

        Calling ``register_device`` twice with the same ``device_id``
        is allowed and overwrites the channel counts but preserves
        any installed source. This lets the device facade module
        re-register at import time without clobbering a source
        installed earlier in process startup.
        """
        with self._lock:
            existing = self._bindings.get(device_id)
            preserved_source = existing.source if existing is not None else None
            self._bindings[device_id] = _DeviceBinding(
                input_channels=int(input_channels),
                output_channels=int(output_channels),
                source=preserved_source,
            )

    def _binding_or_raise(self, device_id: str) -> _DeviceBinding:
        binding = self._bindings.get(device_id)
        if binding is None:
            raise KeyError(
                f"device {device_id!r} is not registered with the meter-source registry"
            )
        return binding

    def set_active_source(
        self,
        device_id: str,
        source: Optional[MeterSource],
    ) -> None:
        with self._lock:
            binding = self._binding_or_raise(device_id)
            binding.source = source

    def reset_active_source(self, device_id: str) -> None:
        self.set_active_source(device_id, None)

    def get_active_source(self, device_id: str) -> MeterSource:
        """Return the installed source, or a fresh placeholder.

        A placeholder is constructed on each call (not memoized) so
        tests that mutate channel counts via ``register_device`` see
        the new layout immediately, and so test teardown doesn't have
        to know which placeholder instance was handed out earlier.
        """
        with self._lock:
            binding = self._binding_or_raise(device_id)
            if binding.source is not None:
                return binding.source
            return PlaceholderMeterSource(
                input_channels=binding.input_channels,
                output_channels=binding.output_channels,
            )

    async def read_snapshot(self, device_id: str) -> MeterSnapshot:
        """Resolve the active source's ``snapshot()`` to a concrete value.

        Awaitable-aware: synchronous sources return ``MeterSnapshot``
        directly; async sources return a coroutine the registry
        awaits. Routes call this one-liner.
        """
        source = self.get_active_source(device_id)
        result = source.snapshot()
        if inspect.isawaitable(result):
            return await result
        return result

    def list_devices(self) -> List["DeviceRegistration"]:
        """Snapshot of every registered device.

        Returns the device_id, declared channel counts, and whether
        an engine-backed source is currently installed (vs the
        fallback placeholder). Ordered alphabetically by device_id
        so UI consumers get a stable, deterministic enumeration
        without needing to sort themselves.
        """
        with self._lock:
            items: List[Tuple[str, _DeviceBinding]] = sorted(self._bindings.items())
        return [
            DeviceRegistration(
                device_id=device_id,
                input_channels=binding.input_channels,
                output_channels=binding.output_channels,
                has_engine_source=binding.source is not None,
            )
            for device_id, binding in items
        ]


@dataclass(frozen=True)
class DeviceRegistration:
    """Public read-only view of one entry in the device registry.

    Returned by ``DeviceMeterSourceRegistry.list_devices()``. UI
    consumers can use ``has_engine_source`` to render a quick
    "wired-up" indicator without polling each device's snapshot.
    """

    device_id: str
    input_channels: int
    output_channels: int
    has_engine_source: bool


# ---------------------------------------------------------------------------
# Process-global singleton registry.
#
# The device facade modules bind to this instance at import time. Tests
# that want pristine isolation reach in via the device-scoped helpers
# (which forward to this singleton); the registry itself is intentionally
# not test-scoped because the module-import side effects from the facade
# files must survive across pytest sessions.
# ---------------------------------------------------------------------------

_registry = DeviceMeterSourceRegistry()


def get_registry() -> DeviceMeterSourceRegistry:
    """Module-level accessor — used by device facade modules and tests."""
    return _registry
