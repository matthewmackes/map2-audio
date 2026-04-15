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
import threading
import time
from collections import deque
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
        # Background pad drainer — MANDATORY. The MK1 streams ~23 kB/s of pad
        # pressure data on EP 0x84; if the host doesn't consume it, EP 0x01
        # OUT (LEDs / primer / MIDI) wedges and returns ETIMEDOUT on every
        # write until a physical replug OR a drain. See
        # scripts/maschine_unwedge_test.py — H2/H3 prove drain is required.
        self._drain_thread: threading.Thread | None = None
        self._drain_stop = threading.Event()
        self._pad_queue: deque[bytes] = deque(maxlen=256)
        self._button_queue: deque[bytes] = deque(maxlen=256)
        self._queue_lock = threading.Lock()
        self._write_lock = threading.Lock()

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
        self._drain_stop.clear()
        self._drain_thread = threading.Thread(
            target=self._drain_loop,
            name="maschine-mk1-pad-drain",
            daemon=True,
        )
        self._drain_thread.start()
        LOGGER.info("Maschine MK1 USB transport opened (bus=%s addr=%s)", device.bus, device.address)

    def close(self) -> None:
        if not self._opened or self._device is None:
            return
        self._drain_stop.set()
        thread = self._drain_thread
        self._drain_thread = None
        if thread is not None:
            thread.join(timeout=1.0)
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
        # cabl's 'black' framebuffer is 0xFF bytes (the panel is inverted).
        black = b"\xff" * DISPLAY_FRAMEBUFFER_SIZE
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
        """Return the most-recent pad frame captured by the drain thread.

        ``timeout_ms`` is kept for call-site compatibility but is unused —
        the drain thread continuously services EP 0x84 in the background,
        so reads are non-blocking pops from an in-memory queue.
        """
        del timeout_ms
        with self._queue_lock:
            if self._pad_queue:
                return self._pad_queue.popleft()
        return None

    def read_buttons_encoders(self, timeout_ms: int = 2) -> bytes | None:
        del timeout_ms
        with self._queue_lock:
            if self._button_queue:
                return self._button_queue.popleft()
        return None

    # ------------------------------------------------------------------
    # Private
    # ------------------------------------------------------------------

    def _write(self, endpoint: int, payload: bytes) -> None:
        assert self._device is not None
        with self._write_lock:
            self._device.write(endpoint, payload, timeout=500)

    def _read_raw(self, endpoint: int, length: int, timeout_ms: int) -> bytes | None:
        assert self._device is not None
        try:
            data = self._device.read(endpoint, length, timeout=timeout_ms)
        except usb.core.USBTimeoutError:  # type: ignore[attr-defined]
            return None
        except usb.core.USBError as exc:  # type: ignore[attr-defined]
            if getattr(exc, "errno", None) == 110:
                return None
            return None
        return bytes(data)

    def _drain_loop(self) -> None:
        """Background worker — consume EP 0x84 (pads) + EP 0x81 (buttons).

        The MK1 will wedge EP 0x01 OUT (LEDs) within ~50 ms if nobody reads
        the pad IN endpoint. This loop runs from open() until close() and
        queues the latest frames for the consumer. Per-frame latency is
        bounded by the USB poll interval (~1 ms at high speed).
        """
        LOGGER.debug("pad drain loop started")
        while not self._drain_stop.is_set():
            if self._device is None:
                break
            pad = self._read_raw(EP_PADS_IN, PAD_DATA_SIZE, timeout_ms=1)
            if pad:
                with self._queue_lock:
                    self._pad_queue.append(pad)
            btn = self._read_raw(EP_BUTTONS_IN, 64, timeout_ms=1)
            if btn:
                with self._queue_lock:
                    self._button_queue.append(btn)
        LOGGER.debug("pad drain loop exiting")
