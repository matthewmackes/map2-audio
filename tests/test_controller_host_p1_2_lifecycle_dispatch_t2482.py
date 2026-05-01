"""T2482-P1.2 Gap A (iter 64) — live dispatch test for the lifecycle envelopes.

Runs the actual map2-controller-host binary, drives mapping_activate +
mapping_deactivate + mapping_reload through the IPC channel, and
verifies the responses match the iter-64 contract.

Skipped when the binary isn't built (CI on a Python-only sandbox).
"""

from __future__ import annotations

import os
import shutil
import socket
import subprocess
import time
import unittest
import uuid
from pathlib import Path

import pytest

from app.schemas.controller_host import (
    SCHEMA_VERSION,
    decode_frame,
    encode_frame,
)


REPO_ROOT = Path(__file__).resolve().parents[1]
BINARY = REPO_ROOT / "juce-engine" / "build" / "map2-controller-host"


@pytest.mark.skipif(
    not BINARY.exists(),
    reason=f"map2-controller-host binary not built: {BINARY}",
)
class P1_2LifecycleDispatchTests(unittest.TestCase):
    def setUp(self) -> None:
        self._sock_path = Path(f"/tmp/map2-iter64-{uuid.uuid4().hex}.sock")
        if self._sock_path.exists():
            self._sock_path.unlink()
        self._proc = subprocess.Popen(
            [str(BINARY), "--socket", str(self._sock_path)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        # Wait up to 2 s for the socket to appear.
        deadline = time.monotonic() + 2.0
        while time.monotonic() < deadline:
            if self._sock_path.exists():
                break
            time.sleep(0.05)
        else:
            self._proc.terminate()
            self.fail(f"daemon never created socket: {self._sock_path}")

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

    def _send_and_receive(self, msg: dict) -> dict:
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.settimeout(2.0)
        s.connect(str(self._sock_path))
        s.sendall(encode_frame(msg))
        buf = b""
        while True:
            try:
                chunk = s.recv(4096)
            except socket.timeout:
                break
            if not chunk:
                break
            buf += chunk
            decoded, _ = decode_frame(buf)
            if decoded is not None:
                s.close()
                return decoded
        s.close()
        raise AssertionError("no response received")

    # -----------------------------------------------------------------
    # mapping_deactivate
    # -----------------------------------------------------------------

    def test_deactivate_unknown_controller_returns_warning(self) -> None:
        resp = self._send_and_receive({
            "type": "mapping_deactivate",
            "msg_id": "d1",
            "schema_version": SCHEMA_VERSION,
            "controller_key": "nonexistent.controller",
        })
        self.assertEqual(resp["type"], "log_event")
        self.assertEqual(resp["level"], "warning")
        self.assertIn("not loaded", resp["message"])
        self.assertEqual(resp["controller_key"], "nonexistent.controller")

    def test_deactivate_missing_controller_key_returns_error(self) -> None:
        resp = self._send_and_receive({
            "type": "mapping_deactivate",
            "msg_id": "d2",
            "schema_version": SCHEMA_VERSION,
            "controller_key": "",
        })
        self.assertEqual(resp["type"], "log_event")
        self.assertEqual(resp["level"], "error")
        self.assertIn("missing controller_key", resp["message"])

    def test_activate_then_deactivate_returns_info(self) -> None:
        # Activate first so deactivate has something to drop.
        activate_resp = self._send_and_receive({
            "type": "mapping_activate",
            "msg_id": "a1",
            "schema_version": SCHEMA_VERSION,
            "controller_key": "iter64.test",
            "descriptor": {
                "pack_id": "iter64",
                "model": "test",
                "kind": "midi",
                "scripts": [],
                "controls": [],
                "outputs": [],
                "settings": [],
                "mixxx_alias_table": {},
            },
        })
        self.assertEqual(activate_resp["type"], "log_event")
        self.assertEqual(activate_resp["level"], "info")
        # Deactivate — should now find the descriptor + return info.
        deactivate_resp = self._send_and_receive({
            "type": "mapping_deactivate",
            "msg_id": "d3",
            "schema_version": SCHEMA_VERSION,
            "controller_key": "iter64.test",
        })
        self.assertEqual(deactivate_resp["type"], "log_event")
        self.assertEqual(deactivate_resp["level"], "info")
        self.assertIn("deactivated", deactivate_resp["message"])

    # -----------------------------------------------------------------
    # mapping_reload
    # -----------------------------------------------------------------

    def test_reload_succeeds_for_loaded_controller(self) -> None:
        # Seed an active descriptor.
        self._send_and_receive({
            "type": "mapping_activate",
            "msg_id": "a-r",
            "schema_version": SCHEMA_VERSION,
            "controller_key": "iter64.reload",
            "descriptor": {
                "pack_id": "iter64",
                "model": "reload",
                "kind": "midi",
                "scripts": [],
                "controls": [],
                "outputs": [],
                "settings": [],
                "mixxx_alias_table": {},
            },
        })
        # Reload with a different (still empty) descriptor.
        resp = self._send_and_receive({
            "type": "mapping_reload",
            "msg_id": "r1",
            "schema_version": SCHEMA_VERSION,
            "controller_key": "iter64.reload",
            "descriptor": {
                "pack_id": "iter64",
                "model": "reload-v2",
                "kind": "midi",
                "scripts": [],
                "controls": [],
                "outputs": [],
                "settings": [],
                "mixxx_alias_table": {},
            },
        })
        self.assertEqual(resp["type"], "log_event")
        self.assertEqual(resp["level"], "info")
        self.assertIn("reloaded", resp["message"])

    def test_reload_for_uninitialised_controller_creates_descriptor(self) -> None:
        # reloadDescriptor on a controller_key that wasn't loaded
        # falls through to the loadDescriptor path.
        resp = self._send_and_receive({
            "type": "mapping_reload",
            "msg_id": "r2",
            "schema_version": SCHEMA_VERSION,
            "controller_key": "iter64.fresh",
            "descriptor": {
                "pack_id": "iter64",
                "model": "fresh",
                "kind": "midi",
                "scripts": [],
                "controls": [],
                "outputs": [],
                "settings": [],
                "mixxx_alias_table": {},
            },
        })
        self.assertEqual(resp["type"], "log_event")
        self.assertEqual(resp["level"], "info")
        self.assertIn("reloaded", resp["message"])


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
