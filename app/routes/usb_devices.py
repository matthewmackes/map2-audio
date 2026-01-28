"""
USB Audio Device Management Routes

Provides API endpoints for:
- USB audio device detection and status
- Hotone device management
- Power management configuration
- ALSA configuration
"""

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
        result = subprocess.run(
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
