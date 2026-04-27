"""ControllerService — orchestrator for the controller subsystem.

Composes :class:`ProfileRegistry` (loads packs from disk) +
:class:`MappingRegistry` (live assignments) into one service surface
that FastAPI routes (:mod:`app.routes.devices`) consume.

Worklist: ``T2459-A3``.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from app.services.controllers.mapping_file_handler import (
    MappingDescriptor,
    MappingFileHandler,
    MappingLoadError,
)
from app.services.controllers.mapping_registry import MappingRegistry
from app.services.controllers.profile_registry import (
    DevicePack,
    DeviceProfile,
    ProfileRegistry,
    get_profile_registry,
)

logger = logging.getLogger(__name__)


class ControllerService:
    def __init__(
        self,
        profile_registry: ProfileRegistry | None = None,
        mapping_registry: MappingRegistry | None = None,
        mapping_file_handler: MappingFileHandler | None = None,
    ) -> None:
        self._profiles = profile_registry or get_profile_registry()
        self._mappings = mapping_registry or MappingRegistry()
        self._mapping_handler = mapping_file_handler or MappingFileHandler()

    # ------------------------------------------------------------------
    # Lifespan integration. Called from app.main lifespan.
    # ------------------------------------------------------------------

    def start(self) -> None:
        """Load every shipped pack. Safe to call from FastAPI lifespan
        startup; broken packs do not raise.
        """
        self._profiles.load_packs()
        loaded = len(self._profiles.packs())
        degraded = sum(1 for p in self._profiles.packs() if p.is_degraded)
        logger.info(
            "ControllerService started: %d packs loaded%s",
            loaded,
            f" ({degraded} degraded)" if degraded else "",
        )

    def stop(self) -> None:
        """Clear runtime mapping state. Pack catalog persists in memory."""
        # Snapshot active mappings before clearing for log telemetry.
        active = list(self._mappings.all())
        for mapping in active:
            self._mappings.clear(mapping.controller_key)

    # ------------------------------------------------------------------
    # Profile API — read-only views into the pack catalog.
    # ------------------------------------------------------------------

    def list_packs(self) -> list[dict[str, Any]]:
        return [self._pack_summary(p) for p in self._profiles.packs()]

    def list_profiles(self, kind: str | None = None) -> list[dict[str, Any]]:
        return [self._profile_summary(p) for p in self._profiles.profiles(kind=kind)]

    def get_profile(self, pack_id: str, model: str, kind: str) -> dict[str, Any] | None:
        for p in self._profiles.profiles(kind=kind):
            if p.pack_id == pack_id and p.model == model:
                return self._profile_summary(p, include_document=True)
        return None

    def resolve_for_hardware_id(self, hardware_id: str) -> list[dict[str, Any]]:
        return [
            self._profile_summary(p)
            for p in self._profiles.resolve_for_hardware_id(hardware_id)
        ]

    def resolve_for_alsa_card(self, card_name: str) -> list[dict[str, Any]]:
        return [
            self._profile_summary(p)
            for p in self._profiles.resolve_for_alsa_card(card_name)
        ]

    def resolve_for_alsa_client(self, client_name: str) -> list[dict[str, Any]]:
        return [
            self._profile_summary(p)
            for p in self._profiles.resolve_for_alsa_client(client_name)
        ]

    # ------------------------------------------------------------------
    # Mapping API — load + assign mappings to connected controllers.
    # ------------------------------------------------------------------

    def load_mapping(self, pack_id: str, model: str, kind: str) -> MappingDescriptor:
        """Load a mapping descriptor by pack/model/kind.

        Raises :class:`MappingLoadError` if the profile cannot be parsed
        or doesn't exist.
        """
        for profile in self._profiles.profiles(kind=kind):
            if profile.pack_id == pack_id and profile.model == model:
                if kind == "midi":
                    return self._mapping_handler.load_midi(
                        profile.path, profile.pack_id, profile.document,
                    )
                if kind == "hid":
                    return self._mapping_handler.load_hid(
                        profile.path, profile.pack_id, profile.document,
                    )
                raise MappingLoadError(f"unsupported mapping kind: {kind}")
        raise MappingLoadError(f"profile {pack_id}/{model}.{kind} not found")

    def assign_mapping(
        self, controller_key: str, descriptor: MappingDescriptor,
    ) -> None:
        self._mappings.assign(controller_key, descriptor)

    def clear_mapping(self, controller_key: str) -> None:
        self._mappings.clear(controller_key)

    def active_mappings(self) -> list[dict[str, Any]]:
        return [
            {
                "controller_key": m.controller_key,
                "pack_id": m.descriptor.pack_id,
                "model": m.descriptor.model,
                "kind": m.descriptor.kind,
                "control_count": len(m.descriptor.controls),
                "output_count": len(m.descriptor.outputs),
            }
            for m in self._mappings.all()
        ]

    # ------------------------------------------------------------------
    # Reload — operator GUI edits a pack on disk and triggers reload.
    # ------------------------------------------------------------------

    def reload_pack(self, pack_id: str) -> bool:
        return self._profiles.reload_pack(pack_id)

    # ------------------------------------------------------------------
    # Internal — summary serializers.
    # ------------------------------------------------------------------

    @staticmethod
    def _pack_summary(pack: DevicePack) -> dict[str, Any]:
        return {
            "pack_id": pack.pack_id,
            "vendor_name": pack.vendor_name,
            "models": list(pack.models),
            "profile_count": len(pack.profiles),
            "is_degraded": pack.is_degraded,
            "degraded_files": [str(p) for p in pack.degraded_files],
            "path": str(pack.path),
            "manifest": pack.manifest,
        }

    @staticmethod
    def _profile_summary(
        profile: DeviceProfile,
        include_document: bool = False,
    ) -> dict[str, Any]:
        out: dict[str, Any] = {
            "pack_id": profile.pack_id,
            "model": profile.model,
            "kind": profile.kind,
            "path": str(profile.path),
            "hardware_id": profile.hardware_id,
        }
        if profile.kind == "audio":
            identity = profile.document.get("identity", {}) or {}
            out["alsa_card_regex"] = identity.get("alsa_card_regex")
        if profile.kind == "midi":
            identity = profile.document.get("identity", {}) or {}
            out["alsa_client_pattern"] = identity.get("alsa_client_pattern")
        if include_document:
            out["document"] = profile.document
        return out


_service_singleton: ControllerService | None = None


def get_controller_service() -> ControllerService:
    """Return the process-wide :class:`ControllerService`."""
    global _service_singleton
    if _service_singleton is None:
        _service_singleton = ControllerService()
    return _service_singleton


def reset_controller_service_for_tests() -> None:
    """Test-only: clear the module-level singleton."""
    global _service_singleton
    _service_singleton = None
