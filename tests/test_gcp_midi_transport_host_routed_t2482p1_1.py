"""T2482-P1.1 Gap D.1 (iter 46) — GCP midi_transport host-routed flip.

Verifies the env-var-gated routing in
``app/services/ground_control_pro/midi_transport.py``:

- MAP2_USE_MIDI_HOST=0 (or unset) → rtmidi fallback path unchanged
  (test-injected factories continue to work).
- MAP2_USE_MIDI_HOST=1 → list_ports() + send_sysex() route through
  MidiHostClient against the controller-host UDS.
- Daemon down with the env var ON → graceful fall-through to rtmidi
  fallback (no failure escalation; matches the iter-41 reality
  audit's "transitional fallback" spec).
"""

from __future__ import annotations

import asyncio
import os
import socket
import threading
import unittest
import uuid
from pathlib import Path
from unittest import mock

from app.services.ground_control_pro.midi_transport import (
    GroundControlMidiTransport,
)
from app.services.ground_control_pro.model import GroundControlTransportOptions
from app.services.midi_host_client import MidiBackendStatus, MidiPortInfo


# ---------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------

class FakeMidiOut:
    def __init__(self, port_names: list[str]) -> None:
        self._port_names = port_names
        self._opened: int | None = None
        self.sent_messages: list[list[int]] = []
        self.closed = False

    def get_ports(self) -> list[str]:
        return list(self._port_names)

    def open_port(self, index: int) -> None:
        self._opened = index

    def send_message(self, msg: list[int]) -> None:
        self.sent_messages.append(list(msg))

    def close_port(self) -> None:
        self.closed = True


class FakeMidiIn(FakeMidiOut):
    pass


# ---------------------------------------------------------------------
# Env-var OFF: rtmidi fallback unchanged
# ---------------------------------------------------------------------

class EnvVarOffPreservesRtmidiPath(unittest.TestCase):
    """When MAP2_USE_MIDI_HOST is unset/false, the rtmidi path runs.

    This is the legacy behaviour — test-injected factories continue to
    drive list_ports() and send_sysex() exactly as before.
    """

    def setUp(self) -> None:
        self._env_patch = mock.patch.dict(os.environ, {"MAP2_USE_MIDI_HOST": "0"})
        self._env_patch.start()
        self._fake_in = FakeMidiIn(["GCP In Port 1", "GCP In Port 2"])
        self._fake_out = FakeMidiOut(["GCP Out Port 1"])
        self._transport = GroundControlMidiTransport(
            midi_in_factory=lambda: self._fake_in,
            midi_out_factory=lambda: self._fake_out,
        )

    def tearDown(self) -> None:
        self._env_patch.stop()

    def test_list_ports_uses_rtmidi_factories(self) -> None:
        result = self._transport.list_ports()
        self.assertEqual(result["rtmidi_available"], True)
        self.assertEqual(len(result["inputs"]), 2)
        self.assertEqual(result["inputs"][0]["name"], "GCP In Port 1")
        self.assertEqual(len(result["outputs"]), 1)
        self.assertEqual(result["outputs"][0]["name"], "GCP Out Port 1")
        self.assertEqual(result["recommended_output_index"], 0)
        self.assertNotIn("host_routed", result)  # not routed through host

    def test_send_sysex_uses_rtmidi_factories(self) -> None:
        async def go():
            opts = GroundControlTransportOptions(
                output_port_index=0, dry_run_path=None,
                inter_message_delay_ms=0,
            )
            return await self._transport.send_sysex(b"\xF0\x06\x00\xF7", opts)

        result = asyncio.run(go())
        self.assertEqual(result["dry_run"], False)
        self.assertEqual(result["bytes_sent"], 4)
        self.assertEqual(result["port_name"], "GCP Out Port 1")
        self.assertNotIn("host_routed", result)
        self.assertEqual(self._fake_out.sent_messages,
                          [[0xF0, 0x06, 0x00, 0xF7]])


# ---------------------------------------------------------------------
# Env-var ON + daemon up: route through MidiHostClient
# ---------------------------------------------------------------------

