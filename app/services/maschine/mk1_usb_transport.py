"""USB bulk transport for the Maschine MK1, using pyusb (libusb-1.0).

Thin layer that owns the device handle and exposes ``open()``, ``close()``,
``write_leds()``, ``write_display_frame()``, ``read_pads()``, and
``read_buttons_encoders()``. Wire encoding lives in :mod:`mk1_protocol`.

Kernel-driver handling:
    The in-tree ``snd-usb-caiaq`` module claims this device by default. When
    ``allow_kernel_detach`` is True (the default), we call
    ``libusb_set_auto_detach_kernel_driver(1)`` which tells libusb to detach
    on claim and reattach on release. The recommended deployment blacklists
    the kernel module outright (see ``/etc/modprobe.d/blacklist-maschine-caiaq.conf``);
    detach is a belt-and-braces fallback.
"""

from __future__ import annotations

import logging
import time
from typing import Any

try:
    import usb.core  # type: ignore
    import usb.util  # type: ignore
except Exception:  # pragma: no cover - pyusb is required at runtime
    usb = None  # type: ignore

from app.services.maschine.mk1_protocol import (
    DISPLAY_FRAMEBUFFER_SIZE,
    EP_BUTTONS_IN,
    EP_CONTROL_OUT,
    EP_DISPLAY_OUT,
    EP_PADS_IN,
    INTERFACE_ALT_SETTING,
    INTERFACE_NUMBER,
    LED_CHANNEL_PRIMER,
    PAD_DATA_SIZE,
    PRODUCT_ID,
    VENDOR_ID,
    build_display_frame_packets,
    build_display_init_packets,
    build_led_packet,
)

LOGGER = logging.getLogger("maschine_mk1_usb_transport")


class MaschineMK1NotFound(RuntimeError):
    """Device with vendor 0x17CC / product 0x0808 was not enumerated."""


class MaschineMK1UsbTransport:
    """Owning handle for one Maschine MK1 USB device."""

    def __init__(self, *, allow_kernel_detach: bool = True) -> None:
        if usb is None:
            raise RuntimeError(
                "pyusb is not installed; install pyusb>=1.2 to use the Maschine MK1 transport"
            )
        self._allow_kernel_detach = allow_kernel_detach
        self._device: Any | None = None
        self._opened: bool = False

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    @property
    def is_open(self) -> bool:
        return self._opened

    def open(self) -> None:
        device = usb.core.find(idVendor=VENDOR_ID, idProduct=PRODUCT_ID)
        if device is None:
            raise MaschineMK1NotFound(
                f"No USB device with VID:PID {VENDOR_ID:04x}:{PRODUCT_ID:04x} found"
            )

        if self._allow_kernel_detach:
            try:
                if device.is_kernel_driver_active(INTERFACE_NUMBER):
                    device.detach_kernel_driver(INTERFACE_NUMBER)
            except (NotImplementedError, AttributeError) as exc:
                LOGGER.debug("kernel driver query unavailable: %s", exc)
            except usb.core.USBError as exc:  # type: ignore[attr-defined]
                LOGGER.warning("kernel driver detach failed: %s", exc)

        device.set_configuration()
        usb.util.claim_interface(device, INTERFACE_NUMBER)
        device.set_interface_altsetting(interface=INTERFACE_NUMBER, alternate_setting=INTERFACE_ALT_SETTING)

        self._device = device
        self._opened = True
        LOGGER.info("Maschine MK1 USB transport opened (bus=%s addr=%s)", device.bus, device.address)

    def close(self) -> None:
        if not self._opened or self._device is None:
            return
        device = self._device
        try:
            usb.util.release_interface(device, INTERFACE_NUMBER)
        except Exception as exc:  # pragma: no cover - best-effort cleanup
            LOGGER.debug("release_interface error: %s", exc)
        try:
            usb.util.dispose_resources(device)
        except Exception as exc:  # pragma: no cover
            LOGGER.debug("dispose_resources error: %s", exc)
        self._device = None
        self._opened = False

    # ------------------------------------------------------------------
    # Initialization (display + LED primer)
    # ------------------------------------------------------------------

    def initialize_device(self) -> None:
        """Run the full post-open init: LCD init + black frame + LED primer.

        Matches cabl ``MaschineMK1::init`` ordering exactly: for each display,
        run the KS0713 init sequence and push one black frame; then send the
        LED channel primer on EP 0x01. After this returns the device is ready
        for ``write_display_frame`` and ``write_leds``.
        """
        if self._device is None:
            raise RuntimeError("transport is not open")
        black = bytes(DISPLAY_FRAMEBUFFER_SIZE)
        for display_index in (0, 1):
            for packet, post_delay_ms in build_display_init_packets(display_index):
                self._write(EP_DISPLAY_OUT, packet)
                if post_delay_ms:
                    time.sleep(post_delay_ms / 1000.0)
        for display_index in (0, 1):
            for packet in build_display_frame_packets(display_index, black):
                self._write(EP_DISPLAY_OUT, packet)
        self._write(EP_CONTROL_OUT, LED_CHANNEL_PRIMER)

    # ------------------------------------------------------------------
    # Output
    # ------------------------------------------------------------------

    def write_leds(self, led_state: "list[int] | tuple[int, ...]") -> None:
        if self._device is None:
            raise RuntimeError("transport is not open")
        self._write(EP_CONTROL_OUT, build_led_packet(led_state))

    def write_display_frame(self, display_index: int, framebuffer: bytes) -> None:
        if self._device is None:
            raise RuntimeError("transport is not open")
        for packet in build_display_frame_packets(display_index, framebuffer):
            self._write(EP_DISPLAY_OUT, packet)

    # ------------------------------------------------------------------
    # Input
    # ------------------------------------------------------------------

    def read_pads(self, timeout_ms: int = 2) -> bytes | None:
        return self._read(EP_PADS_IN, PAD_DATA_SIZE, timeout_ms)

    def read_buttons_encoders(self, timeout_ms: int = 2) -> bytes | None:
        return self._read(EP_BUTTONS_IN, 64, timeout_ms)

    # ------------------------------------------------------------------
    # Private
    # ------------------------------------------------------------------

    def _write(self, endpoint: int, payload: bytes) -> None:
        assert self._device is not None
        self._device.write(endpoint, payload, timeout=500)

    def _read(self, endpoint: int, length: int, timeout_ms: int) -> bytes | None:
        assert self._device is not None
        try:
            data = self._device.read(endpoint, length, timeout=timeout_ms)
        except usb.core.USBTimeoutError:  # type: ignore[attr-defined]
            return None
        except usb.core.USBError as exc:  # type: ignore[attr-defined]
            # libusb returns ETIMEDOUT as USBError on some platforms.
            if getattr(exc, "errno", None) == 110:
                return None
            raise
        return bytes(data)
