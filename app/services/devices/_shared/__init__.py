"""Shared Configurator framework for per-device onboarding.

This package extracts the five primitives common to every device-pack
Configurator (detection / discovery / override / install / push) into
reusable Protocols + concrete helpers. Device-specific implementations
register against this framework rather than each ship its own ad-hoc
configurator surface.

The reference implementation under
``app.services.devices.meloaudio`` predates the framework; once a
device's primitives are wired through the registry, the framework
becomes its single integration point with the rest of the platform.
"""

from .protocols import (
    BindingPushResult,
    BindingPusher,
    ConfigInstallEvent,
    ConfigInstallPhase,
    ConfigInstaller,
    DeviceDetectionStatus,
    DeviceDetector,
    DeviceDiscoverer,
    DeviceDiscoverySession,
    DevicePresence,
    OverrideStore,
)
from .override_store import YamlOverrideStore
from .registry import (
    ConfiguratorRegistration,
    DeviceConfiguratorRegistry,
    get_default_registry,
)

__all__ = [
    "BindingPushResult",
    "BindingPusher",
    "ConfigInstallEvent",
    "ConfigInstallPhase",
    "ConfigInstaller",
    "ConfiguratorRegistration",
    "DeviceConfiguratorRegistry",
    "DeviceDetectionStatus",
    "DeviceDetector",
    "DeviceDiscoverer",
    "DeviceDiscoverySession",
    "DevicePresence",
    "OverrideStore",
    "YamlOverrideStore",
    "get_default_registry",
]
