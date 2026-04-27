"""IPC schema for backend ↔ map2-controller-host.

Wire format: length-prefixed JSON frames over a Unix-domain socket at
``/run/map2/controller-host.sock``. The 4-byte big-endian length prefix
precedes a UTF-8 JSON payload that is one of the message types below.

Every message has a ``type`` discriminator and a ``msg_id`` for
request/response correlation. The two directions:

- Inbound (backend → controller-host): commands the host should
  execute (load script, activate mapping, send MIDI out, shutdown).
- Outbound (controller-host → backend): events the host emits during
  execution (engine command from JS, raw controller event for the
  learn wizard, log line, JS exception).

Worklist: T2459-A5
Architecture: docs/architecture/CONTROLLER_LAYER.md §5
Matching C++ structs: juce-engine/Source/ControllerHost/IpcMessages.h

CI gate: tests/test_controller_host_ipc_schema.py verifies the field
sets in this file match the field sets in the C++ header.
"""

from __future__ import annotations

from typing import Literal, NotRequired, TypedDict


# ---------------------------------------------------------------------------
# Schema version. Bump on any breaking change to a TypedDict below.
# ---------------------------------------------------------------------------

SCHEMA_VERSION = 1


# ---------------------------------------------------------------------------
# Inbound: backend → controller-host
# ---------------------------------------------------------------------------

class ScriptLoadRequest(TypedDict):
    """Load a mapping JS file into the host's QuickJS engine.

    The host parses + evaluates the script body and registers any
    incoming-data callbacks declared in it. Scripts are scoped per
    controller; loading a new script for a controller_key supersedes
    the previous one.
    """
    type: Literal["script_load_request"]
    msg_id: str
    schema_version: int
    controller_key: str
    pack_id: str
    model: str
    script_path: str   # absolute path on the host filesystem
    script_body: str   # JS source — host re-reads from disk only as fallback


class MappingActivate(TypedDict):
    """Set the active mapping descriptor for a connected controller.

    Sent after the operator picks a profile in the GUI. The host
    registers the descriptor's `controls` rows so MIDI/HID events on
    `controller_key` route to either an EngineCommand IPC message
    (default) or directly to a JS function (if the row has a `script`
    field).
    """
    type: Literal["mapping_activate"]
    msg_id: str
    schema_version: int
    controller_key: str
    descriptor: "MappingDescriptorPayload"


class MidiSendRequest(TypedDict):
    """Send a MIDI message OUT through a connected controller.

    Used for LED feedback, controller-side preset switching, etc.
    """
    type: Literal["midi_send_request"]
    msg_id: str
    schema_version: int
    controller_key: str
    bytes: list[int]   # 1-3 byte MIDI message or full SysEx


class Shutdown(TypedDict):
    """Graceful shutdown. Host flushes pending output and exits 0."""
    type: Literal["shutdown"]
    msg_id: str
    schema_version: int


# ---------------------------------------------------------------------------
# Outbound: controller-host → backend
# ---------------------------------------------------------------------------

class EngineCommand(TypedDict):
    """A JS `engine.setValue(...)` call to forward to the audio engine.

    The backend dispatches via the existing JUCE bridge to the
    Map2AudioEngine API surface. JS-side exceptions become
    ScriptError (below) instead of EngineCommand.
    """
    type: Literal["engine_command"]
    msg_id: str
    schema_version: int
    controller_key: str
    target: str         # "audio.chain.1.volume", "audio.master.bypass", ...
    action: str         # "set" | "toggle" | "increment" | "decrement" | ...
    value: NotRequired[float]   # absent for actions that don't take a value
    args: NotRequired[list[float | int | str | bool]]


class ControllerEvent(TypedDict):
    """A raw MIDI/HID/bulk event captured by the host.

    Forwarded to the backend so the MidiLearnWizard can observe inputs
    on demand. The backend filters: events that already routed via a
    fast-path or via a registered mapping JS function are NOT sent as
    ControllerEvent (the host emits EngineCommand for those instead);
    only events that did not match any active binding produce
    ControllerEvent.
    """
    type: Literal["controller_event"]
    msg_id: str
    schema_version: int
    controller_key: str
    timestamp_ns: int
    bytes: list[int]


