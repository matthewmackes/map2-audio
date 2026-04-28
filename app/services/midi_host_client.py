"""MIDI host client — Python interface to map2-controller-host's MIDI surface.

Worklist: T2459-H1
Architecture: docs/architecture/CONTROLLER_LAYER.md §3, §5

Replaces direct ``python-rtmidi`` use across the FastAPI backend by
forwarding MIDI calls over the same UDS that
``app/services/controller_host_service.py`` already supervises. The
host is the single source of MIDI truth: libremidi I/O on the C++
side, Python is a typed client.

This module ships the H1 ``list_ports()`` round-trip plus H3 fire-and-
forget command surfaces (`script_load_request`, `mapping_activate`) so
the Python backend can drive host mapping activation without depending
on python-rtmidi.
"""
from __future__ import annotations

import socket
import threading
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

from app.schemas.controller_host import (
    SCHEMA_VERSION,
    decode_frame,
    encode_frame,
)


DEFAULT_SOCKET_PATH = Path("/run/map2/controller-host.sock")
DEFAULT_TIMEOUT_S = 2.0


@dataclass(frozen=True)
class MidiPortInfo:
    """Parity-shape with python-rtmidi's port enumeration.

    python-rtmidi exposes ``MidiIn().get_port_count() / get_port_name(i)``
    for inputs and the same on ``MidiOut`` for outputs. We expose the
    same axes via ``is_input`` so the parity test can compare against
    a reference enumeration.
    """
    name: str
    id: str
    is_input: bool
    is_virtual: bool


@dataclass(frozen=True)
class MidiBackendStatus:
    """Snapshot of the host's selected libremidi backend."""
    backend: str   # "jack_midi" | "pipewire" | "alsa_seq" | "alsa_raw" | "none"
    degraded: bool


class MidiHostClientError(RuntimeError):
    """Raised on any IPC failure during a MIDI request."""


