"""T2482 SHIP loop 9 / iter 82 — GCP receive_sysex host-routed refactor.

Verifies the iter-82 refactor of GCP midi_transport receive_sysex
from rtmidi.MidiIn polling to MidiHostClient.subscribe() event-driven
receive. Key behaviours:

1. Production path (no factory injected): host-routed receive returns
   the SysEx envelope assembled from controller_event frames.
2. Production path: timeout when no envelope arrives.
3. Production path: daemon down → MidiHostClientError raised.
4. Test factory path: legacy rtmidi-shape polling still works for
   tests that inject midi_in_factory.
"""

from __future__ import annotations

import asyncio
import os
import threading
import time
import unittest
from unittest import mock

from app.services.ground_control_pro.midi_transport import (
    GroundControlMidiTransport,
)
from app.services.ground_control_pro.model import GroundControlTransportOptions
from app.services.midi_host_client import MidiBackendStatus, MidiPortInfo


def _make_fake_subscription():
    """A subscription mock that captures the registered controller_event
    callback so the test can drive it as if events arrived."""
    sub = mock.Mock()
    captured = {"controller_event_cb": None}
    def _on_ce(fn):
        captured["controller_event_cb"] = fn
    sub.on_controller_event.side_effect = _on_ce
    sub.start = mock.Mock()
    sub.stop = mock.Mock()
    sub._captured = captured  # type: ignore[attr-defined]
    return sub


def _make_host_client_with_subscription(sub):
    fake_status = MidiBackendStatus(backend="jack_midi", degraded=False)
    fake_ports = [
        MidiPortInfo(name="GCP In Port 1", id="gcp-in", is_input=True, is_virtual=False),
        MidiPortInfo(name="GCP Out", id="gcp-out", is_input=False, is_virtual=False),
    ]
    client = mock.Mock()
    client.is_daemon_available.return_value = True
    client.list_ports.return_value = (fake_status, fake_ports)
    client.open_midi_input.return_value = "msg-id-1"
    client.subscribe.return_value = sub
    return client