class LogEvent(TypedDict):
    """A line emitted by JS `engine.log(...)` or a host-internal log."""
    type: Literal["log_event"]
    msg_id: str
    schema_version: int
    controller_key: NotRequired[str]   # absent for host-internal logs
    level: Literal["debug", "info", "warning", "error"]
    message: str


class ScriptError(TypedDict):
    """A QuickJS exception caught while running a mapping.

    The mapping is marked ``failed`` on the host; subsequent events for
    its controller_key route to EngineCommand (no JS) or are dropped if
    no fast-path binding exists. The backend surfaces the error to the
    GUI's error log.
    """
    type: Literal["script_error"]
    msg_id: str
    schema_version: int
    controller_key: str
    file: NotRequired[str]
    line: NotRequired[int]
    column: NotRequired[int]
    message: str
    stack: NotRequired[str]


# ---------------------------------------------------------------------------
# Shared payload types
# ---------------------------------------------------------------------------

class MappingControlPayload(TypedDict, total=False):
    """One control row from a MappingDescriptor sent to the host.

    Mirrors app.services.controllers.mapping_file_handler.MappingControl
    on the wire. Either `target`+`action` (direct binding) or `script`
    (JS function) is set; not both.
    """
    status: int
    midino: int
    channel: int
    target: str
    action: str
    script: str
    fast_path: bool
    description: str


class MappingDescriptorPayload(TypedDict):
    """Wire form of a MappingDescriptor sent in MappingActivate."""
    pack_id: str
    model: str
    kind: Literal["midi", "hid"]
    scripts: list[str]
    controls: list[MappingControlPayload]
    outputs: list[MappingControlPayload]
    settings: list[dict]
    mixxx_alias_table: dict[str, str]


# ---------------------------------------------------------------------------
# Field manifest — used by the schema-sync test to compare against the C++
# struct definitions in juce-engine/Source/ControllerHost/IpcMessages.h.
# ---------------------------------------------------------------------------

FIELD_MANIFEST: dict[str, list[str]] = {
    "ScriptLoadRequest": list(ScriptLoadRequest.__annotations__.keys()),
    "MappingActivate":   list(MappingActivate.__annotations__.keys()),
    "MidiSendRequest":   list(MidiSendRequest.__annotations__.keys()),
    "Shutdown":          list(Shutdown.__annotations__.keys()),
    "EngineCommand":     list(EngineCommand.__annotations__.keys()),
    "ControllerEvent":   list(ControllerEvent.__annotations__.keys()),
    "LogEvent":          list(LogEvent.__annotations__.keys()),
    "ScriptError":       list(ScriptError.__annotations__.keys()),
    "MappingControlPayload":    list(MappingControlPayload.__annotations__.keys()),
    "MappingDescriptorPayload": list(MappingDescriptorPayload.__annotations__.keys()),
}


# Type aliases for the dispatcher.
InboundMessage = ScriptLoadRequest | MappingActivate | MidiSendRequest | Shutdown
OutboundMessage = EngineCommand | ControllerEvent | LogEvent | ScriptError


# ---------------------------------------------------------------------------
# Wire-format helpers (length-prefixed framing).
# ---------------------------------------------------------------------------

def encode_frame(message: dict) -> bytes:
    """Serialize a message dict into a length-prefixed JSON frame.

    4-byte big-endian length + UTF-8 JSON payload.
    """
    import json
    payload = json.dumps(message, separators=(",", ":")).encode("utf-8")
    if len(payload) > 0xFFFF_FFFF:  # pragma: no cover — defensive
        raise ValueError("IPC frame too large (>4 GiB)")
    return len(payload).to_bytes(4, byteorder="big") + payload


def decode_frame(buffer: bytes) -> tuple[dict | None, bytes]:
    """Decode the leading frame from ``buffer`` if a complete one is
    present.

    Returns ``(message, remaining_buffer)``. If a full frame is not yet
    available, returns ``(None, buffer)`` unchanged.
    """
    import json
    if len(buffer) < 4:
        return None, buffer
    length = int.from_bytes(buffer[:4], byteorder="big")
    if len(buffer) < 4 + length:
        return None, buffer
    payload = buffer[4 : 4 + length]
    rest = buffer[4 + length :]
    return json.loads(payload.decode("utf-8")), rest
