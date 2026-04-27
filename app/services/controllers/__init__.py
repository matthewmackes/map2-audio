"""Controllers / Mapping / Device-Pack subsystem — Python service layer.

T2459-A3 Phase A foundation. This package owns:

- :mod:`profile_registry`: walks ``device-packs/`` at backend startup,
  validates every YAML against schema, and exposes the resolved profiles
  to the rest of the platform via :class:`ProfileRegistry`. Broken packs
  are logged and skipped — they MUST NOT block backend boot
  (CLAUDE.md gotcha; matches the AVB Install Defaults Drift posture).

- :mod:`mapping_registry`: holds active mapping descriptors per
  connected controller. Bridges between :class:`ProfileRegistry` and the
  ``map2-controller-host`` IPC layer.

- :mod:`mapping_file_handler`: parses MAP2-native YAML mapping files
  (the Mixxx XML reader lives in C++ in
  ``juce-engine/Source/ControllerHost/MixxxXmlReader.{h,cpp}`` and
  lands in T2459-B3).

- :mod:`controller_service`: orchestrator. Owns profile + mapping
  registries, exposes them to FastAPI routes
  (:mod:`app.routes.devices`).

- :mod:`learning_utils`: heuristic classifier for the MIDI learn
  wizard. Lands in T2459-D4.

Architecture: ``docs/architecture/CONTROLLER_LAYER.md``.
Worklist: ``T2459`` epic.
"""

from app.services.controllers.controller_service import ControllerService, get_controller_service
from app.services.controllers.mapping_file_handler import (
    MappingDescriptor,
    MappingFileHandler,
    MappingLoadError,
)
from app.services.controllers.mapping_registry import MappingRegistry
from app.services.controllers.profile_registry import (
    DevicePack,
    DeviceProfile,
    PackLoadError,
    ProfileRegistry,
)

__all__ = [
    "ControllerService",
    "get_controller_service",
    "DevicePack",
    "DeviceProfile",
    "MappingDescriptor",
    "MappingFileHandler",
    "MappingLoadError",
    "MappingRegistry",
    "PackLoadError",
    "ProfileRegistry",
]
