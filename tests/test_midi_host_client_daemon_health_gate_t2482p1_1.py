"""T2482-P1.1 Gap B (iter 45) — daemon-lifecycle health gate coverage.

The health gate gives rtmidi consumers a cheap probe so they can route
through the controller-host when it's up and fall back to rtmidi when
it isn't. Tests cover:

1. is_daemon_available() returns False when socket file is absent.
2. is_daemon_available() returns False when socket file exists but
   nothing is listening (stale lock).
3. is_daemon_available() returns True when a real listener is bound.
4. wait_for_daemon() returns False after timeout when daemon is missing.
5. wait_for_daemon() returns True quickly when daemon comes up mid-poll.

Plus a structural check on the systemd unit itself:

6. systemd/map2-controller-host.service has the required directives
   (User=, ExecStart=, ExecStartPost= readiness gate, RestartSec=).
"""

from __future__ import annotations

import os
import socket
import threading
import time
import unittest
import uuid
from pathlib import Path

from app.services.midi_host_client import MidiHostClient


REPO_ROOT = Path(__file__).resolve().parents[1]


class DaemonAvailabilityProbeTests(unittest.TestCase):
    def test_returns_false_when_socket_file_absent(self) -> None:
        nonexistent = Path(f"/tmp/map2-health-noexist-{uuid.uuid4().hex}.sock")
        client = MidiHostClient(socket_path=nonexistent, timeout_s=0.5)
        self.assertFalse(client.is_daemon_available())

    def test_returns_false_when_stale_socket_file(self) -> None:
        # Create a file at the socket path that isn't a UDS — connect
        # will fail.  Use an empty regular file as a reasonable proxy
        # for a stale leftover.
        stale = Path(f"/tmp/map2-health-stale-{uuid.uuid4().hex}.sock")
        stale.write_bytes(b"")
        try:
            client = MidiHostClient(socket_path=stale, timeout_s=0.5)
            self.assertFalse(client.is_daemon_available())
        finally:
            stale.unlink(missing_ok=True)

    def test_returns_true_when_listener_is_bound(self) -> None:
        tmp = Path(f"/tmp/map2-health-live-{uuid.uuid4().hex}.sock")
        if tmp.exists():
            tmp.unlink()
        srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        try:
            srv.bind(str(tmp))
            srv.listen(1)
            client = MidiHostClient(socket_path=tmp, timeout_s=0.5)
            self.assertTrue(client.is_daemon_available())
        finally:
            try:
                srv.close()
            except OSError:
                pass
            if tmp.exists():
                tmp.unlink()


class WaitForDaemonTests(unittest.TestCase):
    def test_returns_false_on_timeout(self) -> None:
        nonexistent = Path(f"/tmp/map2-wait-noexist-{uuid.uuid4().hex}.sock")
        client = MidiHostClient(socket_path=nonexistent, timeout_s=0.5)
        start = time.monotonic()
        ok = client.wait_for_daemon(timeout_s=0.5, poll_interval_s=0.05)
        elapsed = time.monotonic() - start
        self.assertFalse(ok)
        # Should respect the timeout (give some slack for scheduler jitter).
        self.assertLess(elapsed, 1.0)

    def test_returns_true_when_daemon_appears_mid_poll(self) -> None:
        tmp = Path(f"/tmp/map2-wait-late-{uuid.uuid4().hex}.sock")
        if tmp.exists():
            tmp.unlink()
        # Spawn a thread that creates the listener after a brief delay.
        srv: list[socket.socket] = []
        ready_event = threading.Event()

        def late_starter():
            time.sleep(0.3)
            s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            try:
                s.bind(str(tmp))
                s.listen(1)
            except OSError:
                return
            srv.append(s)
            ready_event.set()

        t = threading.Thread(target=late_starter, daemon=True)
        t.start()
        try:
            client = MidiHostClient(socket_path=tmp, timeout_s=0.5)
            ok = client.wait_for_daemon(timeout_s=2.0, poll_interval_s=0.05)
            self.assertTrue(ok, "wait_for_daemon should have detected late listener")
            self.assertTrue(ready_event.is_set())
        finally:
            for s in srv:
                try:
                    s.close()
                except OSError:
                    pass
            t.join(timeout=2.0)
            if tmp.exists():
                tmp.unlink()


class SystemdUnitStructuralTests(unittest.TestCase):
    """Pure structural sanity check on the systemd unit file."""

    UNIT_PATH = REPO_ROOT / "systemd" / "map2-controller-host.service"

    def test_unit_exists(self) -> None:
        self.assertTrue(self.UNIT_PATH.exists(),
                         f"controller-host unit missing: {self.UNIT_PATH}")

    def test_unit_has_required_directives(self) -> None:
        text = self.UNIT_PATH.read_text()
        required = [
            "[Unit]",
            "[Service]",
            "[Install]",
            "Description=MAP2 Controller Host",
            "User=mm",
            "ExecStart=",
            "map2-controller-host",
            "--socket /run/map2/controller-host.sock",
            "ExecStartPost=",  # readiness gate
            "Restart=on-failure",
            "RestartSec=",
            "After=network.target sound.target",
            "WantedBy=multi-user.target",
        ]
        for token in required:
            self.assertIn(token, text, f"unit missing required directive: {token!r}")

    def test_unit_does_not_mount_rt_cores(self) -> None:
        # Standing rule: keep non-audio services off the isolated audio
        # cores (4,5). The controller-host runs on cores 0..3 only.
        text = self.UNIT_PATH.read_text()
        self.assertIn("CPUAffinity=0 1 2 3", text,
                       "controller-host must run on general-purpose cores 0..3, "
                       "not on isolated audio cores 4,5")

    def test_unit_has_readiness_gate_for_socket(self) -> None:
        # The ExecStartPost line must wait for the UDS socket to appear
        # before systemd considers startup complete — that's how
        # downstream services (map2-backend) know it's safe to connect.
        text = self.UNIT_PATH.read_text()
        self.assertIn("test -S /run/map2/controller-host.sock", text)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
