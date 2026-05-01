"""T2482 loop 9 / iter 89 — cross-consumer end-to-end soak test.

Spawns the actual map2-controller-host binary + drives every host-
routed surface that loop 9 ported (iters 82-86):

- iter 82: GCP receive_sysex via MidiHostClient.subscribe()
- iter 83: midi_engine MidiHub-routed binding (no rtmidi fallback)
- iter 84: midi_sysex_bridge_base no-rtmidi runtime construction
- iter 85: midi_hub AlsaMidiPort host-routed open/send/receive
- iter 86: Maschine VirtualMidiOutput.open() via
  MidiCreateVirtualPortRequest IPC (no rtmidi fallback)

Each surface is exercised in a single test; the suite runs as one
pytest module so a regression in any of the 5 ports (or in their
shared MidiHostClient surface) surfaces immediately. Skipped
gracefully when the binary isn't built (CI on Python-only sandboxes).
"""

from __future__ import annotations

import asyncio
import os
import socket
import subprocess
import time
import unittest
import uuid
from pathlib import Path
from unittest import mock

import pytest

from app.schemas.controller_host import SCHEMA_VERSION, decode_frame, encode_frame
from app.services.midi_host_client import (
    MidiHostClient,
    MidiBackendStatus,
    MidiPortInfo,
)


REPO_ROOT = Path(__file__).resolve().parents[1]
BINARY = REPO_ROOT / "juce-engine" / "build" / "map2-controller-host"


