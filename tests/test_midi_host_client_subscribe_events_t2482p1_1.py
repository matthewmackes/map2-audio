"""T2482-P1.1 Gap A.3 — MidiEventSubscription / MidiHostClient.subscribe()

Verifies the long-lived UDS reader that demuxes outbound host frames
to per-type callbacks. Replaces rtmidi's MidiIn.set_callback(fn) shape.

Tests cover:
1. Single ControllerEvent frame triggers the registered callback.
2. Multi-type stream — ControllerEvent + EngineCommand + LogEvent
   each route to the correct callback (no cross-talk).
3. Multiple frames batched in one TCP segment all dispatch.
4. Unregistered frame types (no callback) are silently dropped.
5. start() raises if the daemon UDS doesn't exist.
6. stop() cleanly shuts down the reader thread.
7. Buggy callback does not kill the reader (defensive try/except).
"""

from __future__ import annotations

import socket
import threading
import time
import unittest
import uuid
from pathlib import Path

from app.schemas.controller_host import SCHEMA_VERSION, encode_frame
from app.services.midi_host_client import (
    MidiEventSubscription,
    MidiHostClient,
    MidiHostClientError,
)


# ---------------------------------------------------------------------
# Fake UDS server that PUSHES frames to the connected client (inverted
# from the send-direction tests where the server only RECEIVES).
# ---------------------------------------------------------------------

class PushUdsServer:
    """UDS server that sends pre-arranged frames to the first client.

    The reader subscription connects, then the server sends a sequence
    of frames (potentially batched in single sendall calls), then waits
    for the test to call stop().
    """

    def __init__(self, socket_path: Path, frames_to_push: list[dict],
                 batch: bool = False) -> None:
        self._socket_path = socket_path
        self._frames = frames_to_push
        self._batch = batch
        self._sock: socket.socket | None = None
        self._thread: threading.Thread | None = None
        self._client_conn: socket.socket | None = None
        self._connected_event = threading.Event()
        self._sent_event = threading.Event()

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
        self._client_conn = conn
        self._connected_event.set()
        try:
            if self._batch:
                # Coalesce all frames into one sendall.
                blob = b"".join(encode_frame(f) for f in self._frames)
                conn.sendall(blob)
            else:
                for f in self._frames:
                    conn.sendall(encode_frame(f))
                    time.sleep(0.005)  # tiny gap so frames arrive separately
            self._sent_event.set()
            # Stay open until the test closes the subscription.
            while True:
                try:
                    chunk = conn.recv(4096)
                except OSError:
                    return
                if not chunk:
                    return
        finally:
            try:
                conn.close()
            except OSError:
                pass

    def wait_for_connection(self, timeout: float = 2.0) -> bool:
        return self._connected_event.wait(timeout=timeout)

    def wait_for_send(self, timeout: float = 2.0) -> bool:
        return self._sent_event.wait(timeout=timeout)

    def stop(self) -> None:
        if self._client_conn is not None:
            try:
                self._client_conn.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            try:
                self._client_conn.close()
            except OSError:
                pass
            self._client_conn = None
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
# Helpers for building outbound frames.
# ---------------------------------------------------------------------

def make_controller_event(controller_key: str, ts_ns: int,
                          bytes_list: list[int]) -> dict:
    return {
        "type": "controller_event",
        "msg_id": uuid.uuid4().hex,
        "schema_version": SCHEMA_VERSION,
        "controller_key": controller_key,
        "timestamp_ns": ts_ns,
        "bytes": bytes_list,
    }


def make_engine_command(controller_key: str, target: str,
                        action: str, value: float | None = None) -> dict:
    msg: dict = {
        "type": "engine_command",
        "msg_id": uuid.uuid4().hex,
        "schema_version": SCHEMA_VERSION,
        "controller_key": controller_key,
        "target": target,
        "action": action,
    }
    if value is not None:
        msg["value"] = value
    return msg


def make_log_event(level: str, message: str, controller_key: str | None = None) -> dict:
    msg: dict = {
        "type": "log_event",
        "msg_id": uuid.uuid4().hex,
        "schema_version": SCHEMA_VERSION,
        "level": level,
        "message": message,
    }
    if controller_key:
        msg["controller_key"] = controller_key
    return msg


def make_script_error(controller_key: str, message: str) -> dict:
    return {
        "type": "script_error",
        "msg_id": uuid.uuid4().hex,
        "schema_version": SCHEMA_VERSION,
        "controller_key": controller_key,
        "message": message,
    }


# ---------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------

class SubscriptionDispatchTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = Path(f"/tmp/map2-subscribe-test-{uuid.uuid4().hex}.sock")

    def _run_subscription(self, frames: list[dict], batch: bool = False
                           ) -> tuple[list[dict], list[dict], list[dict], list[dict]]:
        """Spin up server, subscribe, capture each callback bucket."""
        server = PushUdsServer(self._tmp, frames, batch=batch)
        server.start()
        try:
            client = MidiHostClient(socket_path=self._tmp, timeout_s=2.0)
            sub = client.subscribe()
            captured_ce: list[dict] = []
            captured_ec: list[dict] = []
            captured_le: list[dict] = []
            captured_se: list[dict] = []
            sub.on_controller_event(lambda m: captured_ce.append(m))
            sub.on_engine_command(lambda m: captured_ec.append(m))
            sub.on_log_event(lambda m: captured_le.append(m))
            sub.on_script_error(lambda m: captured_se.append(m))
            sub.start()
            self.assertTrue(server.wait_for_connection(2.0), "server did not see client connect")
            self.assertTrue(server.wait_for_send(2.0), "server did not finish sending")
            # Give the reader thread time to dispatch.
            deadline = time.time() + 2.0
            expected = len(frames)
            while time.time() < deadline:
                total = len(captured_ce) + len(captured_ec) + len(captured_le) + len(captured_se)
                if total >= expected:
                    break
                time.sleep(0.01)
            sub.stop()
            return captured_ce, captured_ec, captured_le, captured_se
        finally:
            server.stop()

    def test_single_controller_event_dispatches(self) -> None:
        evt = make_controller_event("ctrl-A", 12345, [0xB0, 0x07, 0x40])
        ce, ec, le, se = self._run_subscription([evt])
        self.assertEqual(len(ce), 1)
        self.assertEqual(ce[0]["controller_key"], "ctrl-A")
        self.assertEqual(ce[0]["bytes"], [0xB0, 0x07, 0x40])
        self.assertEqual(len(ec), 0)
        self.assertEqual(len(le), 0)
        self.assertEqual(len(se), 0)

    def test_multi_type_stream_routes_correctly(self) -> None:
        frames = [
            make_controller_event("ctrl-A", 1, [0xB0, 0x07, 0x40]),
            make_engine_command("ctrl-A", "audio.master.volume", "set", 0.8),
            make_log_event("info", "mapping loaded"),
            make_script_error("ctrl-A", "TypeError: undefined"),
        ]
        ce, ec, le, se = self._run_subscription(frames)
        self.assertEqual(len(ce), 1)
        self.assertEqual(len(ec), 1)
        self.assertEqual(len(le), 1)
        self.assertEqual(len(se), 1)
        self.assertEqual(ec[0]["target"], "audio.master.volume")
        self.assertEqual(le[0]["message"], "mapping loaded")
        self.assertEqual(se[0]["message"], "TypeError: undefined")

    def test_batched_frames_all_dispatch(self) -> None:
        # 5 frames coalesced into one sendall. The reader's inner drain
        # loop must extract every frame in the buffer.
        frames = [
            make_controller_event("ctrl-A", i, [0x90, 60 + i, 100])
            for i in range(5)
        ]
        ce, _, _, _ = self._run_subscription(frames, batch=True)
        self.assertEqual(len(ce), 5)
        for i, evt in enumerate(ce):
            self.assertEqual(evt["bytes"][1], 60 + i)

    def test_unregistered_type_silently_dropped(self) -> None:
        # No callback registered for engine_command — should drop silently.
        evt = make_engine_command("ctrl-A", "audio.master.volume", "set", 1.0)
        server = PushUdsServer(self._tmp, [evt])
        server.start()
        try:
            client = MidiHostClient(socket_path=self._tmp, timeout_s=2.0)
            sub = client.subscribe()
            # Only register controller_event — the engine_command should be
            # silently dropped without crashing the reader.
            captured: list[dict] = []
            sub.on_controller_event(lambda m: captured.append(m))
            sub.start()
            self.assertTrue(server.wait_for_send(2.0))
            time.sleep(0.2)  # let reader thread try to dispatch
            sub.stop()
            self.assertEqual(captured, [])
            self.assertFalse(sub.is_running())  # cleanly stopped
        finally:
            server.stop()


class SubscriptionLifecycleTests(unittest.TestCase):
    def test_start_raises_when_daemon_unreachable(self) -> None:
        sub = MidiEventSubscription(
            Path("/tmp/map2-subscribe-noexist-daemon.sock"),
            timeout_s=0.5,
        )
        with self.assertRaises(MidiHostClientError):
            sub.start()
        self.assertFalse(sub.is_running())

    def test_double_start_is_rejected(self) -> None:
        tmp = Path(f"/tmp/map2-subscribe-double-{uuid.uuid4().hex}.sock")
        server = PushUdsServer(tmp, frames_to_push=[])
        server.start()
        try:
            client = MidiHostClient(socket_path=tmp, timeout_s=2.0)
            sub = client.subscribe()
            sub.start()
            try:
                with self.assertRaises(MidiHostClientError):
                    sub.start()
            finally:
                sub.stop()
        finally:
            server.stop()

    def test_buggy_callback_does_not_kill_reader(self) -> None:
        tmp = Path(f"/tmp/map2-subscribe-buggy-{uuid.uuid4().hex}.sock")
        good_evt = make_controller_event("ctrl-A", 1, [0xB0, 0x07, 0x40])
        bad_evt = make_controller_event("ctrl-A", 2, [0xB0, 0x07, 0x50])
        followup_evt = make_controller_event("ctrl-A", 3, [0xB0, 0x07, 0x60])
        server = PushUdsServer(tmp, [good_evt, bad_evt, followup_evt])
        server.start()
        try:
            client = MidiHostClient(socket_path=tmp, timeout_s=2.0)
            sub = client.subscribe()
            captured: list[int] = []

            def buggy(msg: dict) -> None:
                ts = msg["timestamp_ns"]
                if ts == 2:
                    raise ValueError("simulated subscriber bug")
                captured.append(ts)

            sub.on_controller_event(buggy)
            sub.start()
            self.assertTrue(server.wait_for_send(2.0))
            # Wait for reader to process all 3 events.
            deadline = time.time() + 2.0
            while time.time() < deadline:
                if 1 in captured and 3 in captured:
                    break
                time.sleep(0.01)
            sub.stop()
            # We should have the GOOD event before the buggy one and
            # the FOLLOWUP after — proving the reader survived.
            self.assertIn(1, captured)
            self.assertIn(3, captured)
            self.assertNotIn(2, captured)  # buggy one swallowed
        finally:
            server.stop()


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
