"""T2482-P1.1 Gap D.2 (iter 47) — Maschine MK1 daemon host-routed flip.

Verifies the env-var-gated routing in
``app/services/maschine/maschine_mk1_daemon.VirtualMidiOutput``.

Constraint documented in iter-47 commit: the controller-host IPC
does not yet expose openVirtualOutput() to Python, so the virtual
port itself remains rtmidi-owned until a future
``MidiCreateVirtualPortRequest`` envelope ships. What this iter
delivers is the per-message SEND going through the host as a
shadow path — both rtmidi AND host receive each short message
when the env-gate is on. This builds host-side traffic counters
for the latency-floor measurement (Gap C / iter 50) without
breaking the existing virtual-port behaviour.

Tests cover:
1. With MAP2_USE_MIDI_HOST unset, only the rtmidi port receives sends
   (host path skipped entirely; counter stays at 0).
2. With MAP2_USE_MIDI_HOST=1 + daemon up, BOTH paths fire — rtmidi
   send + host send for each short message; counter increments.
3. With MAP2_USE_MIDI_HOST=1 + daemon DOWN, rtmidi still sends but
   host path no-ops gracefully (counter stays at 0).
4. SysEx-length messages (>3 bytes) skip the host path under the
   short-message-only constraint of iter 47.
"""

from __future__ import annotations

import os
import unittest
from unittest import mock


class _StubRtmidiOut:
    """Minimal rtmidi.MidiOut stub for tests."""

    def __init__(self) -> None:
        self.opened_virtual: str | None = None
        self.sent_messages: list[list[int]] = []

    def open_virtual_port(self, name: str) -> None:
        self.opened_virtual = name

    def send_message(self, msg: list[int]) -> None:
        self.sent_messages.append(list(msg))

    def close_port(self) -> None:
        pass

    def delete(self) -> None:
        pass


def _make_virtual_output(host_client_mock):
    """Build a VirtualMidiOutput with rtmidi stubbed + host client mocked."""
    from app.services.maschine import maschine_mk1_daemon

    # Stub rtmidi at import scope so VirtualMidiOutput.open() succeeds.
    stub_rtmidi = mock.Mock()
    stub_rtmidi.MidiOut = lambda: _StubRtmidiOut()

    with mock.patch.object(maschine_mk1_daemon, "rtmidi", stub_rtmidi):
        vo = maschine_mk1_daemon.VirtualMidiOutput("MAP2:Maschine-MK1")
        ok = vo.open()
        assert ok, "rtmidi stub should report open OK"
        # Patch the lazy host-client constructor.
        with mock.patch.object(vo, "_get_host_client", return_value=host_client_mock):
            yield vo


class EnvVarOffPreservesRtmidiOnlyPath(unittest.TestCase):
    def setUp(self) -> None:
        self._env_patch = mock.patch.dict(os.environ, {"MAP2_USE_MIDI_HOST": "0"})
        self._env_patch.start()

    def tearDown(self) -> None:
        self._env_patch.stop()

    def test_rtmidi_only_when_env_off(self) -> None:
        host_client = mock.Mock()
        host_client.is_daemon_available.return_value = True
        # Generator-based fixture so we can yield the open VirtualMidiOutput.
        gen = _make_virtual_output(host_client)
        vo = next(gen)
        try:
            vo.send_messages([bytes([0xB0, 0x07, 0x40]),
                                bytes([0x90, 0x3C, 0x7F])])
            self.assertEqual(len(vo._port.sent_messages), 2)
            self.assertEqual(vo._port.sent_messages[0], [0xB0, 0x07, 0x40])
            self.assertEqual(vo.host_routed_sends, 0)
            host_client.is_daemon_available.assert_not_called()
        finally:
            try:
                next(gen)
            except StopIteration:
                pass


class EnvVarOnRoutesShadowSends(unittest.TestCase):
    def setUp(self) -> None:
        self._env_patch = mock.patch.dict(os.environ, {"MAP2_USE_MIDI_HOST": "1"})
        self._env_patch.start()

    def tearDown(self) -> None:
        self._env_patch.stop()

    def test_short_messages_route_to_both_paths(self) -> None:
        host_client = mock.Mock()
        host_client.is_daemon_available.return_value = True
        gen = _make_virtual_output(host_client)
        vo = next(gen)
        try:
            vo.send_messages([bytes([0xB0, 0x07, 0x40]),
                                bytes([0x90, 0x3C, 0x7F])])
            # rtmidi side: still gets both messages.
            self.assertEqual(len(vo._port.sent_messages), 2)
            # Host side: each short message routed too.
            self.assertEqual(vo.host_routed_sends, 2)
            self.assertEqual(host_client.send_short_message.call_count, 2)
            # Verify the controller_key payload.
            call_args = host_client.send_short_message.call_args_list[0]
            self.assertEqual(call_args.kwargs["controller_key"],
                              "native-instruments.maschine-mk1")
            self.assertEqual(call_args.kwargs["message_bytes"],
                              bytes([0xB0, 0x07, 0x40]))
        finally:
            try:
                next(gen)
            except StopIteration:
                pass

    def test_oversized_messages_skip_host_path(self) -> None:
        host_client = mock.Mock()
        host_client.is_daemon_available.return_value = True
        gen = _make_virtual_output(host_client)
        vo = next(gen)
        try:
            # 4-byte message exceeds the short-message length limit;
            # iter-47 host path is short-message-only (the iter-43
            # send_sysex helper handles >3-byte envelopes but we
            # haven't wired SysEx routing here yet).
            vo.send_messages([bytes([0xF0, 0x06, 0x00, 0xF7])])
            # rtmidi still sees the message; host path skipped.
            self.assertEqual(len(vo._port.sent_messages), 1)
            self.assertEqual(vo.host_routed_sends, 0)
            host_client.send_short_message.assert_not_called()
        finally:
            try:
                next(gen)
            except StopIteration:
                pass

    def test_daemon_down_falls_through_silently(self) -> None:
        host_client = mock.Mock()
        host_client.is_daemon_available.return_value = False  # daemon down
        gen = _make_virtual_output(host_client)
        vo = next(gen)
        try:
            vo.send_messages([bytes([0xB0, 0x07, 0x40])])
            # rtmidi still sends — daemon-down does NOT block the
            # legacy path.
            self.assertEqual(len(vo._port.sent_messages), 1)
            # Host counter stays at 0 — no shadow send happened.
            self.assertEqual(vo.host_routed_sends, 0)
            host_client.send_short_message.assert_not_called()
        finally:
            try:
                next(gen)
            except StopIteration:
                pass

    def test_host_send_exception_does_not_block_rtmidi_send(self) -> None:
        host_client = mock.Mock()
        host_client.is_daemon_available.return_value = True
        host_client.send_short_message.side_effect = RuntimeError("simulated daemon hang")
        gen = _make_virtual_output(host_client)
        vo = next(gen)
        try:
            vo.send_messages([bytes([0xB0, 0x07, 0x40])])
            # rtmidi still gets the message — host exception was caught.
            self.assertEqual(len(vo._port.sent_messages), 1)
            self.assertEqual(vo.host_routed_sends, 0)  # send didn't complete
        finally:
            try:
                next(gen)
            except StopIteration:
                pass


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
