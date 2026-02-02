"""
MIDI Device Profiles Service
Manages device-specific configurations and default mappings.

Includes built-in support for MeloAudio MIDI Commander as the standard controller.
"""

import asyncio
import logging
import subprocess
import os
import tempfile
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

logger = logging.getLogger(__name__)


class CurveType(str, Enum):
    LINEAR = "linear"
    LOGARITHMIC = "logarithmic"
    EXPONENTIAL = "exponential"
    S_CURVE = "s_curve"


class SwitchMode(str, Enum):
    MOMENTARY = "momentary"
    TOGGLE = "toggle"
    TIMED = "timed"


class MessageType(str, Enum):
    PROGRAM_CHANGE = "pc"
    CONTROL_CHANGE = "cc"
    NOTE = "note"


@dataclass
class FootswitchConfig:
    """Configuration for a single footswitch."""
    switch_id: str
    label: str
    midi_type: MessageType
    channel: int
    number: int  # CC, PC, or Note number
    mode: SwitchMode
    default_action: Optional[str] = None
    toggle_value_on: int = 127
    toggle_value_off: int = 0


@dataclass
class ExpressionPedalConfig:
    """Configuration for an expression pedal input."""
    pedal_id: str
    label: str
    cc_number: int
    channel: int = 1
    min_raw: int = 0
    max_raw: int = 127
    deadzone_low: int = 2
    deadzone_high: int = 125
    curve: CurveType = CurveType.LINEAR
    invert: bool = False
    default_target: Optional[str] = None  # e.g., "volume", "wah"


@dataclass
class BankConfig:
    """Bank switching configuration."""
    enabled: bool = True
    items_per_bank: int = 4
    max_banks: int = 8
    bank_up_cc: Optional[int] = None
    bank_down_cc: Optional[int] = None
    current_bank: int = 0


@dataclass
class DeviceProfile:
    """Complete device profile definition."""
    profile_id: str
    name: str
    manufacturer: str
    description: str
    icon: str = "🎛️"
    is_recommended: bool = False

    # Device identification
    usb_vendor_id: Optional[int] = None
    usb_product_id: Optional[int] = None
    name_patterns: List[str] = field(default_factory=list)

    # Hardware configuration
    footswitches: List[FootswitchConfig] = field(default_factory=list)
    expression_pedals: List[ExpressionPedalConfig] = field(default_factory=list)
    bank_config: Optional[BankConfig] = None

    # Firmware
    supports_firmware_update: bool = False
    firmware_dfu_command: Optional[str] = None
    current_firmware_version: Optional[str] = None


# ============================================================================
# Built-in Device Profiles
# ============================================================================

MELOAUDIO_COMMANDER_PROFILE = DeviceProfile(
    profile_id="meloaudio_commander",
    name="MeloAudio MIDI Commander",
    manufacturer="MeloAudio",
    description="10 footswitches, 2 expression pedal jacks, USB/5-pin MIDI. Recommended standard controller.",
    icon="🎸",
    is_recommended=True,

    name_patterns=["MIDI Commander", "MeloAudio", "TSMIDI", "TS MIDI"],

    footswitches=[
        # Bottom row - Program Changes for chain switching
        FootswitchConfig("A", "Chain 1", MessageType.PROGRAM_CHANGE, 1, 0, SwitchMode.MOMENTARY, "activate_chain"),
        FootswitchConfig("B", "Chain 2", MessageType.PROGRAM_CHANGE, 1, 1, SwitchMode.MOMENTARY, "activate_chain"),
        FootswitchConfig("C", "Chain 3", MessageType.PROGRAM_CHANGE, 1, 2, SwitchMode.MOMENTARY, "activate_chain"),
        FootswitchConfig("D", "Chain 4", MessageType.PROGRAM_CHANGE, 1, 3, SwitchMode.MOMENTARY, "activate_chain"),
        # Top row - CCs for plugin toggles
        FootswitchConfig("1", "Slot 1 Bypass", MessageType.CONTROL_CHANGE, 1, 80, SwitchMode.TOGGLE, "toggle_plugin"),
        FootswitchConfig("2", "Slot 2 Bypass", MessageType.CONTROL_CHANGE, 1, 81, SwitchMode.TOGGLE, "toggle_plugin"),
        FootswitchConfig("3", "Slot 3 Bypass", MessageType.CONTROL_CHANGE, 1, 82, SwitchMode.TOGGLE, "toggle_plugin"),
        FootswitchConfig("4", "Tap Tempo", MessageType.CONTROL_CHANGE, 1, 14, SwitchMode.MOMENTARY, "tap_tempo"),
    ],

    expression_pedals=[
        ExpressionPedalConfig("EXP1", "Volume", cc_number=7, channel=1, default_target="volume"),
        ExpressionPedalConfig("EXP2", "Wah/Mod", cc_number=1, channel=1, default_target="wah"),
    ],

    bank_config=BankConfig(
        enabled=True,
        items_per_bank=4,
        max_banks=8,
        bank_up_cc=85,
        bank_down_cc=86,
    ),

    supports_firmware_update=True,
    firmware_dfu_command="dfu-util -a 0 -D {firmware_file}",
)