class HostRoutedReceiveSysExTests(unittest.TestCase):
    def setUp(self) -> None:
        self._env = mock.patch.dict(os.environ, {"MAP2_USE_MIDI_HOST": "1"})
        self._env.start()

    def tearDown(self) -> None:
        self._env.stop()

    def test_complete_envelope_in_one_event(self) -> None:
        sub = _make_fake_subscription()
        client = _make_host_client_with_subscription(sub)
        transport = GroundControlMidiTransport()  # no factories

        async def go():
            opts = GroundControlTransportOptions(
                input_port_index=0,
                output_port_index=0,
                dry_run_path=None,
                inter_message_delay_ms=0,
                timeout_seconds=2.0,
            )
            return await transport.receive_sysex(opts)

        # Drive a complete F0..F7 envelope from a separate thread so
        # the receive_sysex coroutine has time to register the callback.
        def feed():
            time.sleep(0.05)
            cb = sub._captured["controller_event_cb"]
            assert cb is not None
            cb({
                "type": "controller_event",
                "controller_key": "voodoo-lab.ground-control-pro",
                "bytes": [0xF0, 0x00, 0x00, 0x07, 0x10, 0xF7],
            })

        feeder = threading.Thread(target=feed, daemon=True)
        feeder.start()
        with mock.patch.object(transport, "_get_host_client", return_value=client):
            result = asyncio.run(go())
        feeder.join(timeout=2.0)

        self.assertTrue(result["host_routed"])
        self.assertEqual(result["bytes"], bytes([0xF0, 0x00, 0x00, 0x07, 0x10, 0xF7]))
        self.assertEqual(result["port_index"], 0)
        client.open_midi_input.assert_called_once_with(
            controller_key="voodoo-lab.ground-control-pro",
            port_id="GCP In Port 1",
        )
        sub.start.assert_called_once()
        sub.stop.assert_called_once()

    def test_envelope_split_across_events(self) -> None:
        sub = _make_fake_subscription()
        client = _make_host_client_with_subscription(sub)
        transport = GroundControlMidiTransport()

        async def go():
            opts = GroundControlTransportOptions(
                input_port_index=0,
                output_port_index=0,
                dry_run_path=None,
                inter_message_delay_ms=0,
                timeout_seconds=2.0,
            )
            return await transport.receive_sysex(opts)

        def feed():
            time.sleep(0.05)
            cb = sub._captured["controller_event_cb"]
            assert cb is not None
            cb({
                "type": "controller_event",
                "controller_key": "voodoo-lab.ground-control-pro",
                "bytes": [0xF0, 0x00, 0x01],
            })
            time.sleep(0.05)
            cb({
                "type": "controller_event",
                "controller_key": "voodoo-lab.ground-control-pro",
                "bytes": [0x02, 0xF7],
            })

        feeder = threading.Thread(target=feed, daemon=True)
        feeder.start()
        with mock.patch.object(transport, "_get_host_client", return_value=client):
            result = asyncio.run(go())
        feeder.join(timeout=2.0)

        self.assertEqual(result["bytes"], bytes([0xF0, 0x00, 0x01, 0x02, 0xF7]))
        self.assertEqual(len(result["traffic"]), 2)

    def test_timeout_when_no_envelope_arrives(self) -> None:
        sub = _make_fake_subscription()
        client = _make_host_client_with_subscription(sub)
        transport = GroundControlMidiTransport()

        async def go():
            opts = GroundControlTransportOptions(
                input_port_index=0,
                output_port_index=0,
                dry_run_path=None,
                inter_message_delay_ms=0,
                timeout_seconds=0.2,
            )
            return await transport.receive_sysex(opts)

        with mock.patch.object(transport, "_get_host_client", return_value=client):
            with self.assertRaises(TimeoutError) as ctx:
                asyncio.run(go())
        self.assertIn("Timed out", str(ctx.exception))
        self.assertIn("host-routed", str(ctx.exception))
        sub.stop.assert_called_once()

    def test_daemon_down_raises(self) -> None:
        from app.services.midi_host_client import MidiHostClientError
        client = mock.Mock()
        client.is_daemon_available.return_value = False
        transport = GroundControlMidiTransport()

        async def go():
            opts = GroundControlTransportOptions(
                input_port_index=0,
                output_port_index=0,
                dry_run_path=None,
                inter_message_delay_ms=0,
                timeout_seconds=1.0,
            )
            return await transport.receive_sysex(opts)

        with mock.patch.object(transport, "_get_host_client", return_value=client):
            with self.assertRaises(MidiHostClientError) as ctx:
                asyncio.run(go())
        self.assertIn("controller-host daemon is unreachable", str(ctx.exception))
        self.assertIn("GCP", str(ctx.exception))

    def test_other_controller_events_are_ignored(self) -> None:
        # Events for a different controller_key should not pollute
        # our envelope accumulation.
        sub = _make_fake_subscription()
        client = _make_host_client_with_subscription(sub)
        transport = GroundControlMidiTransport()

        async def go():
            opts = GroundControlTransportOptions(
                input_port_index=0, output_port_index=0,
                dry_run_path=None, inter_message_delay_ms=0,
                timeout_seconds=2.0,
            )
            return await transport.receive_sysex(opts)

        def feed():
            time.sleep(0.05)
            cb = sub._captured["controller_event_cb"]
            # Wrong controller_key — must be ignored.
            cb({
                "type": "controller_event",
                "controller_key": "some.other.controller",
                "bytes": [0xF0, 0x99, 0xF7],
            })
            time.sleep(0.05)
            cb({
                "type": "controller_event",
                "controller_key": "voodoo-lab.ground-control-pro",
                "bytes": [0xF0, 0x00, 0xF7],
            })

        feeder = threading.Thread(target=feed, daemon=True)
        feeder.start()
        with mock.patch.object(transport, "_get_host_client", return_value=client):
            result = asyncio.run(go())
        feeder.join(timeout=2.0)
        # Only the GCP envelope landed in the result.
        self.assertEqual(result["bytes"], bytes([0xF0, 0x00, 0xF7]))


class FactoryPathStillWorksTests(unittest.TestCase):
    """The legacy rtmidi-shape factory injection path is preserved
    for tests. Iter 82 only changed the production (no-factory) path."""

    def test_factory_injection_drives_polling_loop(self) -> None:
        # rtmidi-shape mock — get_message returns a complete envelope
        # on the second call, simulating polling over time.
        class _MockMidiIn:
            def __init__(self):
                self._opened = None
                self._calls = 0
                self._envelope = [0xF0, 0x00, 0x00, 0x07, 0x10, 0xF7]
            def get_ports(self):
                return ["MOCK GCP In"]
            def open_port(self, idx):
                self._opened = idx
            def get_message(self):
                self._calls += 1
                if self._calls == 2:
                    return (self._envelope, 0.001)
                return None
            def close_port(self): pass
            def delete(self): pass

        mock_midi_in = _MockMidiIn()
        transport = GroundControlMidiTransport(midi_in_factory=lambda: mock_midi_in)

        async def go():
            opts = GroundControlTransportOptions(
                input_port_index=0, output_port_index=0,
                dry_run_path=None, inter_message_delay_ms=0,
                timeout_seconds=2.0,
            )
            return await transport.receive_sysex(opts)

        result = asyncio.run(go())
        self.assertEqual(result["bytes"], bytes([0xF0, 0x00, 0x00, 0x07, 0x10, 0xF7]))
        self.assertNotIn("host_routed", result)
        self.assertEqual(mock_midi_in._opened, 0)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
