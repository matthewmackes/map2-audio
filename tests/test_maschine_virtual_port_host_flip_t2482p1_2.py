"""T2482-P1.2 (iter 76) — Maschine virtual-port flip via new IPC envelope.

Closes the iter-50b/iter-55 deferral. Maschine MK1's
VirtualMidiOutput.open() now prefers the controller-host's
MidiCreateVirtualPortRequest IPC envelope (iter 75) over rtmidi.

Tests cover:
1. Host path: when the daemon is reachable + create_virtual_port
   returns level=info, the port is host-owned (self._port is None)
   and is_open is True.
2. Fallback: when create_virtual_port returns level=error, the
   rtmidi path runs. Preserves the legacy behaviour for the iter-79
   transition window.
3. Fallback: when daemon is unreachable, the rtmidi path runs
   silently (no exception).
"""

from __future__ import annotations

import os
import unittest
from unittest import mock


class _StubRtmidiOut:
    def __init__(self) -> None:
        self.opened_virtual: str | None = None
        self.sent_messages: list[list[int]] = []

    def open_virtual_port(self, name: str) -> None:
        self.opened_virtual = name

    def send_message(self, msg: list[int]) -> None:
        self.sent_messages.append(list(msg))

    def close_port(self) -> None: pass
    def delete(self) -> None: pass


def _build_vo(host_client_mock):
    from app.services.maschine import maschine_mk1_daemon
    stub_rtmidi = mock.Mock()
    stub_rtmidi.MidiOut = lambda: _StubRtmidiOut()
    return maschine_mk1_daemon, stub_rtmidi


class HostPathTests(unittest.TestCase):
    def setUp(self) -> None:
        self._env = mock.patch.dict(os.environ, {"MAP2_USE_MIDI_HOST": "1"})
        self._env.start()

    def tearDown(self) -> None:
        self._env.stop()

    def test_host_create_virtual_port_success_marks_port_host_owned(self) -> None:
        mod, stub_rtmidi = _build_vo(None)
        host_client = mock.Mock()
        host_client.is_daemon_available.return_value = True
        host_client.create_virtual_port.return_value = {
            "type": "log_event",
            "level": "info",
            "message": "virtual output published: MAP2:Maschine-MK1",
        }
        with mock.patch.object(mod, "rtmidi", stub_rtmidi):
            vo = mod.VirtualMidiOutput("MAP2:Maschine-MK1")
            with mock.patch.object(vo, "_get_host_client",
                                      return_value=host_client):
                ok = vo.open()
        self.assertTrue(ok)
        self.assertTrue(vo._is_open)
        # Critical: when the host owns the port, the local rtmidi
        # port is None — Maschine's send loop falls through to the
        # host shadow-send only.
        self.assertIsNone(vo._port)
        host_client.create_virtual_port.assert_called_once_with(
            name="MAP2:Maschine-MK1",
        )

    def test_host_create_virtual_port_error_falls_back_to_rtmidi(self) -> None:
        mod, stub_rtmidi = _build_vo(None)
        host_client = mock.Mock()
        host_client.is_daemon_available.return_value = True
        host_client.create_virtual_port.return_value = {
            "type": "log_event",
            "level": "error",
            "message": "midi_create_virtual_port_request failed: simulated",
        }
        with mock.patch.object(mod, "rtmidi", stub_rtmidi):
            vo = mod.VirtualMidiOutput("MAP2:Maschine-MK1")
            with mock.patch.object(vo, "_get_host_client",
                                      return_value=host_client):
                ok = vo.open()
        self.assertTrue(ok)
        self.assertTrue(vo._is_open)
        # Host returned error → rtmidi fallback ran → local port set.
        self.assertIsNotNone(vo._port)
        self.assertEqual(vo._port.opened_virtual, "MAP2:Maschine-MK1")

    def test_daemon_down_falls_back_to_rtmidi_silently(self) -> None:
        mod, stub_rtmidi = _build_vo(None)
        host_client = mock.Mock()
        host_client.is_daemon_available.return_value = False
        with mock.patch.object(mod, "rtmidi", stub_rtmidi):
            vo = mod.VirtualMidiOutput("MAP2:Maschine-MK1")
            with mock.patch.object(vo, "_get_host_client",
                                      return_value=host_client):
                ok = vo.open()
        self.assertTrue(ok)
        self.assertIsNotNone(vo._port)
        self.assertEqual(vo._port.opened_virtual, "MAP2:Maschine-MK1")
        # create_virtual_port shouldn't have been called when daemon
        # is unavailable — the gate skips that path.
        host_client.create_virtual_port.assert_not_called()


class HostOwnedSendTests(unittest.TestCase):
    """When the port is host-owned (self._port is None), send_messages
    must not crash and must still attempt the host shadow-send."""

    def setUp(self) -> None:
        self._env = mock.patch.dict(os.environ, {"MAP2_USE_MIDI_HOST": "1"})
        self._env.start()

    def tearDown(self) -> None:
        self._env.stop()

    def test_send_messages_when_port_is_host_owned(self) -> None:
        mod, stub_rtmidi = _build_vo(None)
        host_client = mock.Mock()
        host_client.is_daemon_available.return_value = True
        host_client.create_virtual_port.return_value = {
            "type": "log_event", "level": "info", "message": "ok",
        }
        host_client.send_short_message.return_value = "msg-id-1"
        with mock.patch.object(mod, "rtmidi", stub_rtmidi):
            vo = mod.VirtualMidiOutput("MAP2:Maschine-MK1")
            with mock.patch.object(vo, "_get_host_client",
                                      return_value=host_client):
                self.assertTrue(vo.open())
                # _port is None now; send should still complete.
                vo.send_messages([bytes([0xB0, 0x07, 0x40])])
        self.assertEqual(vo.host_routed_sends, 1)
        host_client.send_short_message.assert_called_once_with(
            controller_key="native-instruments.maschine-mk1",
            message_bytes=bytes([0xB0, 0x07, 0x40]),
        )


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
