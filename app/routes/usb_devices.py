"""
USB Audio Device Management Routes

Provides API endpoints for:
- USB audio device detection and status
- Hotone device management
- Power management configuration
- ALSA configuration
"""

import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from app.services.usb_audio_manager import (
    get_usb_manager,
    HOTONE_DEVICES,
    PRIMARY_DEVICE,
    USBDeviceStatus,
)

router = APIRouter(prefix="/api/usb", tags=["USB Devices"])


class DeviceStatusResponse(BaseModel):
    """USB device status response."""
    hotone_detected: bool
    device_count: int
    primary_device: Optional[Dict[str, Any]]
    all_devices: List[Dict[str, Any]]
    recommendations: List[str]


class UdevRulesResponse(BaseModel):
    """Udev rules response."""
    rules: str
    install_path: str
    instructions: List[str]


class AlsaConfigResponse(BaseModel):
    """ALSA configuration response."""
    config: str
    install_paths: List[str]
    instructions: List[str]


class HotoneDeviceInfo(BaseModel):
    """Hotone device specification."""
    name: str
    vendor_id: str
    product_id: str
    description: str
    sample_rates: List[int]
    bit_depth: int
    channels_in: int
    channels_out: int
    usb_class: str


@router.get("/devices", response_model=DeviceStatusResponse)
async def get_usb_devices():
    """
    Get USB audio device status.

    Returns detected USB audio devices with focus on Hotone interfaces,
    including power management status and recommendations.
    """
    manager = get_usb_manager()
    status = manager.get_device_status_dict()
    return DeviceStatusResponse(**status)


@router.get("/hotone/supported")
async def get_supported_hotone_devices() -> Dict[str, HotoneDeviceInfo]:
    """
    Get list of supported Hotone devices.

    Returns specifications for all known Hotone USB audio interfaces.
    """
    return {
        name: HotoneDeviceInfo(
            name=device.name,
            vendor_id=device.vendor_id,
            product_id=device.product_id,
            description=device.description,
            sample_rates=device.sample_rates,
            bit_depth=device.bit_depth,
            channels_in=device.channels_in,
            channels_out=device.channels_out,
            usb_class=device.usb_class,
        )
        for name, device in HOTONE_DEVICES.items()
    }


@router.get("/hotone/primary")
async def get_primary_hotone_device():
    """
    Get primary Hotone device status.

    Returns detailed status of the primary (first detected) Hotone device.
    """
    manager = get_usb_manager()
    manager.detect_usb_devices()

    if manager.primary_device is None:
        raise HTTPException(status_code=404, detail="No Hotone device detected")

    dev = manager.primary_device
    return {
        "name": dev.name,
        "vendor_id": dev.vendor_id,
        "product_id": dev.product_id,
        "model": dev.hotone_model,
        "bus": dev.bus,
        "device": dev.device,
        "usb_speed": dev.speed,
        "power_control": dev.power_control,
        "autosuspend_delay_ms": dev.autosuspend_delay,
        "alsa_card": dev.alsa_card,
        "alsa_device": dev.alsa_device,
        "is_autosuspend_disabled": dev.power_control == "on",
        "is_connected": dev.is_connected,
    }


@router.post("/hotone/disable-autosuspend")
async def disable_hotone_autosuspend():
    """
    Disable USB autosuspend for all Hotone devices.

    This prevents USB power saving mode which can cause audio glitches
    and increased latency.

    Note: Requires appropriate permissions (may need to be run as root).
    """
    manager = get_usb_manager()
    manager.detect_usb_devices()

    count = manager.disable_all_hotone_autosuspend()

    if count == 0:
        hotone_count = len([d for d in manager.detected_devices if d.is_hotone])
        if hotone_count == 0:
            raise HTTPException(status_code=404, detail="No Hotone devices detected")
        else:
            raise HTTPException(
                status_code=500,
                detail="Failed to disable autosuspend - may require root permissions"
            )

    return {
        "success": True,
        "devices_configured": count,
        "message": f"Disabled autosuspend for {count} Hotone device(s)"
    }