class EnvVarOnRoutesThroughHost(unittest.TestCase):
    def setUp(self) -> None:
        self._env_patch = mock.patch.dict(os.environ, {"MAP2_USE_MIDI_HOST": "1"})
        self._env_patch.start()
        # No factories injected — env-var path activates.
        self._transport = GroundControlMidiTransport()

    def tearDown(self) -> None:
        self._env_patch.stop()

    def test_list_ports_routes_through_host(self) -> None:
        fake_status = MidiBackendStatus(backend="jack_midi", degraded=False)
        fake_ports = [
            MidiPortInfo(name="UA-1000 Input", id="ua-in", is_input=True, is_virtual=False),
            MidiPortInfo(name="GCP Output", id="gcp-out", is_input=False, is_virtual=False),
        ]
        fake_client = mock.Mock()
        fake_client.is_daemon_available.return_value = True
        fake_client.list_ports.return_value = (fake_status, fake_ports)
        with mock.patch.object(self._transport, "_get_host_client",
                                  return_value=fake_client):
            result = self._transport.list_ports()
        self.assertTrue(result["host_routed"])
        self.assertEqual(result["host_backend"], "jack_midi")
        self.assertEqual(len(result["inputs"]), 1)
        self.assertEqual(result["inputs"][0]["name"], "UA-1000 Input")
        self.assertEqual(len(result["outputs"]), 1)
        self.assertEqual(result["outputs"][0]["name"], "GCP Output")

    def test_send_sysex_routes_through_host(self) -> None:
        fake_status = MidiBackendStatus(backend="jack_midi", degraded=False)
        fake_ports = [
            MidiPortInfo(name="GCP Output", id="gcp-out", is_input=False, is_virtual=False),
        ]
        fake_client = mock.Mock()
        fake_client.is_daemon_available.return_value = True
        fake_client.list_ports.return_value = (fake_status, fake_ports)
        fake_client.send_sysex.return_value = "msg-id-abc"

        async def go():
            opts = GroundControlTransportOptions(
                output_port_index=0, dry_run_path=None,
                inter_message_delay_ms=0,
            )
            return await self._transport.send_sysex(
                b"\xF0\x06\x00\xF7", opts
            )

        with mock.patch.object(self._transport, "_get_host_client",
                                  return_value=fake_client):
            result = asyncio.run(go())

        self.assertTrue(result["host_routed"])
        self.assertEqual(result["host_backend"], "jack_midi")
        self.assertEqual(result["bytes_sent"], 4)
        # The host client received the SysEx bytes verbatim, with the
        # canonical GCP controller_key.
        fake_client.send_sysex.assert_called_once_with(
            controller_key="voodoo-lab.ground-control-pro",
            sysex_bytes=b"\xF0\x06\x00\xF7",
        )

    def test_segmented_send_routes_each_chunk_through_host(self) -> None:
        # Build a 100-byte SysEx and ask for 30-byte chunks → 4 segments.
        body = bytes([0xF0, 0x00, 0x00, 0x07, 0x10] + [0x42] * 94 + [0xF7])
        self.assertEqual(len(body), 100)
        fake_status = MidiBackendStatus(backend="jack_midi", degraded=False)
        fake_ports = [
            MidiPortInfo(name="GCP Output", id="gcp-out", is_input=False, is_virtual=False),
        ]
        fake_client = mock.Mock()
        fake_client.is_daemon_available.return_value = True
        fake_client.list_ports.return_value = (fake_status, fake_ports)

        async def go():
            opts = GroundControlTransportOptions(
                output_port_index=0,
                dry_run_path=None,
                inter_message_delay_ms=0,
                chunk_size=30,
                allow_unsafe_segmented_send=True,
            )
            return await self._transport.send_sysex(body, opts)

        with mock.patch.object(self._transport, "_get_host_client",
                                  return_value=fake_client):
            result = asyncio.run(go())

        self.assertTrue(result["host_routed"])
        self.assertEqual(result["segments"], 4)
        self.assertEqual(fake_client.send_sysex.call_count, 4)


# ---------------------------------------------------------------------
# Env-var ON + daemon DOWN: graceful fall-through to rtmidi
# ---------------------------------------------------------------------

class EnvVarOnDaemonDownFallsThrough(unittest.TestCase):
    def setUp(self) -> None:
        self._env_patch = mock.patch.dict(os.environ, {"MAP2_USE_MIDI_HOST": "1"})
        self._env_patch.start()
        self._fake_out = FakeMidiOut(["GCP Out Port 1"])
        # Inject factories — but env var also says "use host". Test
        # confirms that when the daemon is unavailable the rtmidi path
        # still runs (no factory injection conflict — factories are
        # available but the host path skips them when env is OFF; with
        # env ON + daemon down it falls back to factories cleanly).
        self._transport = GroundControlMidiTransport(
            midi_out_factory=lambda: self._fake_out,
        )

    def tearDown(self) -> None:
        self._env_patch.stop()

    def test_send_sysex_raises_cleanly_when_daemon_unreachable(self) -> None:
        # Iter 54: rtmidi fallback removed for non-factory mode.
        # When daemon is down + no factory injected, send_sysex must
        # raise MidiHostClientError with a descriptive message
        # pointing to the systemd unit + the env-var opt-out.
        from app.services.midi_host_client import MidiHostClientError

        bare = GroundControlMidiTransport()  # no factories
        fake_client = mock.Mock()
        fake_client.is_daemon_available.return_value = False  # daemon down

        async def go():
            opts = GroundControlTransportOptions(
                output_port_index=0, dry_run_path=None,
                inter_message_delay_ms=0,
            )
            return await bare.send_sysex(b"\xF0\x06\x00\xF7", opts)

        with mock.patch.object(bare, "_get_host_client",
                                  return_value=fake_client):
            with self.assertRaises(MidiHostClientError) as ctx:
                asyncio.run(go())
        msg = str(ctx.exception)
        self.assertIn("controller-host daemon is unreachable", msg)
        self.assertIn("GCP", msg)
        self.assertIn("map2-controller-host.service", msg)
        fake_client.is_daemon_available.assert_called()


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
