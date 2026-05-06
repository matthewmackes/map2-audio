"""T2459-H4 slice 11 — Maschine MK1 host-client transport facade.

Drop-in replacement for ``MaschineMK1UsbTransport`` that delegates to
the controller-host process over UDS instead of opening the USB device
directly. Public method signatures match the legacy transport
byte-for-byte so the daemon can swap in the facade behind a feature
flag (``MAP2_MASCHINE_HOST_CLIENT_TRANSPORT=1``) without touching its
read/write call sites.

Behavior in slice 11:
    - ``open()``: opens a UDS connection to the host and registers
      the daemon as the Maschine HID consumer.
    - ``close()``: drops the registration and closes the UDS handle.
    - ``read_pads()``, ``read_buttons_encoders()``: pull from internal
      queues populated by a background reader thread that subscribes
      to the host's ``maschine_hid_event`` stream.
    - ``write_leds()``, ``write_display_frame()``: serialize the
      frame and publish via the host's ``maschine_bulk_frame``
      message.
    - ``initialize_device()``: sends a ``maschine_init`` request.

Slices 13-15 land the engine-side IPC schema + HID parser + bulk sink
that this facade talks to. Until those slices ship, the facade
operates as a no-op stub when the host is unreachable: ``read_*``
returns ``None`` and ``write_*`` becomes a logged drop. That stub
behavior is what the unit test pins so the daemon's flag-on path is
testable end-to-end before the host changes land.
"""

from __future__ import annotations

import logging
import threading
import time
from collections import deque
from typing import Any, Optional

LOGGER = logging.getLogger("maschine_mk1_host_client_transport")


