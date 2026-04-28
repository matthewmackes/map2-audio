"""MIDI host client — Python interface to map2-controller-host's MIDI surface.

Worklist: T2459-H1
Architecture: docs/architecture/CONTROLLER_LAYER.md §3, §5

Replaces direct ``python-rtmidi`` use across the FastAPI backend by
forwarding MIDI calls over the same UDS that
``app/services/controller_host_service.py`` already supervises. The
host is the single source of MIDI truth: libremidi I/O on the C++
side, Python is a typed client.

This module ships only the read-only ``list_ports()`` surface so the
H1 acceptance bullet is met (port enumeration parity vs. python-rtmidi
on the bench). Send-side calls and the binding/learn surface land with
H2/H3 alongside the QJS mapping engine.
"""
from __future__ import annotations

import socket
import threading
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

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

    # ------------------------------------------------------------------
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
