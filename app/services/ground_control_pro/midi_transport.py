from __future__ import annotations

import asyncio
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.utils.rtmidi_utils import dispose_rtmidi_client

from .model import GroundControlTransportOptions

try:
    import rtmidi  # type: ignore

    RTMIDI_AVAILABLE = True
except ImportError:  # pragma: no cover - environment dependent
    RTMIDI_AVAILABLE = False
    rtmidi = None


# T2482-P1.1 Gap D.1 (iter 46) — env-var-gated controller-host routing.
#
# Set MAP2_USE_MIDI_HOST=1 (or "true"/"yes") to route GCP SysEx I/O
# through map2-controller-host's libremidi backend instead of opening
# rtmidi directly. The default is OFF for the duration of the
# transition; a follow-up commit flips the default to ON once iters
# 46-49 have all consumers ported and the latency floor (Gap C) is
# measured. After the rtmidi-removal commit (Gap E / iter 50) the
# env var disappears entirely and the host path becomes mandatory.
def _use_midi_host() -> bool:
    val = os.environ.get("MAP2_USE_MIDI_HOST", "")
    return val.strip().lower() in ("1", "true", "yes", "on")


# Stable controller_key for GCP. The controller-host routes outbound
# SysEx by controller_key; the value here doesn't have to be unique
# across the cluster, just stable across calls from this transport.
_GCP_CONTROLLER_KEY = "voodoo-lab.ground-control-pro"