@pytest.mark.skipif(
    not BINARY.exists(),
    reason=f"map2-controller-host binary not built: {BINARY}",
)
class CrossConsumerSoakTests(unittest.TestCase):
    """Live daemon + every loop-9 surface, end-to-end."""

    def setUp(self) -> None:
        self._sock_path = Path(f"/tmp/map2-iter89-{uuid.uuid4().hex}.sock")
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

    # -----------------------------------------------------------------
    # Surface coverage — each test exercises one of the loop-9 surfaces
    # against the live daemon.
    # -----------------------------------------------------------------

    def test_midi_host_client_list_ports_returns_real_backend(self) -> None:
        """Smoke test: MidiHostClient list_ports against the live daemon.

        This is the foundation every loop-9 surface depends on. If
        this fails, every other surface also fails — fail fast here.
        """
        client = MidiHostClient(socket_path=self._sock_path, timeout_s=2.0)
        status, ports = client.list_ports()
        self.assertIsInstance(status, MidiBackendStatus)
        # backend is one of jack_midi / pipewire / alsa_seq / alsa_raw / none
        # depending on what's available on the bench. We just assert it's
        # a non-empty string.
        self.assertIsInstance(status.backend, str)
        self.assertGreater(len(status.backend), 0)
        self.assertIsInstance(ports, list)
        for p in ports:
            self.assertIsInstance(p, MidiPortInfo)

    def test_midi_host_client_create_virtual_port_works(self) -> None:
        """Iter 75 surface — MidiCreateVirtualPortRequest.

        Underpins the iter-86 Maschine flip: VirtualMidiOutput.open()
        calls this. If this surface regresses, Maschine breaks.
        """
        client = MidiHostClient(socket_path=self._sock_path, timeout_s=2.0)
        port_name = f"MAP2:iter89-{uuid.uuid4().hex[:6]}"
        response = client.create_virtual_port(name=port_name)
        self.assertEqual(response["type"], "log_event")
        self.assertEqual(response["level"], "info",
                          f"create_virtual_port returned {response}")
        self.assertIn("virtual output published", response["message"])

    def test_iter82_gcp_receive_sysex_subscribe_path_imports(self) -> None:
        """Iter 82 surface — GCP receive_sysex via subscribe().

        Just verify the production import path resolves cleanly + the
        transport class is instantiable without rtmidi. Live SysEx
        injection requires hardware; the iter-82 unit suite covers
        the subscribe-handler logic with mocks.
        """
        from app.services.ground_control_pro.midi_transport import (
            GroundControlMidiTransport,
        )
        transport = GroundControlMidiTransport()
        # _make_midi_in raises (no factory; rtmidi gone) — that's the
        # iter-82 contract. Verify it raises with the expected diagnostic.
        with self.assertRaises(RuntimeError) as ctx:
            transport._make_midi_in()
        self.assertIn("no factory injected", str(ctx.exception))
        self.assertIn("iter 82", str(ctx.exception))

    def test_iter83_midi_engine_imports_clean(self) -> None:
        """Iter 83 surface — midi_engine no longer imports rtmidi."""
        import app.services.midi_engine as me
        # rtmidi attribute should NOT exist on the module after iter 83.
        # (The Maschine module retains rtmidi=None as a stub for test
        # mocks; midi_engine doesn't.)
        self.assertFalse(
            hasattr(me, "rtmidi"),
            "midi_engine.rtmidi should be unset after iter 83 strip"
        )
        # RTMIDI_AVAILABLE pinned False per iter-83 docstring.
        self.assertFalse(me.RTMIDI_AVAILABLE)

    def test_iter84_bridge_base_runtime_returns_no_rtmidi(self) -> None:
        """Iter 84 surface — build_midi_sysex_runtime no rtmidi."""
        from app.services.midi_sysex_bridge_base import build_midi_sysex_runtime
        runtime = build_midi_sysex_runtime(
            simulator_env_var="MAP2_NONE",
            simulator_module="nonexistent_module",
            device_label="iter89-test",
        )
        # Iter-84 contract: rtmidi_* keys are False/None always.
        self.assertFalse(runtime["rtmidi_available"])
        self.assertIsNone(runtime["rtmidi_module"])

    def test_iter85_midi_hub_alsa_port_uses_host_metadata(self) -> None:
        """Iter 85 surface — AlsaMidiPort metadata reflects host routing."""
        from app.services.midi_hub.ports import AlsaMidiPort
        port = AlsaMidiPort(
            port_id="iter89.test.port",
            name="iter89-test-port",
            direction="input",
        )
        meta = port.metadata()
        # Iter-85 metadata includes host_routed True; rtmidi_available
        # was removed.
        self.assertTrue(meta["host_routed"])
        self.assertNotIn("rtmidi_available", meta)

    def test_iter86_maschine_virtual_output_no_rtmidi_fallback(self) -> None:
        """Iter 86 surface — Maschine open() returns False when daemon
        path fails (no rtmidi fallback to mask it)."""
        from app.services.maschine.maschine_mk1_daemon import VirtualMidiOutput
        vo = VirtualMidiOutput(name=f"MAP2:iter89-maschine-{uuid.uuid4().hex[:6]}")
        # Mock the host client to simulate daemon-unreachable.
        fake_client = mock.Mock()
        fake_client.is_daemon_available.return_value = False
        with mock.patch.object(vo, "_get_host_client",
                                  return_value=fake_client):
            self.assertFalse(vo.open())
            self.assertFalse(vo._is_open)
            self.assertIsNone(vo._port)

    # -----------------------------------------------------------------
    # End-to-end soak: drive activate/deactivate/reload + virtual port
    # publish + 5 list_ports cycles in succession; no regressions.
    # -----------------------------------------------------------------

    def test_end_to_end_lifecycle_soak(self) -> None:
        """Drive the daemon through a representative lifecycle.

        Not a long-duration soak (CI time budget); a 30-call sequence
        that exercises every IPC envelope type the loop-9 surfaces
        depend on. A real production soak (10+ minutes, 1000+ calls)
        is queued post-loop-9.
        """
        client = MidiHostClient(socket_path=self._sock_path, timeout_s=2.0)

        # 5x list_ports
        for _ in range(5):
            status, ports = client.list_ports()
            self.assertIsInstance(status.backend, str)
            time.sleep(0.030)

        # 3x create_virtual_port (each with a unique name)
        for i in range(3):
            response = client.create_virtual_port(
                name=f"MAP2:iter89-soak-{uuid.uuid4().hex[:6]}-{i}",
            )
            self.assertEqual(response["level"], "info")
            time.sleep(0.030)

        # 5x mapping lifecycle (activate → deactivate → reload)
        for i in range(5):
            ck = f"iter89.soak.{i}.{uuid.uuid4().hex[:6]}"
            descriptor = {
                "pack_id": "iter89", "model": "soak", "kind": "midi",
                "scripts": [], "controls": [], "outputs": [],
                "settings": [], "mixxx_alias_table": {},
            }
            for envelope_type in ("mapping_activate", "mapping_reload",
                                   "mapping_deactivate"):
                msg = {
                    "type": envelope_type,
                    "msg_id": f"{envelope_type}-{i}",
                    "schema_version": SCHEMA_VERSION,
                    "controller_key": ck,
                }
                if envelope_type in ("mapping_activate", "mapping_reload"):
                    msg["descriptor"] = descriptor
                # Send + receive via the client's roundtrip.
                s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                s.settimeout(2.0)
                s.connect(str(self._sock_path))
                s.sendall(encode_frame(msg))
                buf = b""
                while True:
                    chunk = s.recv(4096)
                    if not chunk:
                        break
                    buf += chunk
                    decoded, _ = decode_frame(buf)
                    if decoded is not None:
                        self.assertEqual(decoded["type"], "log_event")
                        self.assertEqual(decoded["level"], "info")
                        break
                s.close()
                time.sleep(0.030)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