@router.get("/udev-rules", response_model=UdevRulesResponse)
async def get_udev_rules():
    """
    Get udev rules for Hotone devices.

    Returns udev rules content that can be installed to permanently
    disable USB autosuspend for all Hotone audio interfaces.
    """
    manager = get_usb_manager()
    rules = manager.create_udev_rules()

    return UdevRulesResponse(
        rules=rules,
        install_path="/etc/udev/rules.d/90-hotone-audio.rules",
        instructions=[
            "1. Save the rules to /etc/udev/rules.d/90-hotone-audio.rules",
            "2. Run: sudo udevadm control --reload-rules",
            "3. Run: sudo udevadm trigger",
            "4. Reconnect your Hotone device",
        ]
    )


@router.post("/udev-rules/install")
async def install_udev_rules():
    """
    Install udev rules for Hotone devices.

    Installs udev rules to /etc/udev/rules.d/ and reloads udev.
    Requires root permissions.
    """
    manager = get_usb_manager()
    success = manager.install_udev_rules()

    if not success:
        raise HTTPException(
            status_code=500,
            detail="Failed to install udev rules - requires root permissions"
        )

    return {
        "success": True,
        "message": "Udev rules installed successfully",
        "path": "/etc/udev/rules.d/90-hotone-audio.rules"
    }


@router.get("/alsa-config", response_model=AlsaConfigResponse)
async def get_alsa_config():
    """
    Get optimized ALSA configuration for Hotone devices.

    Returns ALSA configuration with low-latency settings for
    the detected Hotone device.
    """
    manager = get_usb_manager()
    manager.detect_usb_devices()

    config = manager.create_alsa_config()

    return AlsaConfigResponse(
        config=config,
        install_paths=[
            "~/.asoundrc (user-specific)",
            "/etc/asound.conf (system-wide)"
        ],
        instructions=[
            "1. Save the configuration to ~/.asoundrc for your user",
            "2. Or save to /etc/asound.conf for system-wide use",
            "3. Restart any audio applications",
            "4. The default device will now use the Hotone interface",
        ]
    )


