"""MIDI device profile service.

T2459-H3 migration note:
- The MeloAudio MIDI Commander profile is now sourced from
  ``device-packs/meloaudio/profiles/midi-commander.midi.yaml``.
- The legacy id ``meloaudio_commander`` remains accepted as an alias
  for in-flight callers.
"""

import asyncio
import logging
import os
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.midi.curves import CurveType
from app.services.midi_models import (
    ActionType,
    CommandType,
    MIDICommandDTO,
)

import yaml

logger = logging.getLogger(__name__)

MIDI_COMMANDER_PROFILE_ID = "meloaudio_midi_commander"
LEGACY_MIDI_COMMANDER_PROFILE_ID = "meloaudio_commander"
BANK_UP_CC = 85
BANK_DOWN_CC = 86
BUTTON_CC_BY_ID: Dict[str, int] = {
    "1": 80,
    "2": 81,
    "3": 82,
    "4": 14,
}
BUTTON_PC_BY_ID: Dict[str, int] = {
    "A": 0,
    "B": 1,
    "C": 2,
    "D": 3,
}
EXPRESSION_CC_BY_ID: Dict[str, int] = {
    "EXP1": 7,
    "EXP2": 1,
}
MELOAUDIO_PACK_PROFILE_PATH = (
    Path(__file__).resolve().parents[2]
    / "device-packs"
    / "meloaudio"
    / "profiles"
    / "midi-commander.midi.yaml"
)


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

def _build_meloaudio_profile_from_device_pack() -> DeviceProfile:
    """Load the canonical MIDI Commander profile from device-packs.

    Raises ValueError when the pack profile cannot be read or is malformed.
    """
    if not MELOAUDIO_PACK_PROFILE_PATH.exists():
        raise ValueError(f"missing MeloAudio profile at {MELOAUDIO_PACK_PROFILE_PATH}")

    doc = yaml.safe_load(MELOAUDIO_PACK_PROFILE_PATH.read_text(encoding="utf-8"))
    if not isinstance(doc, dict):
        raise ValueError("MeloAudio profile YAML did not parse to an object")

    identity = doc.get("identity", {}) if isinstance(doc.get("identity"), dict) else {}
    manufacturer = str(identity.get("manufacturer") or "MeloAudio")
    model = str(identity.get("model") or "midi-commander")
    description = (
        "10 footswitches, 2 expression pedal jacks, USB/5-pin MIDI. "
        "Recommended standard controller."
    )

    button_id_by_cc = {value: key for key, value in BUTTON_CC_BY_ID.items()}
    button_id_by_pc = {value: key for key, value in BUTTON_PC_BY_ID.items()}
    expression_id_by_cc = {value: key for key, value in EXPRESSION_CC_BY_ID.items()}

    footswitches: list[FootswitchConfig] = []
    expression_pedals: list[ExpressionPedalConfig] = []
    controls = doc.get("controls", [])
    if not isinstance(controls, list):
        raise ValueError("MeloAudio controls must be a list")

    for row in controls:
        if not isinstance(row, dict):
            continue
        status_raw = row.get("status")
        if status_raw is None:
            continue
        try:
            status = int(status_raw) & 0xF0
        except (TypeError, ValueError):
            continue
        channel = int(row.get("channel") or 1)
        midino_raw = row.get("midino")
        midino = int(midino_raw) if midino_raw is not None else None
        action = str(row.get("action") or "").strip().lower()
        target = str(row.get("target") or "").strip().lower()

        if status == 0xC0 and midino is not None:
            switch_id = button_id_by_pc.get(midino, f"PC{midino}")
            footswitches.append(
                FootswitchConfig(
                    switch_id=switch_id,
                    label=f"Chain {midino + 1}",
                    midi_type=MessageType.PROGRAM_CHANGE,
                    channel=channel,
                    number=midino,
                    mode=SwitchMode.MOMENTARY,
                    default_action="activate_chain",
                )
            )
            continue

        if status == 0xB0 and midino is not None and midino in expression_id_by_cc:
            pedal_id = expression_id_by_cc[midino]
            expression_pedals.append(
                ExpressionPedalConfig(
                    pedal_id=pedal_id,
                    label="Volume" if pedal_id == "EXP1" else "Wah/Mod",
                    cc_number=midino,
                    channel=channel,
                    default_target="volume" if pedal_id == "EXP1" else "wah",
                )
            )
            continue

        if status == 0xB0 and midino is not None and midino in button_id_by_cc:
            switch_id = button_id_by_cc[midino]
            default_action = "toggle_plugin"
            mode = SwitchMode.TOGGLE
            if switch_id == "4":
                default_action = "tap_tempo"
                mode = SwitchMode.MOMENTARY
            elif action != "toggle" and not target.endswith(".bypass"):
                default_action = None
                mode = SwitchMode.MOMENTARY
            footswitches.append(
                FootswitchConfig(
                    switch_id=switch_id,
                    label=f"Switch {switch_id}",
                    midi_type=MessageType.CONTROL_CHANGE,
                    channel=channel,
                    number=midino,
                    mode=mode,
                    default_action=default_action,
                )
            )

    footswitches.sort(key=lambda item: (0 if item.switch_id in {"A", "B", "C", "D"} else 1, item.number))
    expression_pedals.sort(key=lambda item: item.pedal_id)

    def _is_bank_cc(row: dict[str, Any], expected_cc: int) -> bool:
        if not isinstance(row, dict):
            return False
        try:
            status = int(row.get("status", 0)) & 0xF0
            midino = int(row["midino"]) if row.get("midino") is not None else -1
        except (TypeError, ValueError, KeyError):
            return False
        return status == 0xB0 and midino == expected_cc

    has_bank_up = any(_is_bank_cc(row, BANK_UP_CC) for row in controls)
    has_bank_down = any(_is_bank_cc(row, BANK_DOWN_CC) for row in controls)

    return DeviceProfile(
        profile_id=MIDI_COMMANDER_PROFILE_ID,
        name="MeloAudio MIDI Commander",
        manufacturer=manufacturer,
        description=description,
        icon="🎸",
        is_recommended=True,
        name_patterns=[
            "MIDI Commander",
            "MeloAudio",
            "TSMIDI",
            "TS MIDI",
            manufacturer,
            model,
        ],
        footswitches=footswitches,
        expression_pedals=expression_pedals,
        bank_config=BankConfig(
            enabled=bool(has_bank_up or has_bank_down),
            items_per_bank=4,
            max_banks=8,
            bank_up_cc=BANK_UP_CC if has_bank_up else None,
            bank_down_cc=BANK_DOWN_CC if has_bank_down else None,
        ),
        supports_firmware_update=True,
        firmware_dfu_command="dfu-util -a 0 -D {firmware_file}",
    )


