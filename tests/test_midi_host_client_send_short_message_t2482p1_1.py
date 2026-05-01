"""T2482-P1.1 Gap A.1 — MidiHostClient.send_short_message() coverage.

The new send_short_message() helper is a drop-in replacement for the
rtmidi MidiOut.send_message() shape. It wraps MidiSendRequest with
format="midi1". Tests cover:

1. Payload shape — wire frame carries the short message bytes verbatim
   with format="midi1" + correct controller_key + valid msg_id.
2. Validation — empty / oversized / SysEx / data-byte-only inputs are
   rejected with MidiHostClientError before any IPC is attempted.

Mirrors the iter-41 send_ump tests (test_controller_host_ump_roundtrip_t2459h5).
"""

from __future__ import annotations

import socket
import threading
import unittest
import uuid
from pathlib import Path

from app.schemas.controller_host import SCHEMA_VERSION, decode_frame
from app.services.midi_host_client import (
    MidiHostClient,
    MidiHostClientError,
)


# ---------------------------------------------------------------------
# Fake UDS server — same pattern as the H5 UMP tests.
# ---------------------------------------------------------------------

class FakeUdsServer:
    """Minimal UDS server that captures one frame from the client."""

    def __init__(self, socket_path: Path) -> None:
        self._socket_path = socket_path
        self._sock: socket.socket | None = None
        self._thread: threading.Thread | None = None
        self.captured: list[dict] = []

    def start(self) -> None:
        if self._socket_path.exists():
            self._socket_path.unlink()
        self._sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self._sock.bind(str(self._socket_path))
        self._sock.listen(1)
        self._sock.settimeout(2.0)
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def _run(self) -> None:
        assert self._sock is not None
        try:
            conn, _ = self._sock.accept()
        except (OSError, socket.timeout):
            return
        try:
            buf = b""
            while True:
                chunk = conn.recv(4096)
                if not chunk:
                    break
                buf += chunk
                msg, rest = decode_frame(buf)
                if msg is not None:
                    self.captured.append(msg)
                    buf = rest
                    break
        finally:
            try:
                conn.close()
            except OSError:
                pass

    def stop(self) -> None:
        if self._sock is not None:
            try:
                self._sock.close()
            except OSError:
                pass
            self._sock = None
        if self._thread is not None:
            self._thread.join(timeout=2.0)
        if self._socket_path.exists():
            try:
                self._socket_path.unlink()
            except OSError:
                pass


# ---------------------------------------------------------------------
# Payload shape
# ---------------------------------------------------------------------

class SendShortMessagePayloadShapeTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = Path(f"/tmp/map2-shortmsg-test-{uuid.uuid4().hex}.sock")
        self._server = FakeUdsServer(self._tmp)
        self._server.start()
        self._client = MidiHostClient(socket_path=self._tmp, timeout_s=2.0)

    def tearDown(self) -> None:
        self._server.stop()

    def test_emits_format_midi1_frame_for_3_byte_cc(self) -> None:
        # CC 7 (volume) value 64 on channel 1.
        message = bytes([0xB0, 0x07, 0x40])
        msg_id = self._client.send_short_message(
            controller_key="ctrl-A", message_bytes=message
        )
        self.assertTrue(msg_id)
        self._server.stop()
        self.assertEqual(len(self._server.captured), 1)
        captured = self._server.captured[0]
        self.assertEqual(captured["type"], "midi_send_request")
        self.assertEqual(captured["controller_key"], "ctrl-A")
        self.assertEqual(captured["format"], "midi1")
        self.assertEqual(captured["bytes"], list(message))
        self.assertEqual(captured["schema_version"], SCHEMA_VERSION)

    def test_emits_format_midi1_frame_for_2_byte_program_change(self) -> None:
        # PC 42 on channel 1 is exactly 2 bytes: 0xC0, 42.
        message = bytes([0xC0, 42])
        msg_id = self._client.send_short_message(
            controller_key="ctrl-B", message_bytes=message
        )
        self.assertTrue(msg_id)
        self._server.stop()
        self.assertEqual(len(self._server.captured), 1)
        captured = self._server.captured[0]
        self.assertEqual(captured["bytes"], list(message))
        self.assertEqual(captured["format"], "midi1")

    def test_emits_format_midi1_frame_for_1_byte_realtime(self) -> None:
        # System real-time messages (Clock 0xF8, Start 0xFA, etc.) are
        # 1-byte status-only messages. NB: 0xF1..0xFE not 0xF0/0xF7.
        message = bytes([0xF8])  # MIDI Clock
        msg_id = self._client.send_short_message(
            controller_key="ctrl-C", message_bytes=message
        )
        self.assertTrue(msg_id)
        self._server.stop()
        captured = self._server.captured[0]
        self.assertEqual(captured["bytes"], [0xF8])
        self.assertEqual(captured["format"], "midi1")


# ---------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------

class SendShortMessageValidationTests(unittest.TestCase):
    """These never hit the wire — all errors raised before _send_only()."""

    def setUp(self) -> None:
        # Use a non-existent socket path; we expect errors before connect.
        self._client = MidiHostClient(
            socket_path=Path("/tmp/map2-shortmsg-validation-noexist.sock"),
            timeout_s=2.0,
        )

    def test_rejects_empty_message(self) -> None:
        with self.assertRaises(MidiHostClientError):
            self._client.send_short_message(controller_key="k", message_bytes=b"")

    def test_rejects_oversized_message(self) -> None:
        # Anything > 3 bytes is not a short message — caller should use
        # send_sysex() (Gap A.2) for SysEx.
        for bad in (b"\xB0\x07\x40\x00", b"\xB0" + b"\x00" * 10):
            with self.assertRaises(MidiHostClientError):
                self._client.send_short_message(controller_key="k", message_bytes=bad)

    def test_rejects_data_byte_first(self) -> None:
        # A data byte (high bit clear) cannot start a short message.
        with self.assertRaises(MidiHostClientError):
            self._client.send_short_message(
                controller_key="k", message_bytes=bytes([0x40, 0x00, 0x00])
            )

    def test_rejects_sysex_start_or_end(self) -> None:
        # SysEx must use send_sysex() (Gap A.2) — short-message path
        # explicitly rejects 0xF0 (start) and 0xF7 (end).
        for sysex_byte in (0xF0, 0xF7):
            with self.assertRaises(MidiHostClientError):
                self._client.send_short_message(
                    controller_key="k", message_bytes=bytes([sysex_byte])
                )


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
