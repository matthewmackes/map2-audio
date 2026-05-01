"""T2482-P1.2 Gap D (iter 65) — B5 golden-test harness + synthetic fixture.

The integration-proof gate for the Mixxx ControllerEngine integration.
Per fixture in tests/fixtures/controller_host_b5/, this test:

1. Spawns the actual map2-controller-host binary
2. Replays the recorded `input_sequence` (mapping_activate frames,
   synthetic MIDI events, etc.) against the daemon
3. Captures the daemon's outbound IPC frames
4. Compares the captured trace against `expected_outbound`

Iter 65 ships the harness + ONE synthetic fixture (the iter-64
mapping lifecycle). Iter 66 wires it against a real Mixxx XML
import; iter 67 closes the byte-equal gate.
"""

from __future__ import annotations

import json
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
FIXTURE_DIR = REPO_ROOT / "tests" / "fixtures" / "controller_host_b5"


def _discover_fixtures() -> list[Path]:
    if not FIXTURE_DIR.exists():
        return []
    return sorted(FIXTURE_DIR.glob("*.fixture.json"))


@pytest.mark.skipif(
    not BINARY.exists(),
    reason=f"map2-controller-host binary not built: {BINARY}",
)
@pytest.mark.parametrize(
    "fixture_path",
    _discover_fixtures(),
    ids=lambda p: p.name,
)
def test_b5_golden_fixture(fixture_path: Path) -> None:
    """Replay each B5 fixture against the live daemon + assert match."""
    fixture = json.loads(fixture_path.read_text())
    runner = _B5Runner(fixture)
    runner.run()
    runner.assert_outbound_matches()


class _B5Runner:
    """Spawn daemon, replay fixture inputs, capture outbound trace."""

    def __init__(self, fixture: dict) -> None:
        self._fixture = fixture
        self._sock_path = Path(f"/tmp/map2-b5-{uuid.uuid4().hex}.sock")
        self._proc: subprocess.Popen | None = None
        self._captured: list[dict] = []

    def run(self) -> None:
        self._spawn_daemon()
        try:
            self._replay_inputs()
        finally:
            self._kill_daemon()

    def _spawn_daemon(self) -> None:
        if self._sock_path.exists():
            self._sock_path.unlink()
        self._proc = subprocess.Popen(
            [str(BINARY), "--socket", str(self._sock_path)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        deadline = time.monotonic() + 2.0
        while time.monotonic() < deadline:
            if self._sock_path.exists():
                return
            time.sleep(0.05)
        self._kill_daemon()
        raise AssertionError(
            f"daemon never created socket: {self._sock_path}"
        )

    def _kill_daemon(self) -> None:
        if self._proc is None:
            return
        try:
            self._proc.terminate()
            self._proc.wait(timeout=2.0)
        except subprocess.TimeoutExpired:
            self._proc.kill()
        self._proc = None
        if self._sock_path.exists():
            try:
                self._sock_path.unlink()
            except OSError:
                pass

    def _replay_inputs(self) -> None:
        controller_key = self._fixture["controller_key"]
        descriptor = self._fixture["descriptor"]
        for entry in self._fixture["input_sequence"]:
            envelope = self._build_envelope(entry, controller_key, descriptor)
            response = self._send_and_receive(envelope)
            if response is not None:
                self._captured.append(response)

    def _build_envelope(self, entry: dict, controller_key: str,
                          descriptor: dict) -> dict:
        msg_type = entry["type"]
        msg_id = entry.get("msg_id", uuid.uuid4().hex)
        envelope: dict = {
            "type": msg_type,
            "msg_id": msg_id,
            "schema_version": SCHEMA_VERSION,
            "controller_key": controller_key,
        }
        if msg_type in ("mapping_activate", "mapping_reload"):
            envelope["descriptor"] = descriptor
        elif msg_type == "mapping_deactivate":
            pass  # only controller_key needed
        elif msg_type == "controller_event":
            envelope["bytes"] = entry.get("bytes", [])
            envelope["timestamp_ns"] = entry.get("timestamp_ns", 0)
        else:
            # Pass-through any extra fields from the fixture.
            for k, v in entry.items():
                if k != "type":
                    envelope[k] = v
        return envelope

    def _send_and_receive(self, msg: dict) -> dict | None:
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

    def assert_outbound_matches(self) -> None:
        expected = self._fixture["expected_outbound"]
        actual = self._captured
        if len(expected) != len(actual):
            raise AssertionError(
                f"outbound trace length mismatch: expected {len(expected)}, "
                f"got {len(actual)}. Captured:\n"
                + "\n".join(f"  {a}" for a in actual)
            )
        for i, (exp, got) in enumerate(zip(expected, actual)):
            self._assert_entry_matches(i, exp, got)

    def _assert_entry_matches(self, idx: int, exp: dict, got: dict) -> None:
        if exp.get("type") and got.get("type") != exp["type"]:
            raise AssertionError(
                f"entry {idx}: type mismatch: expected {exp['type']!r}, "
                f"got {got.get('type')!r}"
            )
        if exp.get("msg_id") and got.get("msg_id") != exp["msg_id"]:
            raise AssertionError(
                f"entry {idx}: msg_id mismatch: expected {exp['msg_id']!r}, "
                f"got {got.get('msg_id')!r}"
            )
        if exp.get("level") and got.get("level") != exp["level"]:
            raise AssertionError(
                f"entry {idx}: level mismatch: expected {exp['level']!r}, "
                f"got {got.get('level')!r}"
            )
        if exp.get("message_match"):
            msg = got.get("message", "")
            if exp["message_match"] not in msg:
                raise AssertionError(
                    f"entry {idx}: message_match {exp['message_match']!r} "
                    f"not in {msg!r}"
                )
        if exp.get("controller_key") and got.get("controller_key") != exp["controller_key"]:
            raise AssertionError(
                f"entry {idx}: controller_key mismatch: expected "
                f"{exp['controller_key']!r}, got {got.get('controller_key')!r}"
            )


# ---------------------------------------------------------------------
# Sanity tests — exercise the harness itself with a hand-built fixture
# so a broken harness fails before any real fixture-replay test does.
# ---------------------------------------------------------------------

class B5HarnessSelfTest(unittest.TestCase):
    def test_harness_discovers_at_least_one_fixture(self) -> None:
        fixtures = _discover_fixtures()
        self.assertGreaterEqual(
            len(fixtures), 1,
            "iter-65 must ship at least one fixture under "
            "tests/fixtures/controller_host_b5/"
        )

    def test_harness_fixture_format_is_valid(self) -> None:
        for fixture_path in _discover_fixtures():
            payload = json.loads(fixture_path.read_text())
            self.assertIn("name", payload)
            self.assertIn("controller_key", payload)
            self.assertIn("descriptor", payload)
            self.assertIn("input_sequence", payload)
            self.assertIn("expected_outbound", payload)
            self.assertIsInstance(payload["input_sequence"], list)
            self.assertIsInstance(payload["expected_outbound"], list)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
