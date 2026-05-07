"""MeloAudio device support — MIDI Commander Configurator.

T2459-H3-CFG: in-platform UI for stock-mode discovery + custom-firmware
install + MAP2-canonical SysEx config push.

Phase 1 (this module): firmware detection.
Phase 2: stock-mode discovery wizard.
Phases 3-7 land in subsequent sessions.
"""

from .commander_detection import (
    CommanderFirmwareKind,
    CommanderStatus,
    detect_commander_status,
)
from .commander_discovery import (
    CommanderControl,
    CommanderDiscoveryEvent,
    CommanderDiscoveryOverride,
    CommanderDiscoveryState,
    DEFAULT_PROMPT_SEQUENCE,
    load_override,
    override_yaml_path,
    save_override,
)

__all__ = [
    "CommanderFirmwareKind",
    "CommanderStatus",
    "detect_commander_status",
    "CommanderControl",
    "CommanderDiscoveryEvent",
    "CommanderDiscoveryOverride",
    "CommanderDiscoveryState",
    "DEFAULT_PROMPT_SEQUENCE",
    "load_override",
    "override_yaml_path",
    "save_override",
]
