"""
T2491-5 — Milan v1.2 §5 MVU (Milan Vendor Unique) capabilities surface.

Projects the four Milan MVU commands operators care about into a
plain Python interface so the `/avb/network` UI (T2490-9) and the
AVnu Milan Test Suite (T2491-13) can consume them through the
canonical REST envelope.

The four MVU commands per Milan v1.2 §5:
- `GET_MILAN_INFO`               — device's protocol version, certified
                                    feature flags, device profile (talker
                                    / listener / talker-listener)
- `GET_SYSTEM_UNIQUE_ID`         — 64-bit Milan-clock-domain identifier
                                    used to namespace Milan-only ACMP
                                    connections from generic 1722.1
- `SET_SYSTEM_UNIQUE_ID`         — operator-driven write to migrate a
                                    device into a different Milan domain
- `GET_MEDIA_CLOCK_REFERENCE_INFO` — per-port media clock priority,
                                    domain class, recovered-clock state

When the JUCE engine + la_avdecc + the bench AVDECC peer are
available, MilanCapabilitiesProvider proxies through the C++
`AvdeccController::getMilanInfo()` / `getSystemUniqueId()` / etc.
helpers (T2491-5 hardware path). When unavailable (typical
development environment without an AVB switch), the provider
returns an `available: False` envelope with a clear "engine not
available" reason rather than silently failing — operators see
honest state instead of fake data.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class MilanInfo:
    """Result of `GET_MILAN_INFO` (Milan v1.2 §5.1)."""

    protocol_version: str
    feature_flags: List[str] = field(default_factory=list)
    certification_version: Optional[str] = None
    device_profile: str = "unknown"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "protocol_version": self.protocol_version,
            "feature_flags": list(self.feature_flags),
            "certification_version": self.certification_version,
            "device_profile": self.device_profile,
        }


@dataclass(frozen=True)
class SystemUniqueId:
    """Result of `GET_SYSTEM_UNIQUE_ID` (Milan v1.2 §5.2). 64-bit
    identifier rendered as a hex string for the REST surface."""

    value: str  # "0x" + 16 hex digits

    def to_dict(self) -> Dict[str, Any]:
        return {"value": self.value}


@dataclass(frozen=True)
class MediaClockReferenceInfo:
    """Result of `GET_MEDIA_CLOCK_REFERENCE_INFO` (Milan v1.2 §5.4).

    One record per AVB Interface Descriptor on the entity. Mirrors the
    fields the AVnu Milan Test Suite (MTS) verifies.
    """

    interface_index: int
    priority: int  # 0–255
    domain_class: str  # "Class A" | "Class B" | "Class CRF"
    recovered_clock_state: str  # "locked" | "unlocked" | "transitioning"
    grandmaster_id: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "interface_index": self.interface_index,
            "priority": self.priority,
            "domain_class": self.domain_class,
            "recovered_clock_state": self.recovered_clock_state,
            "grandmaster_id": self.grandmaster_id,
        }


class MilanCapabilitiesProvider:
    """Single source of truth for Milan MVU surface readiness.

    Resolves the live JUCE engine controller (la_avdecc-backed) on
    every call so a hot-reload / engine restart picks up automatically.
    Honest-state semantics: when the engine controller is unavailable
    (development environment without an AVB switch), every getter
    returns None and the operator surface renders an
    `available: False` envelope.
    """

    def __init__(self) -> None:
        pass

    def _resolve_controller(self) -> Optional[Any]:
        """Best-effort lookup of the live AVDECC controller. Returns
        None when the engine isn't running or la_avdecc support is
        missing. The C++ `Map2AvdeccController` exposes the four MVU
        helpers through pybind11 in T2491-5's hardware-side slice."""
        try:
            from app.services.juce_engine_service import (  # type: ignore
                get_juce_engine,
            )

            engine = get_juce_engine()
        except Exception:
            return None
        if engine is None:
            return None
        controller = getattr(engine, "avdecc_controller", None) or getattr(
            engine, "get_avdecc_controller", None
        )
        if callable(controller):
            try:
                controller = controller()
            except Exception:  # noqa: BLE001
                controller = None
        return controller

    def is_available(self) -> bool:
        return self._resolve_controller() is not None

    def get_milan_info(self, entity_id: str) -> Optional[MilanInfo]:
        controller = self._resolve_controller()
        if controller is None:
            return None
        getter = getattr(controller, "get_milan_info", None)
        if not callable(getter):
            return None
        try:
            raw = getter(entity_id)
        except Exception as exc:  # noqa: BLE001
            logger.warning("get_milan_info(%s) raised: %s", entity_id, exc)
            return None
        if raw is None:
            return None
        if isinstance(raw, MilanInfo):
            return raw
        if not isinstance(raw, dict):
            return None
        return MilanInfo(
            protocol_version=str(raw.get("protocol_version", "1.2")),
            feature_flags=[str(f) for f in (raw.get("feature_flags") or [])],
            certification_version=raw.get("certification_version"),
            device_profile=str(raw.get("device_profile", "unknown")),
        )

    def get_system_unique_id(self, entity_id: str) -> Optional[SystemUniqueId]:
        controller = self._resolve_controller()
        if controller is None:
            return None
        getter = getattr(controller, "get_system_unique_id", None)
        if not callable(getter):
            return None
        try:
            raw = getter(entity_id)
        except Exception as exc:  # noqa: BLE001
            logger.warning("get_system_unique_id(%s) raised: %s", entity_id, exc)
            return None
        if raw is None:
            return None
        if isinstance(raw, SystemUniqueId):
            return raw
        if isinstance(raw, int):
            return SystemUniqueId(value=f"0x{raw:016x}")
        if isinstance(raw, str):
            return SystemUniqueId(value=raw)
        return None

    def set_system_unique_id(self, entity_id: str, new_value: int) -> bool:
        controller = self._resolve_controller()
        if controller is None:
            return False
        setter = getattr(controller, "set_system_unique_id", None)
        if not callable(setter):
            return False
        try:
            return bool(setter(entity_id, int(new_value)))
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "set_system_unique_id(%s, %#x) raised: %s",
                entity_id,
                new_value,
                exc,
            )
            return False

    def get_media_clock_reference_info(
        self, entity_id: str
    ) -> Optional[List[MediaClockReferenceInfo]]:
        controller = self._resolve_controller()
        if controller is None:
            return None
        getter = getattr(controller, "get_media_clock_reference_info", None)
        if not callable(getter):
            return None
        try:
            raw = getter(entity_id)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "get_media_clock_reference_info(%s) raised: %s",
                entity_id,
                exc,
            )
            return None
        if raw is None:
            return None
        results: List[MediaClockReferenceInfo] = []
        for entry in raw or []:
            if isinstance(entry, MediaClockReferenceInfo):
                results.append(entry)
                continue
            if not isinstance(entry, dict):
                continue
            results.append(
                MediaClockReferenceInfo(
                    interface_index=int(entry.get("interface_index", 0)),
                    priority=int(entry.get("priority", 0)),
                    domain_class=str(entry.get("domain_class", "Class A")),
                    recovered_clock_state=str(
                        entry.get("recovered_clock_state", "unknown")
                    ),
                    grandmaster_id=entry.get("grandmaster_id"),
                )
            )
        return results


_singleton: Optional[MilanCapabilitiesProvider] = None


def get_milan_capabilities() -> MilanCapabilitiesProvider:
    global _singleton
    if _singleton is None:
        _singleton = MilanCapabilitiesProvider()
    return _singleton
