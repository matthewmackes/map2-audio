"""T2482-P1.2 (iter 75) — MidiCreateVirtualPortRequest IPC envelope.

Schema + live-dispatch coverage for the new envelope that asks the
host to publish a virtual MIDI output port. Unblocks the Maschine
virtual-port flip (iter 76) AND closes the iter-72/73 outbound
back-loop's "needs an open virtual output" requirement.
"""

from __future__ import annotations

import socket
import subprocess
import time
import unittest
import uuid
from pathlib import Path

import pytest

from app.schemas.controller_host import (
    SCHEMA_VERSION,
    FIELD_MANIFEST,
    MidiCreateVirtualPortRequest,
    decode_frame,
    encode_frame,
)


REPO_ROOT = Path(__file__).resolve().parents[1]
BINARY = REPO_ROOT / "juce-engine" / "build" / "map2-controller-host"


# ---------------------------------------------------------------------
# Schema-level coverage
# ---------------------------------------------------------------------

class MidiCreateVirtualPortRequestSchemaTests(unittest.TestCase):
    def test_required_fields(self) -> None:
        msg: MidiCreateVirtualPortRequest = {
            "type": "midi_create_virtual_port_request",
            "msg_id": "vp-1",
            "schema_version": SCHEMA_VERSION,
            "name": "MAP2:TestPort",
        }
        self.assertEqual(msg["type"], "midi_create_virtual_port_request")
        self.assertEqual(msg["name"], "MAP2:TestPort")

    def test_round_trip_through_encode_decode(self) -> None:
        msg: MidiCreateVirtualPortRequest = {
            "type": "midi_create_virtual_port_request",
            "msg_id": "vp-rt",
            "schema_version": SCHEMA_VERSION,
            "name": "MAP2:Maschine-MK1",
        }
        decoded, rest = decode_frame(encode_frame(msg))
        self.assertEqual(rest, b"")
        assert decoded is not None
        self.assertEqual(decoded["type"], "midi_create_virtual_port_request")
        self.assertEqual(decoded["name"], "MAP2:Maschine-MK1")

    def test_field_manifest_lists_envelope(self) -> None:
        self.assertIn("MidiCreateVirtualPortRequest", FIELD_MANIFEST)
        fields = FIELD_MANIFEST["MidiCreateVirtualPortRequest"]
        self.assertIn("type", fields)
        self.assertIn("msg_id", fields)
        self.assertIn("schema_version", fields)
        self.assertIn("name", fields)

    def test_inbound_union_includes_envelope(self) -> None:
        from app.schemas.controller_host import InboundMessage
        type_names = [arg.__name__ for arg in InboundMessage.__args__]
        self.assertIn("MidiCreateVirtualPortRequest", type_names)


# ---------------------------------------------------------------------
# Live dispatch — spawn the daemon + send the envelope
# ---------------------------------------------------------------------

@pytest.mark.skipif(
    not BINARY.exists(),
    reason=f"map2-controller-host binary not built: {BINARY}",
)
class MidiCreateVirtualPortRequestDispatchTests(unittest.TestCase):
    def setUp(self) -> None:
        self._sock_path = Path(f"/tmp/map2-iter75-{uuid.uuid4().hex}.sock")
        if self._sock_path.exists():
            self._sock_path.unlink()
        self._proc = subprocess.Popen(
            [str(BINARY), "--socket", str(self._sock_path)],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        deadline = time.monotonic() + 2.0
        while time.monotonic() < deadline:
            if self._sock_path.exists():
                break
            time.sleep(0.05)
        else:
            self._proc.terminate()
            self.fail(f"daemon never created socket: {self._sock_path}")

        # Open a connection to trigger the daemon's MIDI backend probe
        # (the daemon only initialises midiBackend on first connection).
        # A cheap shutdown-detection-bypass send works.
        self._send({
            "type": "midi_list_ports_request",
            "msg_id": "warmup",
            "schema_version": SCHEMA_VERSION,
        })

    def tearDown(self) -> None:
        try:
            self._proc.terminate()
            self._proc.wait(timeout=2.0)
        except subprocess.TimeoutExpired:
            self._proc.kill()
        if self._sock_path.exists():
            try:
                self._sock_path.unlink()
            except OSError:
                pass

    def _send(self, msg: dict) -> dict | None:
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.settimeout(2.0)
        s.connect(str(self._sock_path))
        s.sendall(encode_frame(msg))
        buf = b""
        try:
            while True:
                try:
                    chunk = s.recv(4096)
                except socket.timeout:
                    return None
                if not chunk:
                    return None
                buf += chunk
                decoded, _ = decode_frame(buf)
                if decoded is not None:
                    return decoded
        finally:
            s.close()

    def test_create_virtual_port_succeeds_with_valid_name(self) -> None:
        resp = self._send({
            "type": "midi_create_virtual_port_request",
            "msg_id": "vp-good",
            "schema_version": SCHEMA_VERSION,
            "name": f"MAP2:iter75-test-{uuid.uuid4().hex[:6]}",
        })
        self.assertIsNotNone(resp)
        self.assertEqual(resp["type"], "log_event")
        self.assertEqual(resp["level"], "info")
        self.assertIn("virtual output published", resp["message"])

    def test_missing_name_returns_error(self) -> None:
        resp = self._send({
            "type": "midi_create_virtual_port_request",
            "msg_id": "vp-noname",
            "schema_version": SCHEMA_VERSION,
            "name": "",
        })
        self.assertIsNotNone(resp)
        self.assertEqual(resp["type"], "log_event")
        self.assertEqual(resp["level"], "error")
        self.assertIn("missing name", resp["message"])


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
