from __future__ import annotations

import asyncio
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.utils.rtmidi_utils import dispose_rtmidi_client

from .model import GroundControlTransportOptions

# T2482-P1.2 loop 9 / Surface 1 (iter 82) — rtmidi import removed.
#
# Production paths (list_ports, send_sysex, receive_sysex) all route
# through MidiHostClient. The factory-injection test mode is still
# supported but factories now MUST be supplied — there is no rtmidi
# fallback when factories are absent (production code never hits
# that branch because is_daemon_available() gating short-circuits to
# the host path or raises MidiHostClientError).
#
# Tests that previously did `transport = GroundControlMidiTransport()`
# without a factory + relied on rtmidi being available must now pass
# fake factories OR mock the host client (the production idiom).


# Stable controller_key for GCP. The controller-host routes outbound
# SysEx by controller_key; the value here doesn't have to be unique
# across the cluster, just stable across calls from this transport.
_GCP_CONTROLLER_KEY = "voodoo-lab.ground-control-pro"


class GroundControlMidiTransport:
    def __init__(self, midi_in_factory: Any = None, midi_out_factory: Any = None) -> None:
        self._midi_in_factory = midi_in_factory
        self._midi_out_factory = midi_out_factory
        # Lazy MidiHostClient — only constructed when a real call is
        # made (no test factory). Tests can inject factories so they
        # never hit the host path.
        self._host_client: Any = None

    def _get_host_client(self) -> Any:
        if self._host_client is None:
            from app.services.midi_host_client import MidiHostClient
            self._host_client = MidiHostClient()
        return self._host_client

    def _make_midi_in(self) -> Any:
        # Iter 82: rtmidi fallback removed. Test factory required.
        if self._midi_in_factory is None:
            raise RuntimeError(
                "_make_midi_in: no factory injected; production code "
                "should route through the host (iter 82 removed the "
                "rtmidi fallback)"
            )
        return self._midi_in_factory()

    def _make_midi_out(self) -> Any:
        # Iter 82: rtmidi fallback removed. Test factory required.
        if self._midi_out_factory is None:
            raise RuntimeError(
                "_make_midi_out: no factory injected; production code "
                "should route through the host (iter 82 removed the "
                "rtmidi fallback)"
            )
        return self._midi_out_factory()

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
        # Test-injected factory mode — keep the rtmidi-shape response
        # intact for unit tests.
        if (self._midi_in_factory is not None
                or self._midi_out_factory is not None):
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

        # Production path — controller-host is the only enumeration source.
        from app.services.midi_host_client import MidiHostClientError
        client = self._get_host_client()
        if not client.is_daemon_available():
            raise MidiHostClientError(
                "controller-host daemon is unreachable; cannot enumerate "
                "MIDI ports for GCP. Start map2-controller-host.service "
                "or set MAP2_USE_MIDI_HOST=0 (legacy rtmidi path was "
                "removed in iter 54)."
            )
        status, ports = client.list_ports()
        input_names = [p.name for p in ports if p.is_input]
        output_names = [p.name for p in ports if not p.is_input]
        return {
            "rtmidi_available": True,
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

    async def receive_sysex(self, options: GroundControlTransportOptions) -> Dict[str, Any]:
        # Iter 82 (T2482 loop 9 / Surface 1): test-factory path
        # preserved; production path now routes through
        # MidiHostClient.subscribe() instead of polling rtmidi.MidiIn.
        if self._midi_in_factory is not None:
            return await self._receive_sysex_via_factory(options)
        return await self._receive_sysex_via_host(options)

    async def _receive_sysex_via_factory(self, options: GroundControlTransportOptions) -> Dict[str, Any]:
        # Legacy polling path — used only by test factories.
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

    async def _receive_sysex_via_host(self, options: GroundControlTransportOptions) -> Dict[str, Any]:
        # Iter 82: production receive path — opens the input port via
        # the controller-host (MidiHostClient.open_midi_input), then
        # subscribes to controller_event frames and accumulates a
        # full SysEx envelope (F0 ... F7) across one or more events.
        # Returns the same dict shape as the legacy factory path.
        from app.services.midi_host_client import MidiHostClient, MidiHostClientError
        client = self._get_host_client()
        if not client.is_daemon_available():
            raise MidiHostClientError(
                "controller-host daemon is unreachable; cannot "
                "receive_sysex for GCP. Start map2-controller-host.service."
            )
        # Resolve the port name via the host's enumeration.
        _, ports = client.list_ports()
        input_names = [p.name for p in ports if p.is_input]
        port_index = self._resolve_port_index(
            input_names, options.input_port_index, options.input_port_name,
        )
        port_id = input_names[port_index]
        # Bind the port to the GCP controller_key on the host.
        client.open_midi_input(controller_key=_GCP_CONTROLLER_KEY, port_id=port_id)

        # Subscribe to controller_event frames; accumulate the SysEx
        # envelope. Threading: subscribe runs a daemon reader thread;
        # we coordinate via a threading.Event + a small inbound queue.
        import queue as _queue
        envelope_queue: "_queue.Queue[Dict[str, Any]]" = _queue.Queue()
        traffic: List[Dict[str, Any]] = []
        accumulator: Dict[str, Any] = {"started": False, "payload": []}

        def _on_controller_event(msg: dict) -> None:
            if msg.get("controller_key") != _GCP_CONTROLLER_KEY:
                return
            chunk = [int(b) & 0xFF for b in msg.get("bytes", [])]
            if not chunk:
                return
            traffic.append({
                "timestamp": time.time(),
                "direction": "in",
                "delta": 0.0,  # subscribe doesn't carry delta-time today
                "hex": " ".join(f"{value:02X}" for value in chunk),
            })
            payload = accumulator["payload"]
            if not accumulator["started"] and 0xF0 in chunk:
                accumulator["started"] = True
                payload.extend(chunk[chunk.index(0xF0):])
            elif accumulator["started"]:
                payload.extend(chunk)
            if accumulator["started"] and 0xF7 in payload:
                end_index = payload.index(0xF7)
                envelope_queue.put({
                    "bytes": bytes(payload[:end_index + 1]),
                    "port_id": port_id,
                })

        sub = client.subscribe()
        sub.on_controller_event(_on_controller_event)
        sub.start()
        try:
            deadline = time.monotonic() + max(0.1, float(options.timeout_seconds))
            while time.monotonic() < deadline:
                try:
                    result = envelope_queue.get(timeout=0.05)
                except _queue.Empty:
                    await asyncio.sleep(0)  # yield to the event loop
                    continue
                return {
                    "bytes": result["bytes"],
                    "traffic": traffic,
                    "port_index": port_index,
                    "port_name": result["port_id"],
                    "host_routed": True,
                }
            raise TimeoutError(
                f"Timed out waiting for SysEx on input port {port_index} "
                f"(host-routed, port_id={port_id})"
            )
        finally:
            sub.stop()

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

        # Test-injected factory mode — preserve rtmidi-shape behaviour
        # for unit tests.
        if self._midi_out_factory is not None:
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

        # Production path — controller-host owns the libremidi output port.
        from app.services.midi_host_client import MidiHostClientError
        client = self._get_host_client()
        if not client.is_daemon_available():
            raise MidiHostClientError(
                "controller-host daemon is unreachable; cannot send "
                "SysEx for GCP. Start map2-controller-host.service "
                "or set MAP2_USE_MIDI_HOST=0 (legacy rtmidi path was "
                "removed in iter 54)."
            )
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
