"""
USB Audio Device Manager for MAP2

Handles USB audio device detection, configuration, and power management.
Optimized for Hotone audio interfaces with Fedora Linux.

Features:
- Device detection and enumeration
- USB autosuspend disable for audio devices
- ALSA configuration management
- Device status monitoring
- Power management optimization
"""

import logging
import subprocess
import os
import re
import threading
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)

AUDIO_INTERFACE_VENDOR_IDS = {
    "046d",  # Logitech
    "0582",  # Roland / Edirol
    "0644",  # TASCAM (US-144MKII operational PID 0x8020; boot PID 0x800F)
    "0763",  # M-Audio
    "0d8c",  # C-Media
    "1235",  # Focusrite
    "1397",  # Behringer
    "17cc",  # Native Instruments
    "84ef",  # Hotone
}


# ============================================================================
# HOTONE DEVICE DEFINITIONS
# ============================================================================

@dataclass
class HotoneDevice:
    """Hotone USB audio device specification."""
    name: str
    vendor_id: str
    product_id: str
    description: str
    sample_rates: List[int] = field(default_factory=lambda: [44100, 48000])
    bit_depth: int = 24
    channels_in: int = 2
    channels_out: int = 2
    usb_class: str = "USB Audio Class 2.0"


# All known Hotone audio devices
HOTONE_DEVICES = {
    "jogg": HotoneDevice(
        name="Jogg USB Audio",
        vendor_id="84ef",
        product_id="0014",
        description="Hotone Jogg USB Audio Interface Pedal",
        sample_rates=[44100, 48000],
        bit_depth=24,
        channels_in=1,  # Mono guitar input
        channels_out=2,  # Stereo output
    ),
    "ampero": HotoneDevice(
        name="Ampero",
        vendor_id="84ef",
        product_id="0015",
        description="Hotone Ampero Amp Modeler/Effects Processor",
        sample_rates=[44100, 48000],
        bit_depth=24,
        channels_in=2,
        channels_out=2,
    ),
    "ampero_one": HotoneDevice(
        name="Ampero One",
        vendor_id="84ef",
        product_id="0016",
        description="Hotone Ampero One Multi-Effects",
        sample_rates=[44100, 48000],
        bit_depth=24,
        channels_in=2,
        channels_out=2,
    ),
    "ampero_ii": HotoneDevice(
        name="Ampero II",
        vendor_id="84ef",
        product_id="0017",
        description="Hotone Ampero II Stomp",
        sample_rates=[44100, 48000],
        bit_depth=24,
        channels_in=2,
        channels_out=2,
    ),
    "ampero_mini": HotoneDevice(
        name="Ampero Mini",
        vendor_id="84ef",
        product_id="0018",
        description="Hotone Ampero Mini MP-50",
        sample_rates=[44100, 48000],
        bit_depth=24,
        channels_in=2,
        channels_out=2,
    ),
}

# Primary device for MAP2
PRIMARY_DEVICE = HOTONE_DEVICES["jogg"]


# ============================================================================
# TASCAM DEVICE DEFINITIONS
# ============================================================================

@dataclass
class TascamDevice:
    """TASCAM USB audio device specification.

    Note: TASCAM US-series interfaces are NOT USB Audio Class compliant — they
    require the vendor-specific kernel driver `snd-usb-us144mkii` (in-tree on
    kernel >= 6.x). The driver performs a two-stage USB enumeration: device
    appears initially as the boot/loader PID, then re-enumerates to the
    operational PID after firmware upload.
    """
    name: str
    vendor_id: str
    product_id: str               # operational PID (post firmware upload)
    boot_product_id: str          # transient boot/loader PID
    description: str
    sample_rates: List[int] = field(default_factory=lambda: [44100, 48000, 88200, 96000])
    bit_depth: int = 24
    channels_in: int = 4          # 2 analog + 2 S/PDIF
    channels_out: int = 4         # 2 analog + 2 S/PDIF
    usb_class: str = "Vendor-specific (snd-usb-us144mkii)"
    kernel_module: str = "snd-usb-us144mkii"