class MIDIDeviceProfileService:
    """
    Manages MIDI device profiles and applies default configurations.
    """

    def __init__(self):
        self._profiles: Dict[str, DeviceProfile] = {"generic": GENERIC_MIDI_PROFILE}
        self._profile_aliases: Dict[str, str] = {
            LEGACY_MIDI_COMMANDER_PROFILE_ID: MIDI_COMMANDER_PROFILE_ID,
        }
        self._load_meloaudio_profile()
        self._active_profile: Optional[DeviceProfile] = None
        self._active_profile_id: Optional[str] = None
        self._bank_state: Dict[str, int] = {}  # profile_id -> current_bank
        self._expression_calibration: Dict[str, Dict] = {}  # pedal_id -> calibration
        self._midi_service = None

    def _load_meloaudio_profile(self) -> None:
        try:
            self._profiles[MIDI_COMMANDER_PROFILE_ID] = _build_meloaudio_profile_from_device_pack()
        except Exception as exc:
            logger.error(
                "Failed to load MeloAudio profile from device-pack (%s). "
                "MIDI Commander profile surfaces will be unavailable until fixed.",
                exc,
            )

    def _resolve_profile_id(self, profile_id: str | None) -> str | None:
        if profile_id is None:
            return None
        raw = str(profile_id).strip()
        if not raw:
            return None
        return self._profile_aliases.get(raw, raw)

    def is_meloaudio_profile_id(self, profile_id: str | None) -> bool:
        return self._resolve_profile_id(profile_id) == MIDI_COMMANDER_PROFILE_ID

    def set_midi_service(self, midi_service):
        """Set reference to main MIDI service."""
        self._midi_service = midi_service

    # ==================== Profile Management ====================

    def get_all_profiles(self) -> List[Dict[str, Any]]:
        """Get all available device profiles."""
        return [self._profile_to_dict(p) for p in self._profiles.values()]

    def get_profile(self, profile_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific profile by ID."""
        resolved = self._resolve_profile_id(profile_id)
        profile = self._profiles.get(resolved) if resolved else None
        if not profile:
            return None
        payload = self._profile_to_dict(profile)
        if resolved != profile_id:
            payload["profile_id_canonical"] = resolved
        return payload

    def get_active_profile(self) -> Optional[Dict[str, Any]]:
        """Get the currently active profile."""
        if not self._active_profile:
            return None
        payload = self._profile_to_dict(self._active_profile)
        if self._active_profile_id:
            payload["profile_id"] = self._active_profile_id
            resolved = self._resolve_profile_id(self._active_profile_id)
            if resolved and resolved != self._active_profile_id:
                payload["profile_id_canonical"] = resolved
        return payload

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
        resolved_profile_id = self._resolve_profile_id(profile_id)
        profile = self._profiles.get(resolved_profile_id) if resolved_profile_id else None
        if not profile:
            raise ValueError(f"Unknown profile: {profile_id}")

        self._active_profile = profile
        self._active_profile_id = profile_id

        results = {
            "profile_id": profile_id,
            "profile_id_canonical": profile.profile_id,
            "profile_name": profile.name,
            "commands_created": 0,
            "mappings_created": 0,
            "expression_configs": 0,
        }

        if not self._midi_service:
            logger.warning("MIDI service not set, cannot apply profile mappings")
            return results

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
        resolved = self._resolve_profile_id(profile_id)
        pid = resolved or (self._active_profile.profile_id if self._active_profile else None)
        if not pid:
            return 0
        return self._bank_state.get(pid, 0)

    def set_bank(self, bank: int, profile_id: Optional[str] = None) -> Dict[str, Any]:
        """Set current bank number."""
        resolved = self._resolve_profile_id(profile_id)
        pid = resolved or (self._active_profile.profile_id if self._active_profile else None)
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
        if self.is_meloaudio_profile_id(profile_id):
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