@router.get("/diagnostics")
async def get_usb_diagnostics():
    """
    Get comprehensive USB audio diagnostics.

    Returns detailed diagnostic information for troubleshooting
    USB audio issues.
    """
    import subprocess
    import os

    diagnostics = {
        "devices": [],
        "alsa_cards": None,
        "kernel_modules": None,
        "usb_power_status": [],
        "recommendations": [],
    }

    manager = get_usb_manager()
    manager.detect_usb_devices()

    # Device info
    diagnostics["devices"] = manager.get_device_status_dict()

    # ALSA cards
    try:
        with open("/proc/asound/cards", "r") as f:
            diagnostics["alsa_cards"] = f.read()
    except FileNotFoundError:
        diagnostics["alsa_cards"] = "ALSA not available"

    # Kernel modules
    try:
        result = await asyncio.to_thread(subprocess.run,
            ["lsmod"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            # Filter for audio-related modules
            modules = []
            for line in result.stdout.split('\n'):
                if any(x in line.lower() for x in ['snd', 'audio', 'usb']):
                    modules.append(line)
            diagnostics["kernel_modules"] = "\n".join(modules)
    except Exception as e:
        diagnostics["kernel_modules"] = f"Error: {e}"

    # USB power status for all audio devices
    for dev in manager.detected_devices:
        diagnostics["usb_power_status"].append({
            "device": dev.name,
            "power_control": dev.power_control,
            "autosuspend_delay_ms": dev.autosuspend_delay,
        })

    # Generate recommendations
    for dev in manager.detected_devices:
        if dev.is_hotone and dev.power_control != "on":
            diagnostics["recommendations"].append(
                f"{dev.name}: Enable 'power/control=on' to disable autosuspend"
            )

    return diagnostics


@router.get("/devices/list")
async def list_usb_devices() -> List[Dict[str, Any]]:
    """
    List all USB devices in a simple format.

    Returns list of USB devices matching the frontend UsbDevice interface.
    """
    import subprocess

    devices = []

    try:
        # Use lsusb to get all USB devices
        result = await asyncio.to_thread(subprocess.run,
            ["lsusb"],
            capture_output=True,
            text=True,
            timeout=5
        )

        if result.returncode == 0:
            for line in result.stdout.strip().split('\n'):
                if not line:
                    continue
                # Parse: Bus 001 Device 002: ID 1234:5678 Manufacturer Product
                parts = line.split()
                if len(parts) >= 6:
                    try:
                        bus = int(parts[1])
                        device = int(parts[3].rstrip(':'))
                        id_parts = parts[5].split(':')
                        vendor_id = id_parts[0] if len(id_parts) >= 1 else ""
                        product_id = id_parts[1] if len(id_parts) >= 2 else ""

                        # Get the rest as product name
                        product_name = " ".join(parts[6:]) if len(parts) > 6 else "Unknown"

                        # Check if it's an audio device (common audio vendor IDs or "Audio" in name)
                        is_audio = (
                            "audio" in product_name.lower() or
                            "sound" in product_name.lower() or
                            vendor_id in ["0582", "1235", "0d8c", "046d", "17cc", "1397", "0763"]  # Roland, Focusrite, C-Media, Logitech, Native Instruments, Behringer, M-Audio
                        )

                        devices.append({
                            "bus": bus,
                            "device": device,
                            "vendor_id": vendor_id,
                            "product_id": product_id,
                            "manufacturer": "",  # Would need lsusb -v for this
                            "product": product_name,
                            "serial": None,
                            "is_audio": is_audio
                        })
                    except (ValueError, IndexError):
                        continue

    except subprocess.TimeoutExpired:
        pass
    except FileNotFoundError:
        pass
    except Exception:
        pass

    return devices


@router.post("/reset/{device_id}")
async def reset_usb_device(device_id: str) -> Dict[str, Any]:
    """
    Reset a USB device.

    Args:
        device_id: Device identifier in format "bus-device" (e.g., "001-002")

    Returns:
        Success status and message
    """
    import subprocess
    import os

    try:
        # Parse device_id (format: "bus-device")
        parts = device_id.split('-')
        if len(parts) != 2:
            return {
                "success": False,
                "message": f"Invalid device_id format. Expected 'bus-device', got '{device_id}'"
            }

        bus = parts[0].zfill(3)
        device = parts[1].zfill(3)

        # USB device path
        usb_path = f"/dev/bus/usb/{bus}/{device}"

        if not os.path.exists(usb_path):
            return {
                "success": False,
                "message": f"USB device not found at {usb_path}"
            }

        # Try using usbreset if available
        try:
            result = await asyncio.to_thread(subprocess.run,
                ["usbreset", usb_path],
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0:
                return {
                    "success": True,
                    "message": f"USB device {device_id} reset successfully"
                }
        except FileNotFoundError:
            pass  # usbreset not installed, try alternative

        # Alternative: unbind and rebind the USB device
        # Find the USB device sysfs path
        sysfs_base = "/sys/bus/usb/devices"
        for entry in os.listdir(sysfs_base):
            entry_path = os.path.join(sysfs_base, entry)
            if os.path.isdir(entry_path):
                busnum_path = os.path.join(entry_path, "busnum")
                devnum_path = os.path.join(entry_path, "devnum")
                if os.path.exists(busnum_path) and os.path.exists(devnum_path):
                    try:
                        with open(busnum_path) as f:
                            dev_bus = f.read().strip()
                        with open(devnum_path) as f:
                            dev_num = f.read().strip()
                        if dev_bus == str(int(bus)) and dev_num == str(int(device)):
                            # Found the device, try to reset via authorized
                            auth_path = os.path.join(entry_path, "authorized")
                            if os.path.exists(auth_path):
                                with open(auth_path, 'w') as f:
                                    f.write('0')
                                with open(auth_path, 'w') as f:
                                    f.write('1')
                                return {
                                    "success": True,
                                    "message": f"USB device {device_id} reset via sysfs"
                                }
                    except (IOError, PermissionError) as e:
                        return {
                            "success": False,
                            "message": f"Permission denied - may require root: {str(e)}"
                        }

        return {
            "success": False,
            "message": f"Could not find sysfs entry for device {device_id}"
        }

    except Exception as e:
        return {
            "success": False,
            "message": f"Error resetting USB device: {str(e)}"
        }
