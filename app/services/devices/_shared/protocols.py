"""Configurator framework protocols.

Each device-pack that wants to participate in the Configurator wizard
implements one or more of these Protocols and registers against
``DeviceConfiguratorRegistry``. The Protocols are intentionally narrow
so a device can opt in to just the parts that apply (e.g. a controller
with no firmware path can skip ``ConfigInstaller``).

Status, presence, and event types are concrete dataclasses so callers
can serialize them over HTTP without each device re-defining the
shape.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Iterator, Mapping, Optional, Protocol, runtime_checkable


class DevicePresence(str, Enum):
    """Coarse presence states a detector returns."""

    NOT_PRESENT = "not_present"
    PRESENT_STOCK = "present_stock"
    PRESENT_CUSTOM = "present_custom"
    PRESENT_BOOTLOADER = "present_bootloader"
    PRESENT_UNKNOWN = "present_unknown"

    @property
    def is_present(self) -> bool:
        return self is not DevicePresence.NOT_PRESENT

    @property
    def is_recognised(self) -> bool:
        return self in (
            DevicePresence.PRESENT_STOCK,
            DevicePresence.PRESENT_CUSTOM,
            DevicePresence.PRESENT_BOOTLOADER,
        )


@dataclass(frozen=True)
class DeviceDetectionStatus:
    """Result of probing for a specific device-pack on this host."""

    pack_id: str
    presence: DevicePresence
    transport: str  # e.g. "usb-sysfs", "alsa-seq", "midi-virtual"
    serial: Optional[str] = None
    raw: Mapping[str, Any] = field(default_factory=dict)
    """Device-specific descriptor fields (vendor/product IDs, paths, etc.)."""


@runtime_checkable
class DeviceDetector(Protocol):
    """Probe whether a device for this pack is connected and what mode it is in.

    Detectors must be side-effect free: read-only descriptor lookups,
    no MIDI traffic, no firmware mutation. Detection is invoked
    repeatedly from polling UIs and must be cheap.
    """

    def detect(self) -> DeviceDetectionStatus: ...


@dataclass
class DeviceDiscoverySession:
    """Mutable state for a discovery wizard session.

    The framework owns session lifecycle (start/cancel/complete); the
    device-specific ``DeviceDiscoverer`` owns the per-event handler
    and the prompt sequence.
    """

    session_id: str
    pack_id: str
    started_at_utc: str
    is_complete: bool = False
    is_cancelled: bool = False
    current_step: Optional[str] = None
    progress: tuple[int, int] = (0, 0)  # (completed, total)
    captured: dict[str, Any] = field(default_factory=dict)
    """Device-specific captured bindings, keyed by control identifier."""


@runtime_checkable
class DeviceDiscoverer(Protocol):
    """Drive an interactive wizard that captures the device's current
    configuration (e.g. which CCs/PCs each control emits today)."""

    def start(self, *, session_id: str) -> DeviceDiscoverySession: ...

    def feed_event(
        self, session: DeviceDiscoverySession, event: Mapping[str, Any]
    ) -> DeviceDiscoverySession: ...

    def skip(self, session: DeviceDiscoverySession) -> DeviceDiscoverySession: ...

    def cancel(self, session: DeviceDiscoverySession) -> DeviceDiscoverySession: ...


@runtime_checkable
class OverrideStore(Protocol):
    """Persist per-installation overrides on top of device-pack defaults.

    Implementations must:
      - write atomically (temp file + os.replace)
      - tolerate missing files (return ``None`` from ``load``)
      - validate a ``schema_version`` on load and raise on incompatible
        versions rather than silently mis-merging.
    """

    def path(self) -> str: ...

    def load(self) -> Optional[Mapping[str, Any]]: ...

    def save(self, payload: Mapping[str, Any]) -> str: ...

    def delete(self) -> bool: ...


class ConfigInstallPhase(str, Enum):
    """Phases reported during firmware/config install."""

    PRE_CHECK = "pre_check"
    INSTALLING = "installing"
    POST_CHECK = "post_check"
    SUCCESS = "success"
    FAILED = "failed"

    @property
    def is_terminal(self) -> bool:
        return self in (ConfigInstallPhase.SUCCESS, ConfigInstallPhase.FAILED)


@dataclass(frozen=True)
class ConfigInstallEvent:
    """One event emitted during install (pre-check / progress / terminal)."""

    phase: ConfigInstallPhase
    message: str
    progress_pct: Optional[int] = None
    error: Optional[str] = None


@runtime_checkable
class ConfigInstaller(Protocol):
    """Optional: install firmware or push device config (DFU, SysEx, file
    copy, ...). Devices that only need MIDI Learn binding skip this
    entirely."""

    def install(
        self, request: Mapping[str, Any]
    ) -> Iterator[ConfigInstallEvent]: ...


@dataclass(frozen=True)
class BindingPushResult:
    """Result of pushing the operator's chosen bindings into the
    canonical MIDI Services binding authority."""

    pushed: int
    binding_ids: tuple[str, ...] = ()
    skipped: tuple[str, ...] = ()


@runtime_checkable
class BindingPusher(Protocol):
    """Write the operator's chosen bindings to the canonical
    ``consumer_type=brain_slot`` binding authority. Implementations
    must be idempotent: calling ``push`` with the same payload twice
    must not produce duplicate bindings."""

    def push(self, bindings: Mapping[str, Any]) -> BindingPushResult: ...


# ---------------------------------------------------------------------------
# T2499 Phase 0.2 — generic Learn event source
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class DeviceLearnEventSnapshot:
    """One observation of a Learn event in the canonical wire shape.

    The frontend `DeviceLearnEvent` discriminated union (see
    ``web/src/app/components/DeviceConfigurator/types.ts``) maps
    1:1 onto this dataclass when serialised. The ``event`` field is
    free-form so each pack can include its kind-specific payload
    (MIDI cc/channel/data1, HID control_id/value, AVDECC
    descriptor_type/index/value_change) without the framework
    needing to enumerate them.
    """

    sequence: int
    """Monotonic counter incremented on each new observation. The
    polling subscriber anchors on the value at subscribe time and
    emits exactly once when a strictly larger sequence is observed."""

    observed_at: Optional[float] = None
    """Unix wall-clock timestamp (seconds) when the event was observed."""

    event: Optional[Mapping[str, Any]] = None
    """Canonical event shape (kind: 'midi'|'hid'|'avdecc', plus
    kind-specific fields). None until the pack has observed any event."""


@runtime_checkable
class LearnEventSource(Protocol):
    """Expose the most recent Learn event observed by a pack.

    Each Configurator pack that wants the framework Learn module to
    capture its events implements this protocol. The framework polls
    ``last_event()`` over HTTP via
    ``GET /api/devices/configurator/{pack_id}/learn/last-event`` and
    forwards the result to the Learn module's polling subscriber.

    Implementations must be cheap (the route is polled at ~250 ms)
    and must keep ``sequence`` strictly monotonic across observations.
    """

    def last_event(self) -> DeviceLearnEventSnapshot: ...
