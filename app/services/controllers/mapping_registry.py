"""MappingRegistry — active mapping descriptors per connected controller.

Holds the live association between a connected controller (identified
by ``hardware_id`` or ``alsa_client_pattern``) and the
:class:`MappingDescriptor` currently driving it. The
:class:`ControllerService` consults this registry on every controller-
host event arrival.

Worklist: ``T2459-A3``.
"""

from __future__ import annotations

import dataclasses
import logging
import threading
from typing import Iterable

from app.services.controllers.mapping_file_handler import MappingDescriptor

logger = logging.getLogger(__name__)


@dataclasses.dataclass(frozen=True)
class ActiveMapping:
    """Pairs a runtime controller identity with a loaded mapping."""

    controller_key: str  # canonical hardware_id or "alsa-seq:<client>:<port>"
    descriptor: MappingDescriptor


class MappingRegistry:
    """Process-wide registry of active mappings.

    Thread-safe — controller-host events arrive on whatever thread the
    backend assigns to the IPC reader, so the registry uses an internal
    lock for assignment + lookup.
    """

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._active: dict[str, ActiveMapping] = {}

    def assign(self, controller_key: str, descriptor: MappingDescriptor) -> None:
        with self._lock:
            self._active[controller_key] = ActiveMapping(
                controller_key=controller_key,
                descriptor=descriptor,
            )
        logger.info(
            "MappingRegistry: assigned %s → %s/%s",
            controller_key, descriptor.pack_id, descriptor.model,
        )

    def clear(self, controller_key: str) -> None:
        with self._lock:
            removed = self._active.pop(controller_key, None)
        if removed is not None:
            logger.info("MappingRegistry: cleared %s", controller_key)

    def get(self, controller_key: str) -> ActiveMapping | None:
        with self._lock:
            return self._active.get(controller_key)

    def all(self) -> tuple[ActiveMapping, ...]:
        with self._lock:
            return tuple(self._active.values())

    def __len__(self) -> int:
        with self._lock:
            return len(self._active)

    def __contains__(self, controller_key: str) -> bool:
        with self._lock:
            return controller_key in self._active
