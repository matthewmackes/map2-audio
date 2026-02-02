#!/usr/bin/env python3
"""
LCD Boot Status Display
Shows system boot progress on the LCD display via FT232H

This service starts early in the boot process and displays:
- Boot progress messages
- Service startup status
- System initialization info

Run as: python3 -m lcd.boot_display
"""

import os
import sys
import time
import signal
import logging
import subprocess
from typing import Optional, List
from dataclasses import dataclass
from enum import Enum

# Minimal logging for fast startup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class BootPhase(Enum):
    """Boot phases for display."""
    EARLY = "early"
    SERVICES = "services"
    NETWORK = "network"
    AUDIO = "audio"
    READY = "ready"


@dataclass
class BootMessage:
    """Boot status message."""
    line1: str
    line2: str
    phase: BootPhase = BootPhase.EARLY


class FT232HBootDisplay:
    """Minimal FT232H LCD driver for boot display.

    Uses direct I2C communication for reliability during early boot.
    """

    # PCF8574 pin mapping
    PIN_RS = 0x01
    PIN_RW = 0x02
    PIN_EN = 0x04
    PIN_BL = 0x08
    PIN_D4 = 0x10
    PIN_D5 = 0x20
    PIN_D6 = 0x40
    PIN_D7 = 0x80

    def __init__(self, lcd_address: int = 0x27, cols: int = 20, rows: int = 2):
        """Initialize boot display.

        Args:
            lcd_address: I2C address of LCD
            cols: Display columns
            rows: Display rows
        """
        self.lcd_address = lcd_address
        self.cols = cols
        self.rows = rows
        self.connected = False
        self.i2c = None
        self.port = None
        self.backlight_on = True

    def connect(self) -> bool:
        """Connect to LCD via FT232H.

        Returns:
            True if connected successfully
        """
        # Unload ftdi_sio if loaded (it blocks pyftdi)
        for attempt in range(3):
            try:
                result = subprocess.run(
                    ['modprobe', '-r', 'ftdi_sio'],
                    capture_output=True,
                    timeout=5
                )
                time.sleep(0.3)
                break
            except Exception:
                pass

        try:
            from pyftdi.i2c import I2cController

            self.i2c = I2cController()
            self.i2c.configure('ftdi://ftdi:232h/1', frequency=100000)
            self.port = self.i2c.get_port(self.lcd_address)

            # Initialize LCD
            self._init_lcd()
            self.connected = True
            logger.info(f"LCD connected at 0x{self.lcd_address:02X}")
            return True

        except Exception as e:
            logger.warning(f"LCD connection failed: {e}")
            self.connected = False
            return False

    def _write_byte(self, data: int):
        """Write byte to I2C."""
        if self.port:
            try:
                self.port.write([data])
                time.sleep(0.0005)
            except Exception:
                pass

    def _pulse_enable(self, data: int):
        """Pulse enable pin."""
        bl = self.PIN_BL if self.backlight_on else 0
        self._write_byte(data | self.PIN_EN | bl)
        time.sleep(0.0005)
        self._write_byte((data & ~self.PIN_EN) | bl)
        time.sleep(0.0001)

    def _write_4bits(self, data: int):
        """Write 4 bits."""
        bl = self.PIN_BL if self.backlight_on else 0
        self._write_byte(data | bl)
        self._pulse_enable(data)

    def _send(self, data: int, mode: int):
        """Send byte to LCD."""
        high = mode | (data & 0xF0)
        low = mode | ((data << 4) & 0xF0)
        self._write_4bits(high)
        self._write_4bits(low)

    def _command(self, cmd: int):
        """Send command."""
        self._send(cmd, 0)

    def _data(self, data: int):
        """Send data."""
        self._send(data, self.PIN_RS)

    def _init_lcd(self):
        """Initialize LCD in 4-bit mode."""
        time.sleep(0.05)
        self._write_4bits(0x30)
        time.sleep(0.005)
        self._write_4bits(0x30)
        time.sleep(0.001)
        self._write_4bits(0x30)
        time.sleep(0.001)
        self._write_4bits(0x20)

        self._command(0x28)  # 4-bit, 2-line
        self._command(0x0C)  # Display on, cursor off
        self.clear()
        self._command(0x06)  # Entry mode

    def clear(self):
        """Clear display."""
        if not self.connected:
            return
        self._command(0x01)
        time.sleep(0.002)

    def write_line(self, line: int, text: str, center: bool = False):
        """Write text to line.

        Args:
            line: Line number (0 or 1)
            text: Text to display
            center: Center the text
        """
        if not self.connected:
            return

        text = str(text)[:self.cols]
        if center:
            text = text.center(self.cols)
        else:
            text = text.ljust(self.cols)

        # Set cursor position
        addr = 0x80 if line == 0 else 0xC0
        self._command(addr)

        # Write characters
        for char in text:
            self._data(ord(char))

    def display(self, line1: str, line2: str = ""):
        """Display two lines of text.

        Args:
            line1: First line text
            line2: Second line text
        """
        self.write_line(0, line1)
        self.write_line(1, line2)

    def backlight(self, on: bool):
        """Control backlight."""
        self.backlight_on = on
        if self.connected:
            bl = self.PIN_BL if on else 0
            self._write_byte(bl)

    def close(self):
        """Close connection."""
        if self.i2c:
            try:
                self.i2c.terminate()
            except Exception:
                pass
        self.connected = False