GENERIC_MIDI_PROFILE = DeviceProfile(
    profile_id="generic",
    name="Generic MIDI Controller",
    manufacturer="Various",
    description="Manual configuration for any MIDI controller.",
    icon="🎹",
    is_recommended=False,

    footswitches=[],
    expression_pedals=[],
    bank_config=None,
    supports_firmware_update=False,
)


# All available profiles
BUILT_IN_PROFILES: Dict[str, DeviceProfile] = {
    "meloaudio_commander": MELOAUDIO_COMMANDER_PROFILE,
    "generic": GENERIC_MIDI_PROFILE,
}


class MIDIDeviceProfileService:
    """
    Manages MIDI device profiles and applies default configurations.
    """

    def __init__(self):
        self._profiles = dict(BUILT_IN_PROFILES)
        self._active_profile: Optional[DeviceProfile] = None
        self._bank_state: Dict[str, int] = {}  # profile_id -> current_bank
        self._expression_calibration: Dict[str, Dict] = {}  # pedal_id -> calibration
        self._midi_service = None

    def set_midi_service(self, midi_service):
        """Set reference to main MIDI service."""
        self._midi_service = midi_service

    # ==================== Profile Management ====================

    def get_all_profiles(self) -> List[Dict[str, Any]]:
        """Get all available device profiles."""
        return [self._profile_to_dict(p) for p in self._profiles.values()]

    def get_profile(self, profile_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific profile by ID."""
        profile = self._profiles.get(profile_id)
        return self._profile_to_dict(profile) if profile else None

    def get_active_profile(self) -> Optional[Dict[str, Any]]:
        """Get the currently active profile."""
        return self._profile_to_dict(self._active_profile) if self._active_profile else None

    def _profile_to_dict(self, profile: DeviceProfile) -> Dict[str, Any]:
        """Convert profile to dictionary for API response."""
        return {
            "profile_id": profile.profile_id,
            "name": profile.name,
            "manufacturer": profile.manufacturer,
            "description": profile.description,
            "icon": profile.icon,
            "is_recommended": profile.is_recommended,
            "name_patterns": profile.name_patterns,
            "footswitches": [
                {
                    "switch_id": fs.switch_id,
                    "label": fs.label,
                    "midi_type": fs.midi_type.value,
                    "channel": fs.channel,
                    "number": fs.number,
                    "mode": fs.mode.value,
                    "default_action": fs.default_action,
                }
                for fs in profile.footswitches
            ],
            "expression_pedals": [
                {
                    "pedal_id": ep.pedal_id,
                    "label": ep.label,
                    "cc_number": ep.cc_number,
                    "channel": ep.channel,
                    "curve": ep.curve.value,
                    "invert": ep.invert,
                    "default_target": ep.default_target,
                    "deadzone_low": ep.deadzone_low,
                    "deadzone_high": ep.deadzone_high,
                }
                for ep in profile.expression_pedals
            ],
            "bank_config": {
                "enabled": profile.bank_config.enabled,
                "items_per_bank": profile.bank_config.items_per_bank,
                "max_banks": profile.bank_config.max_banks,
                "current_bank": self._bank_state.get(profile.profile_id, 0),
            } if profile.bank_config else None,
            "supports_firmware_update": profile.supports_firmware_update,
            "current_firmware_version": profile.current_firmware_version,
        }

    # ==================== Profile Detection ====================

    async def detect_device(self, device_name: str) -> Optional[str]:
        """Detect which profile matches a connected device."""
        device_name_lower = device_name.lower()

        for profile_id, profile in self._profiles.items():
            for pattern in profile.name_patterns:
                if pattern.lower() in device_name_lower:
                    logger.info(f"Detected device '{device_name}' matches profile '{profile_id}'")
                    return profile_id

        return None

    async def auto_detect_and_apply(self, device_name: str, session: AsyncSession) -> Optional[Dict[str, Any]]:
        """Auto-detect device and apply matching profile."""
        profile_id = await self.detect_device(device_name)

        if profile_id:
            result = await self.apply_profile(profile_id, session)
            return result

        return None

    # ==================== Apply Profile ====================

    async def apply_profile(
        self,
        profile_id: str,
        session: AsyncSession,
        clear_existing: bool = True
    ) -> Dict[str, Any]:
        """
        Apply a device profile, creating default mappings and commands.

        Args:
            profile_id: The profile to apply
            session: Database session
            clear_existing: Whether to clear existing mappings first

        Returns:
            Summary of what was created
        """
        profile = self._profiles.get(profile_id)
        if not profile:
            raise ValueError(f"Unknown profile: {profile_id}")

        self._active_profile = profile

        results = {
            "profile_id": profile_id,
            "profile_name": profile.name,
            "commands_created": 0,
            "mappings_created": 0,
            "expression_configs": 0,
        }

        if not self._midi_service:
            logger.warning("MIDI service not set, cannot apply profile mappings")
            return results

        # Import here to avoid circular imports
        from app.services.midi_service import MIDIMappingDTO, MIDICommandDTO, CurveType as ServiceCurveType, ActionType, CommandType

        if clear_existing:
            # Clear existing commands for this profile's PC range
            # (Don't clear all - user may have custom mappings)
            pass

        # Create chain-switching commands from footswitches
        for fs in profile.footswitches:
            if fs.midi_type == MessageType.PROGRAM_CHANGE and fs.default_action == "activate_chain":
                # Get chain at this position
                chain_id = fs.number + 1  # PC 0 = Chain 1

                try:
                    cmd = MIDICommandDTO(
                        command_type=CommandType.PROGRAM_CHANGE,
                        channel=0,  # Omni
                        data1=fs.number,
                        action_type=ActionType.ACTIVATE_CHAIN,
                        target_chain_id=chain_id,
                        name=f"PC{fs.number} → Chain {chain_id}",
                    )
                    await self._midi_service.create_command(cmd, session)
                    results["commands_created"] += 1
                except Exception as e:
                    logger.warning(f"Failed to create command for {fs.switch_id}: {e}")

            elif fs.midi_type == MessageType.CONTROL_CHANGE and fs.default_action == "toggle_plugin":
                # Create CC toggle for plugin slot
                try:
                    # Extract slot number from switch_id (1, 2, 3...)
                    slot = int(fs.switch_id) - 1 if fs.switch_id.isdigit() else 0

                    cmd = MIDICommandDTO(
                        command_type=CommandType.CC_TOGGLE,
                        channel=0,
                        data1=fs.number,
                        data2=64,  # Threshold
                        action_type=ActionType.TOGGLE_PLUGIN,
                        action_data={"slot_index": slot},
                        name=f"CC{fs.number} → Toggle Slot {slot + 1}",
                    )
                    await self._midi_service.create_command(cmd, session)
                    results["commands_created"] += 1
                except Exception as e:
                    logger.warning(f"Failed to create toggle command for {fs.switch_id}: {e}")

        # Store expression pedal configurations
        for ep in profile.expression_pedals:
            self._expression_calibration[ep.pedal_id] = {
                "cc_number": ep.cc_number,
                "channel": ep.channel,
                "min_raw": ep.min_raw,
                "max_raw": ep.max_raw,
                "deadzone_low": ep.deadzone_low,
                "deadzone_high": ep.deadzone_high,
                "curve": ep.curve.value,
                "invert": ep.invert,
                "target": ep.default_target,
            }
            results["expression_configs"] += 1

        logger.info(f"Applied profile '{profile_id}': {results['commands_created']} commands, {results['expression_configs']} expression configs")

        return results

    # ==================== Bank Management ====================

    def get_current_bank(self, profile_id: Optional[str] = None) -> int:
        """Get current bank number for a profile."""
        pid = profile_id or (self._active_profile.profile_id if self._active_profile else None)
        if not pid:
            return 0
        return self._bank_state.get(pid, 0)

    def set_bank(self, bank: int, profile_id: Optional[str] = None) -> Dict[str, Any]:
        """Set current bank number."""
        pid = profile_id or (self._active_profile.profile_id if self._active_profile else None)
        if not pid:
            return {"error": "No active profile"}

        profile = self._profiles.get(pid)
        if not profile or not profile.bank_config:
            return {"error": "Profile does not support banking"}

        max_bank = profile.bank_config.max_banks - 1
        bank = max(0, min(bank, max_bank))

        self._bank_state[pid] = bank

        return {
            "bank": bank,
            "max_bank": max_bank,
            "pc_offset": bank * profile.bank_config.items_per_bank,
        }

    def bank_up(self) -> Dict[str, Any]:
        """Increment current bank."""
        current = self.get_current_bank()
        return self.set_bank(current + 1)

    def bank_down(self) -> Dict[str, Any]:
        """Decrement current bank."""
        current = self.get_current_bank()
        return self.set_bank(current - 1)

    def get_chain_id_for_pc(self, pc_number: int) -> int:
        """Convert PC number to absolute chain ID using current bank."""
        if not self._active_profile or not self._active_profile.bank_config:
            return pc_number + 1

        bank = self.get_current_bank()
        offset = bank * self._active_profile.bank_config.items_per_bank
        return offset + pc_number + 1

    # ==================== Expression Pedal Calibration ====================

    def get_expression_calibration(self, pedal_id: str) -> Optional[Dict[str, Any]]:
        """Get calibration settings for an expression pedal."""
        return self._expression_calibration.get(pedal_id)

    def get_all_expression_calibrations(self) -> Dict[str, Dict[str, Any]]:
        """Get all expression pedal calibration settings."""
        return dict(self._expression_calibration)

    def update_expression_calibration(
        self,
        pedal_id: str,
        min_raw: Optional[int] = None,
        max_raw: Optional[int] = None,
        deadzone_low: Optional[int] = None,
        deadzone_high: Optional[int] = None,
        curve: Optional[str] = None,
        invert: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """Update calibration settings for an expression pedal."""
        if pedal_id not in self._expression_calibration:
            self._expression_calibration[pedal_id] = {
                "min_raw": 0,
                "max_raw": 127,
                "deadzone_low": 2,
                "deadzone_high": 125,
                "curve": "linear",
                "invert": False,
            }

        cal = self._expression_calibration[pedal_id]

        if min_raw is not None:
            cal["min_raw"] = min_raw
        if max_raw is not None:
            cal["max_raw"] = max_raw
        if deadzone_low is not None:
            cal["deadzone_low"] = deadzone_low
        if deadzone_high is not None:
            cal["deadzone_high"] = deadzone_high
        if curve is not None:
            cal["curve"] = curve
        if invert is not None:
            cal["invert"] = invert

        return cal

    def process_expression_value(self, pedal_id: str, raw_value: int) -> float:
        """
        Process a raw MIDI value through calibration curve.

        Returns normalized value 0.0-1.0
        """
        cal = self._expression_calibration.get(pedal_id, {})

        min_raw = cal.get("min_raw", 0)
        max_raw = cal.get("max_raw", 127)
        dz_low = cal.get("deadzone_low", 0)
        dz_high = cal.get("deadzone_high", 127)
        curve = cal.get("curve", "linear")
        invert = cal.get("invert", False)

        # Apply deadzone
        if raw_value < dz_low:
            raw_value = dz_low
        elif raw_value > dz_high:
            raw_value = dz_high

        # Normalize
        range_size = dz_high - dz_low
        if range_size <= 0:
            normalized = 0.0
        else:
            normalized = (raw_value - dz_low) / range_size

        # Apply curve
        import math
        if curve == "logarithmic":
            normalized = math.log10(1 + 9 * normalized) if normalized > 0 else 0
        elif curve == "exponential":
            normalized = (math.pow(10, normalized) - 1) / 9
        elif curve == "s_curve":
            normalized = 0.5 * (1 + math.tanh(4 * (normalized - 0.5)))

        # Invert if needed
        if invert:
            normalized = 1.0 - normalized

        return normalized

    # ==================== Firmware Update ====================

    async def check_dfu_available(self) -> bool:
        """Check if dfu-util is available for firmware updates."""
        try:
            result = await asyncio.create_subprocess_exec(
                "dfu-util", "--version",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await result.communicate()
            return result.returncode == 0
        except FileNotFoundError:
            return False

    async def list_dfu_devices(self) -> List[Dict[str, Any]]:
        """List devices in DFU mode."""
        try:
            result = await asyncio.create_subprocess_exec(
                "dfu-util", "-l",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await result.communicate()

            devices = []
            for line in stdout.decode().split("\n"):
                if "Found DFU" in line:
                    # Parse DFU device info
                    devices.append({
                        "raw": line.strip(),
                        "in_dfu_mode": True,
                    })

            return devices
        except Exception as e:
            logger.error(f"Failed to list DFU devices: {e}")
            return []

    async def flash_firmware(
        self,
        profile_id: str,
        firmware_path: str,
        progress_callback: Optional[callable] = None,
    ) -> Dict[str, Any]:
        """
        Flash firmware to a device in DFU mode.

        Args:
            profile_id: The device profile (determines flash command)
            firmware_path: Path to the .dfu firmware file
            progress_callback: Optional callback for progress updates

        Returns:
            Result with success status and any messages
        """
        profile = self._profiles.get(profile_id)
        if not profile:
            return {"success": False, "error": f"Unknown profile: {profile_id}"}

        if not profile.supports_firmware_update:
            return {"success": False, "error": "Profile does not support firmware updates"}

        if not os.path.exists(firmware_path):
            return {"success": False, "error": f"Firmware file not found: {firmware_path}"}

        # Check DFU utility
        if not await self.check_dfu_available():
            return {
                "success": False,
                "error": "dfu-util not installed. Install with: sudo dnf install dfu-util"
            }

        # Build command
        cmd = profile.firmware_dfu_command or "dfu-util -a 0 -D {firmware_file}"
        cmd = cmd.format(firmware_file=firmware_path)

        logger.info(f"Flashing firmware: {cmd}")

        try:
            if progress_callback:
                progress_callback({"stage": "starting", "percent": 0})

            result = await asyncio.create_subprocess_shell(
                cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            stdout, stderr = await result.communicate()

            if result.returncode == 0:
                logger.info("Firmware flash completed successfully")
                if progress_callback:
                    progress_callback({"stage": "complete", "percent": 100})

                return {
                    "success": True,
                    "message": "Firmware flashed successfully. Power cycle the device.",
                    "output": stdout.decode(),
                }
            else:
                error_msg = stderr.decode() or stdout.decode()
                logger.error(f"Firmware flash failed: {error_msg}")

                return {
                    "success": False,
                    "error": f"Flash failed: {error_msg}",
                }

        except Exception as e:
            logger.error(f"Firmware flash exception: {e}")
            return {"success": False, "error": str(e)}

    def get_dfu_instructions(self, profile_id: str) -> Dict[str, Any]:
        """Get instructions for entering DFU mode for a device."""
        if profile_id == "meloaudio_commander":
            return {
                "device": "MeloAudio MIDI Commander",
                "steps": [
                    "Connect the MIDI Commander via USB",
                    "Power off the device",
                    "Hold down Bank Down (▼) and D buttons",
                    "While holding, press the Power button",
                    "Release all buttons when the display stays blank and LED 3 lights up",
                    "Device is now in DFU mode",
                ],
                "exit_dfu": "Power cycle the device (turn off, then on)",
                "notes": [
                    "The display will be blank in DFU mode - this is normal",
                    "After flashing, hold A while powering on to reset to defaults",
                ],
            }

        return {
            "device": "Generic",
            "steps": ["Consult your device manual for DFU mode entry"],
            "notes": [],
        }


# Global service instance
device_profile_service = MIDIDeviceProfileService()