class GroundControlMidiTransport:
    def __init__(self, midi_in_factory: Any = None, midi_out_factory: Any = None) -> None:
        self._midi_in_factory = midi_in_factory
        self._midi_out_factory = midi_out_factory
        # Lazy MidiHostClient — only constructed when the env-var gate
        # is on AND a real call is made. Tests can inject factories so
        # they never hit this path.
        self._host_client: Any = None

    def _get_host_client(self) -> Any:
        if self._host_client is None:
            from app.services.midi_host_client import MidiHostClient
            self._host_client = MidiHostClient()
        return self._host_client

    def _make_midi_in(self) -> Any:
        if self._midi_in_factory is not None:
            return self._midi_in_factory()
        if not RTMIDI_AVAILABLE:
            raise RuntimeError("python-rtmidi is not available")
        return rtmidi.MidiIn()

    def _make_midi_out(self) -> Any:
        if self._midi_out_factory is not None:
            return self._midi_out_factory()
        if not RTMIDI_AVAILABLE:
            raise RuntimeError("python-rtmidi is not available")
        return rtmidi.MidiOut()

    @staticmethod
    def _resolve_port_index(port_names: List[str], requested_index: Optional[int], requested_name: Optional[str]) -> int:
        if requested_index is not None:
            if requested_index < 0 or requested_index >= len(port_names):
                raise ValueError(f"Port index {requested_index} is out of range")
            return requested_index
        if requested_name:
            lowered = requested_name.lower()
            for index, port_name in enumerate(port_names):
                if lowered in port_name.lower():
                    return index
            raise ValueError(f"No MIDI port matched '{requested_name}'")
        if len(port_names) != 1:
            raise ValueError("An explicit MIDI port selection is required")
        return 0

    def list_ports(self) -> Dict[str, Any]:
        # Host-routed path (env-gated). Only takes the host path when
        # there are no test-injected factories (factories indicate a
        # unit-test mode that wants the rtmidi shape).
        if (_use_midi_host()
                and self._midi_in_factory is None
                and self._midi_out_factory is None):
            client = self._get_host_client()
            if client.is_daemon_available():
                status, ports = client.list_ports()
                input_names = [p.name for p in ports if p.is_input]
                output_names = [p.name for p in ports if not p.is_input]
                return {
                    "rtmidi_available": True,  # host fronts a working backend
                    "inputs": [
                        {"index": i, "name": n, "connected": False}
                        for i, n in enumerate(input_names)
                    ],
                    "outputs": [
                        {"index": i, "name": n, "connected": False}
                        for i, n in enumerate(output_names)
                    ],
                    "recommended_input_index": 0 if len(input_names) == 1 else None,
                    "recommended_output_index": 0 if len(output_names) == 1 else None,
                    "host_routed": True,
                    "host_backend": status.backend,
                }
            # else: daemon down → fall through to rtmidi fallback.

        if not RTMIDI_AVAILABLE and self._midi_in_factory is None and self._midi_out_factory is None:
            return {
                "rtmidi_available": False,
                "inputs": [],
                "outputs": [],
                "recommended_input_index": None,
                "recommended_output_index": None,
            }

        midi_in = None
        midi_out = None
        try:
            midi_in = self._make_midi_in()
            midi_out = self._make_midi_out()
            input_names = list(midi_in.get_ports())
            output_names = list(midi_out.get_ports())
            return {
                "rtmidi_available": True,
                "inputs": [{"index": index, "name": name, "connected": False} for index, name in enumerate(input_names)],
                "outputs": [{"index": index, "name": name, "connected": False} for index, name in enumerate(output_names)],
                "recommended_input_index": 0 if len(input_names) == 1 else None,
                "recommended_output_index": 0 if len(output_names) == 1 else None,
            }
        finally:
            dispose_rtmidi_client(midi_in)
            dispose_rtmidi_client(midi_out)

    async def receive_sysex(self, options: GroundControlTransportOptions) -> Dict[str, Any]:
        midi_in = self._make_midi_in()
        port_names = list(midi_in.get_ports())
        port_index = self._resolve_port_index(port_names, options.input_port_index, options.input_port_name)
        midi_in.open_port(port_index)

        started = False
        payload: List[int] = []
        traffic: List[Dict[str, Any]] = []
        deadline = time.monotonic() + max(0.1, float(options.timeout_seconds))
        try:
            while time.monotonic() < deadline:
                message = midi_in.get_message()
                if message:
                    bytes_message, delta = message
                    chunk = [int(value) & 0xFF for value in bytes_message]
                    traffic.append(
                        {
                            "timestamp": time.time(),
                            "direction": "in",
                            "delta": float(delta),
                            "hex": " ".join(f"{value:02X}" for value in chunk),
                        }
                    )
                    if not started and 0xF0 in chunk:
                        started = True
                        payload.extend(chunk[chunk.index(0xF0):])
                    elif started:
                        payload.extend(chunk)
                    if started and 0xF7 in chunk:
                        end_index = payload.index(0xF7)
                        return {
                            "bytes": bytes(payload[:end_index + 1]),
                            "traffic": traffic,
                            "port_index": port_index,
                            "port_name": port_names[port_index],
                        }
                await asyncio.sleep(0.01)
            raise TimeoutError(f"Timed out waiting for SysEx on input port {port_index}")
        finally:
            dispose_rtmidi_client(midi_in)

    async def send_sysex(self, data: bytes, options: GroundControlTransportOptions) -> Dict[str, Any]:
        traffic: List[Dict[str, Any]] = []
        segment_count = 1
        segments = [bytes(data)]
        if options.chunk_size and options.chunk_size > 0 and len(data) > options.chunk_size:
            if not options.allow_unsafe_segmented_send:
                raise ValueError("Unsafe segmented SysEx send is disabled; use a single full-memory dump message")
            segments = [bytes(data[index:index + options.chunk_size]) for index in range(0, len(data), options.chunk_size)]
            segment_count = len(segments)

        if options.dry_run_path:
            dry_run_path = Path(options.dry_run_path)
            dry_run_path.parent.mkdir(parents=True, exist_ok=True)
            dry_run_path.write_bytes(data)
            for segment in segments:
                traffic.append(
                    {
                        "timestamp": time.time(),
                        "direction": "out",
                        "hex": " ".join(f"{value:02X}" for value in segment[:64]),
                        "dry_run": True,
                    }
                )
            return {
                "dry_run": True,
                "bytes_sent": len(data),
                "segments": segment_count,
                "traffic": traffic,
                "path": str(dry_run_path),
            }

        # Host-routed send path (env-gated). The controller-host owns
        # the libremidi output port — we just hand it the SysEx bytes.
        # Port resolution is host-side (the host enumerates against the
        # same JACK MIDI graph rtmidi sees), so we still resolve the
        # port name here for the response payload + traffic log.
        if (_use_midi_host()
                and self._midi_out_factory is None):
            client = self._get_host_client()
            if client.is_daemon_available():
                status, ports = client.list_ports()
                output_names = [p.name for p in ports if not p.is_input]
                port_index = self._resolve_port_index(
                    output_names, options.output_port_index, options.output_port_name
                )
                for index, segment in enumerate(segments):
                    client.send_sysex(
                        controller_key=_GCP_CONTROLLER_KEY,
                        sysex_bytes=bytes(segment),
                    )
                    traffic.append(
                        {
                            "timestamp": time.time(),
                            "direction": "out",
                            "hex": " ".join(f"{value:02X}" for value in segment[:64]),
                            "segment_index": index,
                            "host_routed": True,
                        }
                    )
                    if options.inter_message_delay_ms > 0 and index < len(segments) - 1:
                        await asyncio.sleep(options.inter_message_delay_ms / 1000.0)
                return {
                    "dry_run": False,
                    "bytes_sent": len(data),
                    "segments": segment_count,
                    "traffic": traffic,
                    "port_index": port_index,
                    "port_name": output_names[port_index],
                    "host_routed": True,
                    "host_backend": status.backend,
                }
            # else: daemon down → fall through to rtmidi fallback below.

        midi_out = self._make_midi_out()
        port_names = list(midi_out.get_ports())
        port_index = self._resolve_port_index(port_names, options.output_port_index, options.output_port_name)
        midi_out.open_port(port_index)
        try:
            for index, segment in enumerate(segments):
                midi_out.send_message(list(segment))
                traffic.append(
                    {
                        "timestamp": time.time(),
                        "direction": "out",
                        "hex": " ".join(f"{value:02X}" for value in segment[:64]),
                        "segment_index": index,
                    }
                )
                if options.inter_message_delay_ms > 0 and index < len(segments) - 1:
                    await asyncio.sleep(options.inter_message_delay_ms / 1000.0)
            return {
                "dry_run": False,
                "bytes_sent": len(data),
                "segments": segment_count,
                "traffic": traffic,
                "port_index": port_index,
                "port_name": port_names[port_index],
            }
        finally:
            dispose_rtmidi_client(midi_out)