class BootStatusService:
    """Boot status display service."""

    # Boot messages for each phase
    BOOT_MESSAGES = {
        BootPhase.EARLY: [
            BootMessage("MAP2 Audio System", "Initializing..."),
            BootMessage("MAP2 Audio System", "Loading kernel..."),
        ],
        BootPhase.SERVICES: [
            BootMessage("Starting Services", "systemd init..."),
            BootMessage("Starting Services", "Loading modules..."),
        ],
        BootPhase.NETWORK: [
            BootMessage("Network Setup", "Configuring..."),
            BootMessage("Network Setup", "Waiting for link..."),
        ],
        BootPhase.AUDIO: [
            BootMessage("Audio System", "Starting JACK..."),
            BootMessage("Audio System", "Loading plugins..."),
        ],
        BootPhase.READY: [
            BootMessage("System Ready", "MAP2 Audio v1.0"),
        ],
    }

    # Services to monitor
    MONITORED_SERVICES = [
        ("NetworkManager", "Network"),
        ("pipewire", "Audio: PipeWire"),
        ("jackd", "Audio: JACK"),
        ("map2-backend", "MAP2 Backend"),
    ]

    def __init__(self):
        """Initialize boot status service."""
        self.running = False
        self.lcd: Optional[FT232HBootDisplay] = None
        self.current_phase = BootPhase.EARLY

        # Signal handlers
        signal.signal(signal.SIGTERM, self._handle_signal)
        signal.signal(signal.SIGINT, self._handle_signal)

    def _handle_signal(self, signum, frame):
        """Handle shutdown signal."""
        logger.info(f"Received signal {signum}")
        self.stop()

    def _check_service_status(self, service: str) -> str:
        """Check systemd service status.

        Args:
            service: Service name

        Returns:
            Status string: 'running', 'starting', 'stopped', 'failed'
        """
        try:
            result = subprocess.run(
                ['systemctl', 'is-active', service],
                capture_output=True,
                text=True,
                timeout=2
            )
            status = result.stdout.strip()
            if status == 'active':
                return 'running'
            elif status == 'activating':
                return 'starting'
            elif status == 'failed':
                return 'failed'
            else:
                return 'stopped'
        except Exception:
            return 'unknown'

    def _get_boot_progress(self) -> tuple:
        """Get current boot progress.

        Returns:
            Tuple of (phase, message)
        """
        # Check which services are running
        services_up = 0
        last_service = ""

        for service, display_name in self.MONITORED_SERVICES:
            status = self._check_service_status(service)
            if status == 'running':
                services_up += 1
                last_service = display_name
            elif status == 'starting':
                return (BootPhase.SERVICES, f"Starting: {display_name}")
            elif status == 'failed':
                return (BootPhase.SERVICES, f"FAILED: {display_name}")

        # Determine phase based on services
        if services_up == 0:
            return (BootPhase.EARLY, "Initializing...")
        elif services_up < len(self.MONITORED_SERVICES):
            return (BootPhase.SERVICES, f"Started: {last_service}")
        else:
            return (BootPhase.READY, "All services up")

    def _get_system_info(self) -> str:
        """Get system info string."""
        try:
            # Get uptime
            with open('/proc/uptime', 'r') as f:
                uptime = float(f.read().split()[0])

            # Get IP address
            result = subprocess.run(
                ['hostname', '-I'],
                capture_output=True,
                text=True,
                timeout=2
            )
            ip = result.stdout.strip().split()[0] if result.stdout.strip() else "No IP"

            return f"Up:{uptime:.0f}s IP:{ip[:12]}"
        except Exception:
            return "System starting..."

    def start(self):
        """Start boot status service."""
        logger.info("Starting Boot Status Display")

        # Connect to LCD
        self.lcd = FT232HBootDisplay(lcd_address=0x27)

        if not self.lcd.connect():
            logger.error("Failed to connect to LCD")
            # Try alternate address
            self.lcd = FT232HBootDisplay(lcd_address=0x3F)
            if not self.lcd.connect():
                logger.error("No LCD found, exiting")
                return

        # Show initial boot message
        self.lcd.display(
            "MAP2 Audio System",
            "Booting..."
        )

        self.running = True
        boot_complete = False
        start_time = time.time()

        try:
            while self.running:
                # Get current boot status
                phase, message = self._get_boot_progress()

                # Update display
                if phase == BootPhase.READY:
                    if not boot_complete:
                        # Show ready message
                        self.lcd.display(
                            "MAP2 Audio Ready",
                            self._get_system_info()
                        )
                        boot_complete = True
                        logger.info("Boot complete, system ready")
                    else:
                        # Update system info periodically
                        self.lcd.write_line(1, self._get_system_info())
                else:
                    # Show boot progress
                    elapsed = time.time() - start_time
                    self.lcd.display(
                        f"Booting... {elapsed:.0f}s",
                        message[:20]
                    )

                time.sleep(1.0)

        except KeyboardInterrupt:
            logger.info("Interrupted")
        except Exception as e:
            logger.error(f"Error: {e}")
        finally:
            self.stop()

    def stop(self):
        """Stop boot status service."""
        self.running = False

        if self.lcd and self.lcd.connected:
            # Show shutdown message
            self.lcd.display(
                "MAP2 Audio System",
                "Shutting down..."
            )
            time.sleep(0.5)
            self.lcd.close()

        logger.info("Boot status service stopped")


def show_message(line1: str, line2: str = "", address: int = 0x27):
    """Quick function to show a message on the LCD.

    Args:
        line1: First line text
        line2: Second line text
        address: LCD I2C address
    """
    lcd = FT232HBootDisplay(lcd_address=address)
    if lcd.connect():
        lcd.display(line1, line2)
        lcd.close()


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description='MAP2 LCD Boot Status Display')
    parser.add_argument('--message', '-m', nargs=2, metavar=('LINE1', 'LINE2'),
                       help='Display a message and exit')
    parser.add_argument('--address', '-a', type=lambda x: int(x, 0), default=0x27,
                       help='LCD I2C address (default: 0x27)')
    parser.add_argument('--service', action='store_true',
                       help='Run as boot status service')

    args = parser.parse_args()

    if args.message:
        # Quick message display
        show_message(args.message[0], args.message[1], args.address)
    elif args.service:
        # Run as service
        service = BootStatusService()
        service.start()
    else:
        # Default: show boot message
        show_message("MAP2 Audio System", "Ready")


if __name__ == '__main__':
    main()
