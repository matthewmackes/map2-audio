"""Configurator framework registry.

Each device-pack registers a ``ConfiguratorRegistration`` keyed by
``pack_id``. The registry is the single seam between framework callers
(routes, wizard UI, deep-config tabs) and per-device implementations.

Registration is opt-in per primitive: a simple controller that only
needs MIDI Learn binding can register a ``DeviceDetector`` and a
``BindingPusher`` and leave the rest ``None``.
"""
from __future__ import annotations

import threading
from dataclasses import dataclass, field
from typing import Mapping, Optional

from .protocols import (
    BindingPusher,
    ConfigInstaller,
    DeviceDetector,
    DeviceDiscoverer,
    OverrideStore,
)


@dataclass(frozen=True)
class ConfiguratorRegistration:
    """One device-pack's contribution to the framework.

    All five primitive slots are optional. The framework reports which
    primitives are available so the UI can hide flows the device does
    not support (e.g. no firmware install button when ``installer is
    None``).
    """

    pack_id: str
    display_name: str
    detector: Optional[DeviceDetector] = None
    discoverer: Optional[DeviceDiscoverer] = None
    override_store: Optional[OverrideStore] = None
    installer: Optional[ConfigInstaller] = None
    pusher: Optional[BindingPusher] = None
    metadata: Mapping[str, object] = field(default_factory=dict)
    """Free-form pack metadata (vendor, links, custom UI tab routes)."""

    @property
    def supported_primitives(self) -> tuple[str, ...]:
        names: list[str] = []
        if self.detector is not None:
            names.append("detection")
        if self.discoverer is not None:
            names.append("discovery")
        if self.override_store is not None:
            names.append("override")
        if self.installer is not None:
            names.append("install")
        if self.pusher is not None:
            names.append("push")
        return tuple(names)


class DeviceConfiguratorRegistry:
    """Thread-safe in-memory registry.

    Tests should construct a fresh registry rather than mutate the
    default singleton.
    """

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._registrations: dict[str, ConfiguratorRegistration] = {}

    def register(self, registration: ConfiguratorRegistration) -> None:
        if not registration.pack_id or not registration.pack_id.strip():
            raise ValueError("registration.pack_id must be a non-empty string")
        with self._lock:
            existing = self._registrations.get(registration.pack_id)
            if existing is not None and existing is not registration:
                raise ValueError(
                    f"pack_id {registration.pack_id!r} is already registered; "
                    "call unregister() first to replace it",
                )
            self._registrations[registration.pack_id] = registration

    def unregister(self, pack_id: str) -> bool:
        with self._lock:
            return self._registrations.pop(pack_id, None) is not None

    def get(self, pack_id: str) -> Optional[ConfiguratorRegistration]:
        with self._lock:
            return self._registrations.get(pack_id)

    def list(self) -> tuple[ConfiguratorRegistration, ...]:
        with self._lock:
            return tuple(
                sorted(self._registrations.values(), key=lambda r: r.pack_id),
            )

    def __contains__(self, pack_id: object) -> bool:
        if not isinstance(pack_id, str):
            return False
        with self._lock:
            return pack_id in self._registrations

    def __len__(self) -> int:
        with self._lock:
            return len(self._registrations)


_DEFAULT_REGISTRY: Optional[DeviceConfiguratorRegistry] = None
_DEFAULT_LOCK = threading.Lock()


def get_default_registry() -> DeviceConfiguratorRegistry:
    """Process-wide singleton registry. Safe for first-call init from
    multiple threads."""
    global _DEFAULT_REGISTRY
    if _DEFAULT_REGISTRY is not None:
        return _DEFAULT_REGISTRY
    with _DEFAULT_LOCK:
        if _DEFAULT_REGISTRY is None:
            _DEFAULT_REGISTRY = DeviceConfiguratorRegistry()
        return _DEFAULT_REGISTRY