TASCAM_DEVICES = {
    "us-144mkii": TascamDevice(
        name="TASCAM US-144MKII",
        vendor_id="0644",
        product_id="8020",
        boot_product_id="800F",
        description="TASCAM US-144MKII 4x4 USB 2.0 audio interface (2 analog + 2 S/PDIF coax)",
        sample_rates=[44100, 48000, 88200, 96000],
        bit_depth=24,
        channels_in=4,
        channels_out=4,
    ),
}


@dataclass
class USBDeviceStatus:
    """USB device status information."""
    vendor_id: str
    product_id: str
    name: str
    bus: str
    device: str
    speed: str
    power_control: str  # "on" or "auto"
    autosuspend_delay: int
    is_connected: bool
    alsa_card: Optional[str] = None
    alsa_device: Optional[str] = None
    sample_rate: Optional[int] = None
    is_hotone: bool = False
    hotone_model: Optional[str] = None


class USBAudioManager:
    """
    Manages USB audio devices with focus on Hotone interfaces.

    Provides:
    - Device detection and enumeration
    - USB power management (disable autosuspend)
    - ALSA configuration
    - Status monitoring
    """

    def __init__(self):
        self.detected_devices: List[USBDeviceStatus] = []
        self.primary_device: Optional[USBDeviceStatus] = None

    def detect_usb_devices(self) -> List[USBDeviceStatus]:
        """Detect all USB audio devices."""
        devices = []

        try:
            # Run lsusb to get USB devices
            result = subprocess.run(
                ["lsusb"],
                capture_output=True,
                text=True,
                timeout=5
            )

            if result.returncode != 0:
                logger.error(f"lsusb failed: {result.stderr}")
                return devices

            for line in result.stdout.strip().split('\n'):
                # Parse: Bus 001 Device 004: ID 84ef:0014 HotoneAudio Jogg USB Audio
                match = re.match(
                    r'Bus (\d+) Device (\d+): ID ([0-9a-f]+):([0-9a-f]+)\s*(.*)',
                    line, re.IGNORECASE
                )
                if match:
                    bus, device_num, vendor_id, product_id, name = match.groups()

                    # Check if it's a Hotone device
                    is_hotone = vendor_id.lower() == "84ef"
                    hotone_model = None

                    if is_hotone:
                        # Find which Hotone model
                        for model_name, model_spec in HOTONE_DEVICES.items():
                            if model_spec.product_id == product_id.lower():
                                hotone_model = model_name
                                name = model_spec.name
                                break

                    # Get power management status
                    power_control, autosuspend = self._get_usb_power_status(bus, device_num)

                    # Get ALSA card info
                    alsa_card, alsa_device = self._get_alsa_info(vendor_id, product_id)

                    # Get USB speed
                    speed = self._get_usb_speed(bus, device_num)

                    device_status = USBDeviceStatus(
                        vendor_id=vendor_id,
                        product_id=product_id,
                        name=name.strip() if name else "Unknown",
                        bus=bus,
                        device=device_num,
                        speed=speed,
                        power_control=power_control,
                        autosuspend_delay=autosuspend,
                        is_connected=True,
                        alsa_card=alsa_card,
                        alsa_device=alsa_device,
                        is_hotone=is_hotone,
                        hotone_model=hotone_model,
                    )

                    is_audio_device = (
                        is_hotone
                        or "audio" in name.lower()
                        or vendor_id.lower() in AUDIO_INTERFACE_VENDOR_IDS
                    )

                    # Only add USB audio devices.
                    if is_audio_device:
                        devices.append(device_status)

        except subprocess.TimeoutExpired:
            logger.error("lsusb timed out")
        except FileNotFoundError:
            logger.error("lsusb not found - install usbutils")
        except Exception as e:
            logger.error(f"Error detecting USB devices: {e}")

        self.detected_devices = devices

        # Set primary device if Hotone found
        for dev in devices:
            if dev.is_hotone:
                self.primary_device = dev
                break

        return devices

    def _get_usb_power_status(self, bus: str, device: str) -> tuple:
        """Get USB device power management status."""
        power_control = "unknown"
        autosuspend = -1

        # Find the sysfs path for this device
        try:
            # Look for device in /sys/bus/usb/devices/
            for entry in Path("/sys/bus/usb/devices").iterdir():
                if entry.is_dir():
                    busnum_path = entry / "busnum"
                    devnum_path = entry / "devnum"

                    if busnum_path.exists() and devnum_path.exists():
                        try:
                            busnum = busnum_path.read_text().strip()
                            devnum = devnum_path.read_text().strip()

                            if busnum == bus and devnum == device:
                                # Found the device
                                power_path = entry / "power"

                                control_path = power_path / "control"
                                if control_path.exists():
                                    power_control = control_path.read_text().strip()

                                autosuspend_path = power_path / "autosuspend_delay_ms"
                                if autosuspend_path.exists():
                                    autosuspend = int(autosuspend_path.read_text().strip())

                                break
                        except (ValueError, IOError):
                            continue
        except Exception as e:
            logger.debug(f"Could not get power status: {e}")

        return power_control, autosuspend

    def _get_usb_speed(self, bus: str, device: str) -> str:
        """Get USB device speed."""
        try:
            for entry in Path("/sys/bus/usb/devices").iterdir():
                if entry.is_dir():
                    busnum_path = entry / "busnum"
                    devnum_path = entry / "devnum"

                    if busnum_path.exists() and devnum_path.exists():
                        try:
                            busnum = busnum_path.read_text().strip()
                            devnum = devnum_path.read_text().strip()

                            if busnum == bus and devnum == device:
                                speed_path = entry / "speed"
                                if speed_path.exists():
                                    speed_val = speed_path.read_text().strip()
                                    # Convert to human readable
                                    speed_map = {
                                        "1.5": "Low Speed (1.5 Mbps)",
                                        "12": "Full Speed (12 Mbps)",
                                        "480": "High Speed (480 Mbps)",
                                        "5000": "SuperSpeed (5 Gbps)",
                                        "10000": "SuperSpeed+ (10 Gbps)",
                                    }
                                    return speed_map.get(speed_val, f"{speed_val} Mbps")
                        except (ValueError, IOError):
                            continue
        except Exception as e:
            logger.debug(f"Could not get USB speed: {e}")

        return "Unknown"

    def _get_alsa_info(self, vendor_id: str, product_id: str) -> tuple:
        """Get ALSA card and device info for a USB device."""
        alsa_card = None
        alsa_device = None

        try:
            # Check /proc/asound/cards
            cards_path = Path("/proc/asound/cards")
            if cards_path.exists():
                cards_content = cards_path.read_text()

                # Look for the device in ALSA cards
                for line in cards_content.split('\n'):
                    # Format: " 0 [USB            ]: USB-Audio - Jogg USB Audio"
                    match = re.match(r'\s*(\d+)\s+\[(\w+)\s*\]', line)
                    if match:
                        card_num, card_id = match.groups()

                        # Check if this card matches our USB device
                        card_path = Path(f"/proc/asound/card{card_num}")
                        if card_path.exists():
                            usbid_path = card_path / "usbid"
                            if usbid_path.exists():
                                usbid = usbid_path.read_text().strip()
                                if f"{vendor_id}:{product_id}".lower() in usbid.lower():
                                    alsa_card = card_num
                                    alsa_device = f"hw:{card_num},0"
                                    break
        except Exception as e:
            logger.debug(f"Could not get ALSA info: {e}")

        return alsa_card, alsa_device

    def disable_autosuspend(self, device: Optional[USBDeviceStatus] = None) -> bool:
        """
        Disable USB autosuspend for a device.

        Args:
            device: Specific device, or None for primary Hotone device

        Returns:
            True if successful
        """
        if device is None:
            device = self.primary_device

        if device is None:
            logger.warning("No device specified and no primary device found")
            return False

        try:
            # Find sysfs path
            for entry in Path("/sys/bus/usb/devices").iterdir():
                if entry.is_dir():
                    busnum_path = entry / "busnum"
                    devnum_path = entry / "devnum"

                    if busnum_path.exists() and devnum_path.exists():
                        try:
                            busnum = busnum_path.read_text().strip()
                            devnum = devnum_path.read_text().strip()

                            if busnum == device.bus and devnum == device.device:
                                control_path = entry / "power" / "control"

                                if control_path.exists():
                                    # Try to write directly (requires root)
                                    try:
                                        control_path.write_text("on")
                                        logger.info(f"Disabled autosuspend for {device.name}")
                                        return True
                                    except PermissionError:
                                        # Try with sudo
                                        result = subprocess.run(
                                            ["sudo", "sh", "-c", f"echo on > {control_path}"],
                                            capture_output=True,
                                            timeout=5
                                        )
                                        if result.returncode == 0:
                                            logger.info(f"Disabled autosuspend for {device.name} (via sudo)")
                                            return True
                                        else:
                                            logger.error(f"Failed to disable autosuspend: {result.stderr}")
                                break
                        except (ValueError, IOError):
                            continue
        except Exception as e:
            logger.error(f"Error disabling autosuspend: {e}")

        return False

    def disable_all_hotone_autosuspend(self) -> int:
        """
        Disable autosuspend for all Hotone devices.

        Returns:
            Number of devices configured
        """
        count = 0
        for device in self.detected_devices:
            if device.is_hotone:
                if self.disable_autosuspend(device):
                    count += 1
        return count

    def create_udev_rules(self) -> str:
        """
        Generate udev rules for all Hotone devices.

        Returns:
            udev rules content
        """
        rules = [
            "# Hotone USB Audio Devices - Disable autosuspend for low latency",
            "# Install to: /etc/udev/rules.d/90-hotone-audio.rules",
            "# Then run: sudo udevadm control --reload-rules && sudo udevadm trigger",
            "",
        ]

        for model_name, device in HOTONE_DEVICES.items():
            rules.append(f"# {device.description}")
            rules.append(
                f'ACTION=="add", SUBSYSTEM=="usb", '
                f'ATTR{{idVendor}}=="{device.vendor_id}", '
                f'ATTR{{idProduct}}=="{device.product_id}", '
                f'TEST=="power/control", ATTR{{power/control}}="on"'
            )
            rules.append("")

        # Add generic rule for all Hotone devices (vendor ID 84ef)
        rules.append("# All Hotone devices (generic rule)")
        rules.append(
            'ACTION=="add", SUBSYSTEM=="usb", '
            'ATTR{idVendor}=="84ef", '
            'TEST=="power/control", ATTR{power/control}="on"'
        )

        return "\n".join(rules)

    def install_udev_rules(self) -> bool:
        """
        Install udev rules for Hotone devices.

        Returns:
            True if successful
        """
        rules_content = self.create_udev_rules()
        rules_path = "/etc/udev/rules.d/90-hotone-audio.rules"

        try:
            # Write to temp file first
            temp_path = "/tmp/90-hotone-audio.rules"
            with open(temp_path, 'w') as f:
                f.write(rules_content)

            # Copy with sudo
            result = subprocess.run(
                ["sudo", "cp", temp_path, rules_path],
                capture_output=True,
                timeout=10
            )

            if result.returncode != 0:
                logger.error(f"Failed to install udev rules: {result.stderr}")
                return False

            # Reload udev rules
            subprocess.run(
                ["sudo", "udevadm", "control", "--reload-rules"],
                capture_output=True,
                timeout=10
            )
            subprocess.run(
                ["sudo", "udevadm", "trigger"],
                capture_output=True,
                timeout=10
            )

            logger.info("Installed udev rules for Hotone devices")
            return True

        except Exception as e:
            logger.error(f"Error installing udev rules: {e}")
            return False

    def create_alsa_config(self) -> str:
        """
        Generate optimized ALSA configuration for Hotone devices.

        Returns:
            ALSA config content
        """
        device = self.primary_device
        alsa_device = device.alsa_device if device else "hw:0,0"

        config = f'''# MAP2 Audio - Optimized ALSA Configuration for Hotone USB Audio
# Install to: ~/.asoundrc or /etc/asound.conf

# Default device - Hotone
pcm.!default {{
    type plug
    slave.pcm "hotone"
}}

ctl.!default {{
    type hw
    card 0
}}

# Hotone device with optimized settings
pcm.hotone {{
    type plug
    slave {{
        pcm "{alsa_device}"
        rate 48000
        channels 2
        format S24_3LE
    }}
}}

# Low-latency playback
pcm.hotone_playback {{
    type plug
    slave {{
        pcm "{alsa_device}"
        rate 48000
        channels 2
        format S24_3LE
        period_size 64
        buffer_size 256
    }}
}}

# Low-latency capture
pcm.hotone_capture {{
    type plug
    slave {{
        pcm "{alsa_device}"
        rate 48000
        channels 2
        format S24_3LE
        period_size 64
        buffer_size 256
    }}
}}

# Full duplex for simultaneous input/output
pcm.hotone_duplex {{
    type asym
    playback.pcm "hotone_playback"
    capture.pcm "hotone_capture"
}}

# Software mixing (if needed for multiple applications)
pcm.hotone_dmix {{
    type dmix
    ipc_key 1024
    slave {{
        pcm "{alsa_device}"
        rate 48000
        channels 2
        format S24_3LE
        period_size 128
        buffer_size 512
    }}
}}
'''
        return config

    def get_device_status_dict(self) -> Dict[str, Any]:
        """
        Get comprehensive device status as a dictionary.

        Returns:
            Dictionary with device status information
        """
        self.detect_usb_devices()

        hotone_devices = [d for d in self.detected_devices if d.is_hotone]
        primary = self.primary_device

        status = {
            "hotone_detected": len(hotone_devices) > 0,
            "device_count": len(self.detected_devices),
            "primary_device": None,
            "all_devices": [],
            "recommendations": [],
        }

        if primary:
            status["primary_device"] = {
                "name": primary.name,
                "vendor_id": primary.vendor_id,
                "product_id": primary.product_id,
                "model": primary.hotone_model,
                "bus": primary.bus,
                "device": primary.device,
                "usb_speed": primary.speed,
                "power_control": primary.power_control,
                "autosuspend_delay_ms": primary.autosuspend_delay,
                "alsa_card": primary.alsa_card,
                "alsa_device": primary.alsa_device,
                "is_autosuspend_disabled": primary.power_control == "on",
            }

            # Add recommendations
            if primary.power_control != "on":
                status["recommendations"].append(
                    "USB autosuspend is enabled - recommend disabling for lower latency"
                )

            if "Full Speed" in primary.speed:
                status["recommendations"].append(
                    "Device running at Full Speed (12 Mbps) - this is normal for USB Audio Class 2.0"
                )

        for dev in self.detected_devices:
            status["all_devices"].append({
                "name": dev.name,
                "model": dev.hotone_model,
                "bus": dev.bus,
                "device": dev.device,
                "alsa_device": dev.alsa_device,
                "power_control": dev.power_control,
                "is_hotone": dev.is_hotone,
            })

        return status


# Global instance
_usb_manager: Optional[USBAudioManager] = None
_usb_manager_lock = threading.Lock()


def get_usb_manager() -> USBAudioManager:
    """Get global USB audio manager instance."""
    global _usb_manager
    if _usb_manager is None:
        with _usb_manager_lock:
            if _usb_manager is None:
                _usb_manager = USBAudioManager()
    return _usb_manager
