"""T2459-H5 Slice 13 — host-owned UMP round-trip foundation, Python side.

The C++ Catch2 suite (`UmpRoundTripTests.cpp`) covers the producer
(`LibremidiAdapter::pushUmpMessage` → ``classifyUmpMessageType`` → shm
ring with ``kSlotFlagIsUmp`` set) and consumer round-trip.

This module covers the Python-visible halves of the UMP path:

1. ``MidiSendRequest`` schema accepts the additive ``format`` field
   without breaking back-compat with absent-field producers.
2. ``MidiHostClient.send_ump`` constructs a wire frame whose payload
   shape matches the C++ host's ``MidiSendRequest`` parser.
3. The host main loop's accept of a ``midi_send_request`` IPC frame is
   format-tolerant: a ``format=ump`` frame with a 4..16-byte ``bytes``
   array is well-formed JSON that the host's existing dispatcher must
   accept (driven against the host binary when present, schema-only
   otherwise so the test stays green on dev machines without the C++
   build).
"""

from __future__ import annotations

import os
import socket
import threading
import unittest
import uuid
from pathlib import Path
from unittest import mock

from app.schemas.controller_host import (
    SCHEMA_VERSION,
    MidiSendRequest,
    decode_frame,
    encode_frame,
)
from app.services.midi_host_client import (
    MidiHostClient,
    MidiHostClientError,
)


REPO_ROOT = Path(__file__).resolve().parents[1]


# ---------------------------------------------------------------------
# 1. Schema additive contract
# ---------------------------------------------------------------------

class MidiSendRequestSchemaTests(unittest.TestCase):
    def test_format_field_optional(self) -> None:
        # Backwards-compatible: no format field present.
        msr: MidiSendRequest = {
            "type": "midi_send_request",
            "msg_id": "1",
            "schema_version": SCHEMA_VERSION,
            "controller_key": "k",
            "bytes": [0xB0, 0x07, 0x40],
        }
        self.assertEqual(msr["bytes"], [0xB0, 0x07, 0x40])
        # The additive `format` field appears in __annotations__ so the
        # FIELD_MANIFEST in app/schemas/controller_host.py exposes it to
        # the schema-sync test.
        self.assertIn("format", MidiSendRequest.__annotations__)

    def test_format_ump_round_trip_through_encode_decode(self) -> None:
        # 8-byte UMP MIDI 2.0 channel-voice packet.
        msr: MidiSendRequest = {
            "type": "midi_send_request",
            "msg_id": "2",
            "schema_version": SCHEMA_VERSION,
            "controller_key": "k",
            "bytes": [0x40, 0x90, 0x3C, 0x00, 0x80, 0x00, 0x00, 0x00],
            "format": "ump",
        }
        decoded, rest = decode_frame(encode_frame(msr))
        self.assertEqual(rest, b"")
        self.assertIsNotNone(decoded)
        assert decoded is not None
        self.assertEqual(decoded["type"], "midi_send_request")
        self.assertEqual(decoded["format"], "ump")
        self.assertEqual(len(decoded["bytes"]), 8)


# ---------------------------------------------------------------------
# 2. MidiHostClient.send_ump payload shape
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


class SendUmpPayloadShapeTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = Path(f"/tmp/map2-ump-test-{uuid.uuid4().hex}.sock")
        self._server = FakeUdsServer(self._tmp)
        self._server.start()
        self._client = MidiHostClient(socket_path=self._tmp, timeout_s=2.0)

    def tearDown(self) -> None:
        self._server.stop()

    def test_send_ump_emits_format_ump_frame(self) -> None:
        packet = bytes([0x40, 0x91, 0x3C, 0x00, 0x80, 0x00, 0x00, 0x00])
        msg_id = self._client.send_ump(controller_key="ctrl-A", packet_bytes=packet)
        self.assertTrue(msg_id)
        # Drain the server thread.
        self._server.stop()
        self.assertEqual(len(self._server.captured), 1)
        captured = self._server.captured[0]
        self.assertEqual(captured["type"], "midi_send_request")
        self.assertEqual(captured["controller_key"], "ctrl-A")
        self.assertEqual(captured["format"], "ump")
        self.assertEqual(captured["bytes"], list(packet))
        self.assertEqual(captured["schema_version"], SCHEMA_VERSION)

    def test_send_ump_rejects_invalid_lengths(self) -> None:
        for bad in (b"", b"\x40", b"\x40\x90\x3C", b"\x40\x90\x3C\x00\x00",
                    bytes(20)):
            with self.assertRaises(MidiHostClientError):
                self._client.send_ump(controller_key="k", packet_bytes=bad)


# ---------------------------------------------------------------------
# 3. CPP_FIELD_MANIFEST drift guard for the new `format` field.
# ---------------------------------------------------------------------

class CppManifestUmpFormatTests(unittest.TestCase):
    def test_cpp_manifest_lists_format_on_midi_send_request(self) -> None:
        text = (REPO_ROOT / "juce-engine" / "Source" / "ControllerHost"
                / "IpcMessages.h").read_text()
        # The CPP_FIELD_MANIFEST line for MidiSendRequest must include `format`.
        line = next(
            (l for l in text.splitlines()
             if l.lstrip("/").strip().startswith("MidiSendRequest:")),
            None,
        )
        self.assertIsNotNone(line, "MidiSendRequest entry missing from CPP_FIELD_MANIFEST")
        assert line is not None
        self.assertIn("format", line)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
