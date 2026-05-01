"""T2482-P1.1 Gap A.2 — MidiHostClient.send_sysex() coverage.

The new send_sysex() helper is a drop-in replacement for the rtmidi
MidiOut.send_message(sysex_bytes) shape when the bytes are a full
SysEx envelope. Wraps MidiSendRequest with format="midi1".

Tests cover:
1. Payload shape — wire frame carries the SysEx bytes verbatim
   (including F0/F7 framing) for short, medium, and large envelopes
   (Lexicon MPX-1, Rocktron IntelFX, Voodoo Lab GCP-shaped).
2. Validation — empty / too-short / missing F0 / missing F7 /
   stray status bytes mid-body are all rejected before any IPC.
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
# Fake UDS server — same pattern as the H5 UMP + Gap A.1 short-msg suites.
# ---------------------------------------------------------------------

class FakeUdsServer:
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
                chunk = conn.recv(65536)
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

class SendSysexPayloadShapeTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = Path(f"/tmp/map2-sysex-test-{uuid.uuid4().hex}.sock")
        self._server = FakeUdsServer(self._tmp)
        self._server.start()
        self._client = MidiHostClient(socket_path=self._tmp, timeout_s=2.0)

    def tearDown(self) -> None:
        self._server.stop()

    def test_minimum_3_byte_envelope(self) -> None:
        # Smallest legal SysEx: F0 <body=00> F7
        envelope = bytes([0xF0, 0x00, 0xF7])
        msg_id = self._client.send_sysex(
            controller_key="ctrl-min", sysex_bytes=envelope
        )
        self.assertTrue(msg_id)
        self._server.stop()
        captured = self._server.captured[0]
        self.assertEqual(captured["type"], "midi_send_request")
        self.assertEqual(captured["format"], "midi1")
        self.assertEqual(captured["bytes"], list(envelope))
        self.assertEqual(captured["controller_key"], "ctrl-min")

    def test_lexicon_mpx1_program_change_envelope(self) -> None:
        # Real-world Lexicon MPX-1 mfr-ID-only program-change shape:
        # F0 06 <device> <program> ... F7
        # MPX-1 uses single-byte mfr ID 0x06 (matches mpx1.js).
        envelope = bytes([0xF0, 0x06, 0x00, 0x05] + [0x40, 0x41]
                          + list(b"Reverb1     ")
                          + [0x20] * 10
                          + [0xF7])
        self.assertEqual(envelope[0], 0xF0)
        self.assertEqual(envelope[-1], 0xF7)
        msg_id = self._client.send_sysex(
            controller_key="lexicon-mpx1", sysex_bytes=envelope
        )
        self.assertTrue(msg_id)
        self._server.stop()
        captured = self._server.captured[0]
        self.assertEqual(captured["bytes"], list(envelope))
        self.assertEqual(captured["controller_key"], "lexicon-mpx1")

    def test_rocktron_intelfx_3byte_mfr_id_envelope(self) -> None:
        # Real-world Rocktron IntelFX 3-byte mfr-ID shape:
        # F0 00 01 56 <device> 03 <hi> <lo> <name_16> ... F7
        nameBytes = list(b"PluckedString12 ")  # 16 chars
        envelope = bytes([0xF0, 0x00, 0x01, 0x56, 0x00, 0x03, 0x00, 0x09]
                          + nameBytes
                          + [0x20] * 8
                          + [0x55, 0xF7])  # checksum + F7
        msg_id = self._client.send_sysex(
            controller_key="rocktron-intelfx", sysex_bytes=envelope
        )
        self.assertTrue(msg_id)
        self._server.stop()
        captured = self._server.captured[0]
        self.assertEqual(captured["bytes"], list(envelope))

    def test_large_envelope_round_trips(self) -> None:
        # 1 KB body — well below the 4-GiB IPC cap.
        body = [(i & 0x7F) for i in range(1024)]  # all data bytes
        envelope = bytes([0xF0, 0x00, 0x00, 0x32] + body + [0xF7])
        msg_id = self._client.send_sysex(
            controller_key="ctrl-big", sysex_bytes=envelope
        )
        self.assertTrue(msg_id)
        self._server.stop()
        captured = self._server.captured[0]
        self.assertEqual(len(captured["bytes"]), len(envelope))
        self.assertEqual(captured["bytes"][0], 0xF0)
        self.assertEqual(captured["bytes"][-1], 0xF7)


# ---------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------

class SendSysexValidationTests(unittest.TestCase):
    def setUp(self) -> None:
        self._client = MidiHostClient(
            socket_path=Path("/tmp/map2-sysex-validation-noexist.sock"),
            timeout_s=2.0,
        )

    def test_rejects_empty(self) -> None:
        with self.assertRaises(MidiHostClientError):
            self._client.send_sysex(controller_key="k", sysex_bytes=b"")

    def test_rejects_under_3_bytes(self) -> None:
        for bad in (b"\xF0", b"\xF0\xF7"):
            with self.assertRaises(MidiHostClientError):
                self._client.send_sysex(controller_key="k", sysex_bytes=bad)

    def test_rejects_missing_f0_start(self) -> None:
        with self.assertRaises(MidiHostClientError):
            self._client.send_sysex(
                controller_key="k", sysex_bytes=bytes([0x06, 0x00, 0xF7])
            )

    def test_rejects_missing_f7_end(self) -> None:
        with self.assertRaises(MidiHostClientError):
            self._client.send_sysex(
                controller_key="k", sysex_bytes=bytes([0xF0, 0x06, 0x00])
            )

    def test_rejects_status_byte_in_body(self) -> None:
        # Mid-body byte with high bit set is a protocol violation.
        # 0xF8 (MIDI Clock) embedded in the body is the canonical
        # example of a stray status byte.
        bad = bytes([0xF0, 0x06, 0x00, 0xF8, 0x00, 0xF7])
        with self.assertRaises(MidiHostClientError):
            self._client.send_sysex(controller_key="k", sysex_bytes=bad)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