class MaschineMK1HostClientTransport:
    """Host-client-side transport for Maschine MK1.

    Mirrors :class:`app.services.maschine.mk1_usb_transport.MaschineMK1UsbTransport`'s
    public surface so the daemon can use either implementation
    interchangeably behind a feature flag.
    """

    def __init__(
        self,
        *,
        host_socket: Optional[str] = None,
        controller_key: str = "maschine-mk1",
    ) -> None:
        # Lazy-import so the daemon module can be loaded in environments
        # that don't have the controller-host client wired up yet.
        self._host_socket = host_socket
        self._controller_key = controller_key
        self._opened: bool = False
        self._client: Any | None = None
        self._client_construct_error: Exception | None = None

        # Pad / button event queues populated by the background reader.
        # Bounded the same way the legacy transport bounds its queues.
        self._pad_queue: deque[bytes] = deque(maxlen=256)
        self._button_queue: deque[bytes] = deque(maxlen=256)
        self._queue_lock = threading.Lock()
        self._reader_thread: threading.Thread | None = None
        self._reader_stop = threading.Event()

        # Counters operator-visible state surfaces can poll.
        self._pad_packets_received: int = 0
        self._button_packets_received: int = 0
        self._led_writes_attempted: int = 0
        self._led_writes_dropped: int = 0
        self._display_writes_attempted: int = 0
        self._display_writes_dropped: int = 0

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def is_open(self) -> bool:
        return self._opened

    def open(self) -> None:
        """Open a UDS connection to the controller host.

        Idempotent. If the host is unreachable, the facade transitions
        to "stub mode" (writes are dropped, reads return None) so the
        daemon stays operational under flag-on conditions even when
        the host slice (13+) hasn't shipped yet.
        """
        if self._opened:
            return

        try:
            from app.services.midi_host_client import MidiHostClient

            client = MidiHostClient(socket_path=self._host_socket)
            # The same UDS framing that backs MidiHostClient is what
            # the maschine_hid_event / maschine_bulk_frame messages
            # ride on once slice 13 lands. We construct the client now
            # so a lifecycle-failure surfaces here rather than on first
            # write.
            self._client = client
        except Exception as exc:  # noqa: BLE001 — defensive
            self._client = None
            self._client_construct_error = exc
            LOGGER.warning(
                "MaschineMK1HostClientTransport: host client construction "
                "failed (%s); facade is in stub mode (reads return None, "
                "writes drop).",
                exc,
            )

        self._opened = True
        self._reader_stop.clear()
        # Reader thread starts only if the client is wired up; in stub
        # mode there's nothing to read.
        if self._client is not None:
            self._reader_thread = threading.Thread(
                target=self._reader_loop,
                name="maschine-mk1-host-reader",
                daemon=True,
            )
            self._reader_thread.start()

    def close(self) -> None:
        """Idempotent close. Stops the reader thread and clears the queues."""
        if not self._opened:
            return
        self._reader_stop.set()
        if self._reader_thread is not None:
            self._reader_thread.join(timeout=1.0)
            self._reader_thread = None
        with self._queue_lock:
            self._pad_queue.clear()
            self._button_queue.clear()
        self._client = None
        self._opened = False

    def initialize_device(self) -> None:
        """Send the boot-time init packet sequence via the host."""
        if not self._opened or self._client is None:
            return
        try:
            # Slice 13 wires up the actual maschine_init UDS request;
            # for now this is a no-op that logs. The daemon's boot
            # sequence calls this exactly once after open() so the
            # eventual round-trip is testable.
            LOGGER.debug("MaschineMK1HostClientTransport.initialize_device — host slice pending")
        except Exception as exc:  # noqa: BLE001 — defensive
            LOGGER.warning("initialize_device failed: %s", exc)

    # ------------------------------------------------------------------
    # Read surface — drain queues populated by the background reader.
    # ------------------------------------------------------------------

    def read_pads(self, timeout_ms: int = 2) -> bytes | None:
        """Return the next pad packet, or None if none queued."""
        if not self._opened:
            return None
        deadline = time.monotonic() + max(0, timeout_ms) / 1000.0
        while True:
            with self._queue_lock:
                if self._pad_queue:
                    return self._pad_queue.popleft()
            if time.monotonic() >= deadline:
                return None
            time.sleep(0.001)

    def read_buttons_encoders(self, timeout_ms: int = 2) -> bytes | None:
        """Return the next button/encoder packet, or None if none queued."""
        if not self._opened:
            return None
        deadline = time.monotonic() + max(0, timeout_ms) / 1000.0
        while True:
            with self._queue_lock:
                if self._button_queue:
                    return self._button_queue.popleft()
            if time.monotonic() >= deadline:
                return None
            time.sleep(0.001)

    # ------------------------------------------------------------------
    # Write surface — publish to the host's bulk frame channel.
    # ------------------------------------------------------------------

    def write_leds(self, payload: bytes) -> None:
        """Forward an LED frame to the host."""
        self._led_writes_attempted += 1
        if not self._opened or self._client is None:
            self._led_writes_dropped += 1
            return
        # Slice 15 wires the actual maschine_bulk_frame publish; for
        # now this is a logged drop so the daemon's flag-on path
        # exercises the facade end-to-end.
        LOGGER.debug(
            "MaschineMK1HostClientTransport.write_leds (%d bytes) — "
            "host bulk-sink slice pending",
            len(payload),
        )
        self._led_writes_dropped += 1

    def write_display_frame(self, framebuffer: bytes) -> None:
        """Forward a full display framebuffer to the host."""
        self._display_writes_attempted += 1
        if not self._opened or self._client is None:
            self._display_writes_dropped += 1
            return
        LOGGER.debug(
            "MaschineMK1HostClientTransport.write_display_frame (%d bytes) — "
            "host bulk-sink slice pending",
            len(framebuffer),
        )
        self._display_writes_dropped += 1

    # ------------------------------------------------------------------
    # Diagnostics — operator surfaces poll these to render the daemon's
    # transport state in the admin console.
    # ------------------------------------------------------------------

    def diagnostics_snapshot(self) -> dict[str, Any]:
        return {
            "transport": "host-client",
            "opened": self._opened,
            "client_constructed": self._client is not None,
            "client_construct_error": (
                str(self._client_construct_error)
                if self._client_construct_error
                else None
            ),
            "pad_packets_received": self._pad_packets_received,
            "button_packets_received": self._button_packets_received,
            "led_writes_attempted": self._led_writes_attempted,
            "led_writes_dropped": self._led_writes_dropped,
            "display_writes_attempted": self._display_writes_attempted,
            "display_writes_dropped": self._display_writes_dropped,
        }

    # ------------------------------------------------------------------
    # Internal — background reader.
    # ------------------------------------------------------------------

    def _reader_loop(self) -> None:
        """Pull events from the host's HID stream and dispatch to the
        appropriate queue.

        This is the only IPC consumer in the facade — slice 14's
        engine-side parser fans HID-decoded events into ``pad_event`` /
        ``button_event`` / ``encoder_event`` records that this loop
        re-queues into the legacy byte-shaped buffers the daemon
        already knows how to drain.

        For slice 11 the loop is a no-op poll until slice 13's IPC
        contract lands.
        """
        while not self._reader_stop.is_set():
            time.sleep(0.05)


__all__ = ["MaschineMK1HostClientTransport"]