class MidiHostClient:
    """Thin synchronous client over the controller-host UDS.

    Each call opens a fresh connection. The frame protocol is one
    request → one response; we don't keep a long-lived socket because
    the host's main loop is currently single-connection and other
    services may want to reach it concurrently.
    """

    def __init__(
        self,
        socket_path: Optional[Path] = None,
        timeout_s: float = DEFAULT_TIMEOUT_S,
    ) -> None:
        self._socket_path = Path(socket_path or DEFAULT_SOCKET_PATH)
        self._timeout_s = timeout_s
        self._lock = threading.Lock()

    @property
    def socket_path(self) -> Path:
        return self._socket_path

    def list_ports(self) -> tuple[MidiBackendStatus, list[MidiPortInfo]]:
        """Enumerate visible MIDI ports through the host's libremidi.

        Returns ``(backend_status, ports)``. Inputs first, then outputs
        (the host sorts them in that order so callers don't have to).

        Raises ``MidiHostClientError`` when the host isn't reachable or
        the response shape is malformed.
        """
        msg_id = uuid.uuid4().hex
        request = {
            "type": "midi_list_ports_request",
            "msg_id": msg_id,
            "schema_version": SCHEMA_VERSION,
        }
        response = self._roundtrip(request)
        if response.get("type") != "midi_list_ports_response":
            raise MidiHostClientError(
                f"unexpected response type: {response.get('type')!r}"
            )
        if response.get("msg_id") != msg_id:
            raise MidiHostClientError(
                f"msg_id mismatch: sent {msg_id} got {response.get('msg_id')!r}"
            )
        backend = MidiBackendStatus(
            backend=str(response.get("backend", "none")),
            degraded=bool(response.get("degraded", False)),
        )
        ports = [
            MidiPortInfo(
                name=str(p["name"]),
                id=str(p["id"]),
                is_input=bool(p["is_input"]),
                is_virtual=bool(p["is_virtual"]),
            )
            for p in response.get("ports", [])
        ]
        return backend, ports

    def load_script(
        self,
        *,
        controller_key: str,
        pack_id: str,
        model: str,
        script_path: str,
        script_body: str,
    ) -> str:
        """Send a ``script_load_request`` to the host.

        Fire-and-forget command. Returns the generated ``msg_id`` for
        caller-side correlation/logging.
        """
        msg_id = uuid.uuid4().hex
        request = {
            "type": "script_load_request",
            "msg_id": msg_id,
            "schema_version": SCHEMA_VERSION,
            "controller_key": str(controller_key),
            "pack_id": str(pack_id),
            "model": str(model),
            "script_path": str(script_path),
            "script_body": str(script_body),
        }
        self._send_only(request)
        return msg_id

    def open_midi_input(
        self,
        *,
        controller_key: str,
        port_id: str,
    ) -> str:
        """Send a ``midi_open_input_request`` to the host.

        T2459-H3 Slice 5 — bind a hardware MIDI input port (resolved via
        ``list_ports()``) to a controller_key so live inbound traffic
        routes through the loaded mapping descriptor for that controller.
        Fire-and-forget; the host replies with a ``log_event`` frame on
        success or error which the consumer surfaces via the response
        channel out-of-band.
        """
        msg_id = uuid.uuid4().hex
        request = {
            "type": "midi_open_input_request",
            "msg_id": msg_id,
            "schema_version": SCHEMA_VERSION,
            "controller_key": str(controller_key),
            "port_id": str(port_id),
        }
        self._send_only(request)
        return msg_id

    def send_ump(
        self,
        *,
        controller_key: str,
        packet_bytes: bytes,
    ) -> str:
        """Send a MIDI 2.0 UMP packet OUT through a connected controller.

        T2459-H5 Slice 13 — outbound counterpart of the ``pushUmpMessage``
        producer seam on the C++ side. ``packet_bytes`` must be a single
        UMP packet of 4/8/12/16 bytes (1..4 32-bit words). Fire-and-forget;
        host-side delivery to a UMP-capable port is gated on libremidi UMP
        support + a MIDI-2.0-capable device on the bench (HIL).
        """
        payload = bytes(packet_bytes)
        if len(payload) < 4 or len(payload) > 16 or (len(payload) % 4) != 0:
            raise MidiHostClientError(
                f"UMP packet length must be 4/8/12/16 bytes, got {len(payload)}"
            )
        msg_id = uuid.uuid4().hex
        request = {
            "type": "midi_send_request",
            "msg_id": msg_id,
            "schema_version": SCHEMA_VERSION,
            "controller_key": str(controller_key),
            "bytes": list(payload),
            "format": "ump",
        }
        self._send_only(request)
        return msg_id

    def activate_mapping(
        self,
        *,
        controller_key: str,
        descriptor: Any,
    ) -> str:
        """Send a ``mapping_activate`` command to the host.

        ``descriptor`` can be either a MappingDescriptor dataclass
        (`app.services.controllers.mapping_file_handler.MappingDescriptor`)
        or a dict already in wire shape.
        """
        msg_id = uuid.uuid4().hex
        request = {
            "type": "mapping_activate",
            "msg_id": msg_id,
            "schema_version": SCHEMA_VERSION,
            "controller_key": str(controller_key),
            "descriptor": self._descriptor_payload(descriptor),
        }
        self._send_only(request)
        return msg_id

    # ------------------------------------------------------------------
    @staticmethod
    def _descriptor_payload(descriptor: Any) -> dict[str, Any]:
        """Normalize a mapping descriptor into IPC-wire payload shape."""
        if isinstance(descriptor, dict):
            return dict(descriptor)

        def _control_payload(control: Any) -> dict[str, Any]:
            payload: dict[str, Any] = {}
            for key in (
                "status",
                "midino",
                "channel",
                "target",
                "action",
                "script",
                "fast_path",
                "description",
            ):
                value = getattr(control, key, None)
                if value is not None:
                    payload[key] = value
            if "fast_path" not in payload:
                payload["fast_path"] = False
            if "description" not in payload:
                payload["description"] = ""
            return payload

        return {
            "pack_id": str(getattr(descriptor, "pack_id")),
            "model": str(getattr(descriptor, "model")),
            "kind": str(getattr(descriptor, "kind")),
            "scripts": [str(item) for item in (getattr(descriptor, "scripts", ()) or ())],
            "controls": [_control_payload(item) for item in (getattr(descriptor, "controls", ()) or ())],
            "outputs": [_control_payload(item) for item in (getattr(descriptor, "outputs", ()) or ())],
            "settings": [dict(item) for item in (getattr(descriptor, "settings", ()) or ())],
            "mixxx_alias_table": dict(getattr(descriptor, "mixxx_alias_table", {}) or {}),
        }

    def _send_only(self, request: dict) -> None:
        """Send a single frame without waiting for a response."""
        with self._lock:
            try:
                sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                sock.settimeout(self._timeout_s)
                sock.connect(str(self._socket_path))
            except OSError as exc:
                raise MidiHostClientError(
                    f"cannot connect to controller-host UDS at {self._socket_path}: {exc}"
                ) from exc
            try:
                sock.sendall(encode_frame(request))
            except socket.timeout as exc:
                raise MidiHostClientError(
                    f"controller-host send timed out after {self._timeout_s}s"
                ) from exc
            finally:
                try:
                    sock.close()
                except OSError:
                    pass

    def _roundtrip(self, request: dict) -> dict:
        with self._lock:
            try:
                sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                sock.settimeout(self._timeout_s)
                sock.connect(str(self._socket_path))
            except OSError as exc:
                raise MidiHostClientError(
                    f"cannot connect to controller-host UDS at {self._socket_path}: {exc}"
                ) from exc
            try:
                sock.sendall(encode_frame(request))
                buf = b""
                while True:
                    chunk = sock.recv(4096)
                    if not chunk:
                        raise MidiHostClientError("controller-host closed UDS without responding")
                    buf += chunk
                    msg, rest = decode_frame(buf)
                    if msg is not None:
                        return msg
                    buf = rest
            except socket.timeout as exc:
                raise MidiHostClientError(
                    f"controller-host did not respond within {self._timeout_s}s"
                ) from exc
            finally:
                try:
                    sock.close()
                except OSError:
                    pass


# ---------------------------------------------------------------------
# Compatibility helpers — keep the python-rtmidi enumeration shape
# available for existing call sites that look for separate input/output
# port lists (mirrors `MidiIn().get_ports()` / `MidiOut().get_ports()`).
# ---------------------------------------------------------------------

def split_ports(ports: list[MidiPortInfo]) -> tuple[list[str], list[str]]:
    """Split a port list into ``(input_names, output_names)``.

    Mirrors python-rtmidi's separate-list enumeration so a parity test
    can compare ``MidiHostClient.list_ports()`` output to
    ``rtmidi.MidiIn().get_ports() + rtmidi.MidiOut().get_ports()``
    without rewriting the comparison logic.
    """
    inputs = [p.name for p in ports if p.is_input]
    outputs = [p.name for p in ports if not p.is_input]
    return inputs, outputs
