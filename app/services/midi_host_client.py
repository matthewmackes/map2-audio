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


# T2482-P1.1 Gap E phase 3 (iter 53) — strict mode opt-in.
#
# When MAP2_REQUIRE_MIDI_HOST is set to a truthy value (1/true/yes/on),
# the rtmidi-fallback paths in the 5 consumers MUST raise instead of
# falling through. This is the failure-mode validation surface needed
# before iters 54-58 strip the rtmidi fallback code entirely.
#
# Default OFF — strict mode is opt-in (operators can run with it set
# during a soak window to confirm the host path is rock-solid before
# the rtmidi removal lands). Once iter 59 drops python-rtmidi, the
# rtmidi fallback paths are gone and this env var becomes redundant.
def midi_host_required() -> bool:
    """Return True iff MAP2_REQUIRE_MIDI_HOST is explicitly enabled.

    When True, consumers MUST NOT fall back to rtmidi when the
    controller-host is unreachable; they must raise (or otherwise
    surface the failure to the caller) instead.

    See iter-50b T2482_P1_1_RTMIDI_REMOVAL_READINESS.md for the role
    of this env var in the rtmidi-removal sequencing.
    """
    import os
    val = os.environ.get("MAP2_REQUIRE_MIDI_HOST", "").strip().lower()
    return val in ("1", "true", "yes", "on")


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

    # ------------------------------------------------------------------
    # Daemon-lifecycle health gate (T2482-P1.1 Gap B / iter 45)
    # ------------------------------------------------------------------

    def is_daemon_available(self) -> bool:
        """Return True iff the controller-host daemon is reachable.

        Cheap probe — checks that the UDS socket file exists AND that a
        connect() succeeds. Intended for the rtmidi-fallback decision
        in iters 46-49: if the host is up, route through it; if not,
        fall back to rtmidi (transitional) or fail (post-Gap E).

        Does NOT exchange any frames — purely a connectivity probe.
        """
        if not self._socket_path.exists():
            return False
        try:
            sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            sock.settimeout(0.2)
            sock.connect(str(self._socket_path))
            sock.close()
            return True
        except OSError:
            return False

    def wait_for_daemon(self, timeout_s: float = 10.0,
                         poll_interval_s: float = 0.25) -> bool:
        """Block until the daemon socket is available or timeout elapses.

        Used during service startup when the FastAPI backend wants to
        wait briefly for map2-controller-host.service to come up before
        deciding whether to route through the host or fall back to the
        legacy rtmidi path. Returns True if the daemon became available
        within ``timeout_s``, False on timeout.
        """
        import time
        deadline = time.monotonic() + timeout_s
        while time.monotonic() < deadline:
            if self.is_daemon_available():
                return True
            time.sleep(poll_interval_s)
        return False

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

    def send_short_message(
        self,
        *,
        controller_key: str,
        message_bytes: bytes,
    ) -> str:
        """Send a MIDI 1.0 short message OUT through a connected controller.

        T2482-P1.1 Gap A.1 — drop-in replacement for the rtmidi
        ``MidiOut.send_message(bytes)`` shape. Wraps ``MidiSendRequest``
        with ``format="midi1"``. Accepts the standard 1..3-byte short
        message (status + 0..2 data bytes); the host validates the
        leading status byte and routes through libremidi's output
        path.

        Fire-and-forget; the caller does not wait for an outbound
        acknowledgement.
        """
        payload = bytes(message_bytes)
        if len(payload) < 1 or len(payload) > 3:
            raise MidiHostClientError(
                f"MIDI 1.0 short message length must be 1..3 bytes, got {len(payload)}"
            )
        # Validate leading status byte (high bit set, in range 0x80..0xEF
        # or system-realtime range 0xF1..0xFE).  System-exclusive (0xF0)
        # is NOT a short message — callers must use send_sysex().
        status = payload[0]
        if status < 0x80 or status == 0xF0 or status == 0xF7:
            raise MidiHostClientError(
                f"first byte must be a status byte in 0x80..0xEF (got 0x{status:02X})"
            )
        msg_id = uuid.uuid4().hex
        request = {
            "type": "midi_send_request",
            "msg_id": msg_id,
            "schema_version": SCHEMA_VERSION,
            "controller_key": str(controller_key),
            "bytes": list(payload),
            "format": "midi1",
        }
        self._send_only(request)
        return msg_id

    def send_sysex(
        self,
        *,
        controller_key: str,
        sysex_bytes: bytes,
    ) -> str:
        """Send a MIDI 1.0 SysEx message OUT through a connected controller.

        T2482-P1.1 Gap A.2 — drop-in replacement for the rtmidi
        ``MidiOut.send_message(sysex_bytes)`` shape when the bytes are a
        full SysEx envelope. Wraps ``MidiSendRequest`` with
        ``format="midi1"``.

        ``sysex_bytes`` must be a complete envelope: starts with 0xF0
        (SysEx start), ends with 0xF7 (SysEx end), with at least one
        body byte in between (minimum 3 bytes total). Multi-byte
        manufacturer IDs and arbitrary payload lengths up to the wire
        cap (~4 GiB IPC frame) are accepted; physical MIDI cable
        bandwidth is the real ceiling.

        Fire-and-forget; the caller does not wait for an outbound
        acknowledgement.
        """
        payload = bytes(sysex_bytes)
        if len(payload) < 3:
            raise MidiHostClientError(
                f"SysEx envelope must be >= 3 bytes (F0 ... F7), got {len(payload)}"
            )
        if payload[0] != 0xF0:
            raise MidiHostClientError(
                f"SysEx envelope must start with 0xF0, got 0x{payload[0]:02X}"
            )
        if payload[-1] != 0xF7:
            raise MidiHostClientError(
                f"SysEx envelope must end with 0xF7, got 0x{payload[-1]:02X}"
            )
        # Body bytes (between F0 and F7) must all be data bytes (high
        # bit clear) — a stray status byte mid-SysEx is a protocol
        # violation that the host would otherwise propagate to the wire.
        for i in range(1, len(payload) - 1):
            if payload[i] >= 0x80:
                raise MidiHostClientError(
                    f"SysEx body byte at index {i} has high bit set "
                    f"(0x{payload[i]:02X}); only F0/F7 are allowed status bytes"
                )
        msg_id = uuid.uuid4().hex
        request = {
            "type": "midi_send_request",
            "msg_id": msg_id,
            "schema_version": SCHEMA_VERSION,
            "controller_key": str(controller_key),
            "bytes": list(payload),
            "format": "midi1",
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
# Event subscription (T2482-P1.1 Gap A.3)
# ---------------------------------------------------------------------

class MidiEventSubscription:
    """Long-lived UDS reader that demuxes outbound host frames to callbacks.

    Replaces the rtmidi ``MidiIn.set_callback(fn)`` shape. The host emits
    four outbound frame types over the UDS (see schemas/controller_host.py):

    - ``controller_event`` — raw MIDI/HID/bulk bytes captured by the host
      that did NOT match an active mapping. Used by the MIDI Learn wizard.
    - ``engine_command``   — a JS ``engine.setValue(...)`` call.
    - ``log_event``        — a host-internal log line or ``engine.log()``.
    - ``script_error``     — a QuickJS exception.

    Subscribers register one callback per type; the reader thread invokes
    callbacks under the GIL (thread-safe enough for the use cases this
    replaces — rtmidi callbacks ran from RtMidi's reader thread which had
    the same property).

    Lifecycle: ``start()`` opens the UDS, spawns the reader thread, and
    returns immediately. ``stop()`` shuts the reader thread down + closes
    the socket. The subscription is single-use; create a new one to
    reconnect after a stop.
    """

    def __init__(
        self,
        socket_path: Path,
        timeout_s: float = DEFAULT_TIMEOUT_S,
    ) -> None:
        self._socket_path = socket_path
        self._timeout_s = timeout_s
        self._sock: socket.socket | None = None
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        # callback registry — one optional callable per outbound type.
        self._callbacks: dict[str, Any] = {
            "controller_event": None,
            "engine_command":   None,
            "log_event":        None,
            "script_error":     None,
        }

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def on_controller_event(self, fn: Any) -> None:
        """Set the callback for raw ``controller_event`` frames.

        Callable is invoked with the decoded TypedDict (``ControllerEvent``)
        from a reader thread. Pass ``None`` to clear.
        """
        self._callbacks["controller_event"] = fn

    def on_engine_command(self, fn: Any) -> None:
        """Set the callback for ``engine_command`` frames."""
        self._callbacks["engine_command"] = fn

    def on_log_event(self, fn: Any) -> None:
        """Set the callback for ``log_event`` frames."""
        self._callbacks["log_event"] = fn

    def on_script_error(self, fn: Any) -> None:
        """Set the callback for ``script_error`` frames."""
        self._callbacks["script_error"] = fn

    def start(self) -> None:
        """Open the UDS connection and spawn the reader thread.

        Raises ``MidiHostClientError`` if the connect fails. After a
        successful start, the reader thread runs until ``stop()`` or
        the host closes the socket.
        """
        if self._sock is not None:
            raise MidiHostClientError("subscription already started")
        try:
            sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            sock.settimeout(self._timeout_s)
            sock.connect(str(self._socket_path))
            # After connect, switch to non-blocking-with-timeout for the
            # reader loop so stop() can interrupt within ~timeout_s.
            sock.settimeout(0.5)
        except OSError as exc:
            raise MidiHostClientError(
                f"cannot connect to controller-host UDS at {self._socket_path}: {exc}"
            ) from exc
        self._sock = sock
        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._run, name="MidiEventSubscription", daemon=True
        )
        self._thread.start()

    def stop(self) -> None:
        """Signal the reader thread to exit + close the socket."""
        self._stop_event.set()
        if self._sock is not None:
            try:
                self._sock.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            try:
                self._sock.close()
            except OSError:
                pass
            self._sock = None
        if self._thread is not None:
            self._thread.join(timeout=2.0)
            self._thread = None

    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    # ------------------------------------------------------------------
    # Internal reader loop
    # ------------------------------------------------------------------

    def _run(self) -> None:
        assert self._sock is not None
        buf = b""
        while not self._stop_event.is_set():
            try:
                chunk = self._sock.recv(4096)
            except socket.timeout:
                continue
            except OSError:
                # Socket closed during stop() — bail.
                return
            if not chunk:
                # Host closed — exit reader.
                return
            buf += chunk
            # Drain every complete frame in the buffer; the host can
            # batch multiple frames into one TCP segment.
            while True:
                msg, rest = decode_frame(buf)
                if msg is None:
                    break
                buf = rest
                self._dispatch(msg)

    def _dispatch(self, msg: dict) -> None:
        msg_type = msg.get("type")
        cb = self._callbacks.get(str(msg_type)) if msg_type else None
        if cb is None:
            return
        try:
            cb(msg)
        except Exception:  # pragma: no cover - callback errors must not kill the reader
            # We deliberately swallow so a buggy subscriber doesn't take
            # down the whole event stream. Real diagnostics belong on
            # the subscriber's side.
            pass


# Subscription factory on MidiHostClient so the rtmidi-replacement
# call sites can do `client.subscribe()` without importing the class.
def _attach_subscribe_method() -> None:
    def subscribe(self: "MidiHostClient") -> MidiEventSubscription:
        """Open a long-lived event subscription on this client's socket.

        T2482-P1.1 Gap A.3 — drop-in replacement for
        ``rtmidi.MidiIn().set_callback(fn)`` that demuxes by frame type.
        Call ``.on_controller_event(fn)`` / ``.on_engine_command(fn)`` /
        ``.on_log_event(fn)`` / ``.on_script_error(fn)`` on the returned
        subscription, then ``.start()`` to begin streaming.
        """
        return MidiEventSubscription(self._socket_path, self._timeout_s)
    setattr(MidiHostClient, "subscribe", subscribe)


_attach_subscribe_method()


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
