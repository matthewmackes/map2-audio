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
from .commander_discovery_subscriber import (
    CommanderDiscoverySubscriber,
    SubscriberConfig,
    SubscriberError,
)
from .dfu_flash import (
    DfuFlashEvent,
    DfuFlashPhase,
    DfuFlashRequest,
    FIRMWARE_BUNDLE_DIR,
    PreCheckResult,
    build_dfu_util_command,
    find_dfu_util,
    list_bundled_firmware,
    parse_dfu_util_progress,
    run_dfu_flash,
    run_pre_check,
)
from .sysex_packer import (
    BankNaming,
    ButtonRow,
    CommandCC,
    CommandNone,
    CommandNote,
    CommandPB,
    CommandPC,
    CommandStart,
    CommandStop,
    CommanderConfig,
    GlobalSettings,
    SysExFrame,
    build_erase_flash_frame,
    build_flash_image,
    build_full_sysex_sequence,
    build_reset_frame,
    build_write_flash_frames,
    pack_bank_strings,
    pack_button_row,
    pack_button_settings,
    pack_global_settings,
    pad_flash_image_to_chunks,
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
    "CommanderDiscoverySubscriber",
    "SubscriberConfig",
    "SubscriberError",
    "DfuFlashEvent",
    "DfuFlashPhase",
    "DfuFlashRequest",
    "FIRMWARE_BUNDLE_DIR",
    "PreCheckResult",
    "build_dfu_util_command",
    "find_dfu_util",
    "list_bundled_firmware",
    "parse_dfu_util_progress",
    "run_dfu_flash",
    "run_pre_check",
    "BankNaming",
    "ButtonRow",
    "CommandCC",
    "CommandNone",
    "CommandNote",
    "CommandPB",
    "CommandPC",
    "CommandStart",
    "CommandStop",
    "CommanderConfig",
    "GlobalSettings",
    "SysExFrame",
    "build_erase_flash_frame",
    "build_flash_image",
    "build_full_sysex_sequence",
    "build_reset_frame",
    "build_write_flash_frames",
    "pack_bank_strings",
    "pack_button_row",
    "pack_button_settings",
    "pack_global_settings",
    "pad_flash_image_to_chunks",
]
