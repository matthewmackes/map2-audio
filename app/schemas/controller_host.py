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

# T2482-P1.2 Gap F.1 (iter 62): bumped from 1 → 2 because the
# MappingDeactivate / MappingReload / EventFeedback envelopes are
# additive, not breaking. Old clients ignore the new envelope types
# (the dispatcher silently drops unknown frames); new clients
# receive EventFeedback frames only when the host's debug flag is
# set, so v1-only consumers don't see them either.
SCHEMA_VERSION = 2


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


# T2482-P1.2 Gap F.1 (iter 62) — operator-facing IPC envelopes that
# extend the lifecycle of a controller mapping.
class MappingDeactivate(TypedDict):
    """Drop the active mapping descriptor for ``controller_key``.

    Reverse of MappingActivate. After deactivation, MIDI/HID events
    on the named controller_key flow through the host's default
    pass-through (controller_event IPC frames) instead of routing
    via the dropped JS handlers.
    """
    type: Literal["mapping_deactivate"]
    msg_id: str
    schema_version: int
    controller_key: str


class MappingReload(TypedDict):
    """Hot-reload the mapping descriptor for ``controller_key``.

    Equivalent to MappingDeactivate followed by MappingActivate but
    runs as a single host-side operation so the controller's port
    handles + scripts reload without dropping inbound events for
    the duration of the swap. Used by the operator-edit flow when
    a device-pack JS file changes on disk.
    """
    type: Literal["mapping_reload"]
    msg_id: str
    schema_version: int
    controller_key: str
    descriptor: "MappingDescriptorPayload"


class MidiSendRequest(TypedDict):
    """Send a MIDI message OUT through a connected controller.

    Used for LED feedback, controller-side preset switching, etc.

    ``format`` (T2459-H5 Slice 13) selects the wire interpretation of
    ``bytes``:
    - ``""`` / ``"midi1"`` — MIDI 1.0 byte stream (1..3 byte short
      message or a full SysEx). Default; older clients omit the field
      entirely and remain compatible.
    - ``"ump"`` — raw MIDI 2.0 UMP packet (4, 8, 12, or 16 bytes,
      i.e. 1..4 32-bit words).
    """
    type: Literal["midi_send_request"]
    msg_id: str
    schema_version: int
    controller_key: str
    bytes: list[int]   # 1-3 byte MIDI message, full SysEx, or 4-16 byte UMP packet
    format: NotRequired[str]


class Shutdown(TypedDict):
    """Graceful shutdown. Host flushes pending output and exits 0."""
    type: Literal["shutdown"]
    msg_id: str
    schema_version: int


# T2459-H1 — port enumeration over IPC. The Python midi_host_client
# wraps this so the FastAPI backend can list MIDI ports identically to
# the old python-rtmidi enumeration without depending on python-rtmidi
# at runtime.
class MidiListPortsRequest(TypedDict):
    """Ask the host to enumerate currently-visible MIDI ports."""
    type: Literal["midi_list_ports_request"]
    msg_id: str
    schema_version: int


# T2459-H3 Slice 5 — open a hardware input port and bind it to a
# controller_key. The host opens the port via libremidi's
# observer-resolved port handle and routes inbound events through the
# loaded mapping descriptor for that controller_key.
class MidiOpenInputRequest(TypedDict):
    """Open a hardware MIDI input port and bind it to a controller_key."""
    type: Literal["midi_open_input_request"]
    msg_id: str
    schema_version: int
    controller_key: str
    port_id: str


# T2482-P1.2 Gap C completion / Maschine virtual-port unblock (iter 75)
# — ask the host to publish a virtual MIDI output port.
#
# The Maschine MK1 daemon used rtmidi.MidiOut().open_virtual_port(name)
# to publish the `MAP2:Maschine-MK1` ALSA-seq port that downstream
# apps connect to. The iter-55 deferral note documented that this
# couldn't move to the controller-host until an IPC envelope existed
# to ask the host to call its (existing C++-internal)
# LibremidiAdapter::openVirtualOutput. This envelope is that path.
#
# Once the host opens the virtual output, JS-callback-emitted MIDI
# (from drainShortMidi / drainSysExMidi) lands on the virtual port
# directly via the iter-72/73 sendToVirtualOutput wiring instead of
# round-tripping through Python.
class MidiCreateVirtualPortRequest(TypedDict):
    """Ask the host to publish a virtual MIDI output port with the
    given display name. The host calls
    LibremidiAdapter::openVirtualOutput(name) and the resulting port
    becomes visible to other ALSA-seq / JACK MIDI clients.

    Returns a log_event with level=info on success or level=error
    when the host fails to open the port (typically because libremidi
    rejects it or the host wasn't built with MAP2_HAS_LIBREMIDI).
    """
    type: Literal["midi_create_virtual_port_request"]
    msg_id: str
    schema_version: int
    name: str           # display name as it appears to ALSA-seq / JACK MIDI clients


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
    # T2511-4 — optional sample-accurate apply offset. When present, the
    # engine queues the command on its TriggerQueue and applies it at this
    # absolute audio-sample index (against the engine's monotonic sample
    # clock) instead of at the next buffer boundary. Used by punch-in /
    # source-switch triggers; absent for ordinary (apply-now) commands.
    apply_at_sample: NotRequired[int]


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


# T2482-P1.2 Gap F.1 (iter 62) — operator-facing diagnostic feedback.
class EventFeedback(TypedDict):
    """Host → backend diagnostic ping for an in-flight controller event.

    Sent on demand for soak / debug builds. Distinguishes from
    LogEvent + ScriptError by carrying lifecycle metadata: how many
    callbacks fired for this event, how many engine.setValue
    invocations the JS made, whether outbound MIDI was emitted, etc.
    The backend GUI surfaces these as inline event-trace rows in the
    Mapping Editor.

    ``stage`` is one of:
    - "received"  — the host saw the inbound MIDI/HID/bulk event
    - "matched"   — a control row matched (status/midino/channel triple)
    - "dispatched" — the JS callback returned (success or exception)
    - "drained"   — outbound MIDI was sent (or no outbound was queued)
    """
    type: Literal["event_feedback"]
    msg_id: str
    schema_version: int
    controller_key: str
    stage: Literal["received", "matched", "dispatched", "drained"]
    timestamp_ns: int
    detail: NotRequired[str]
    inbound_bytes: NotRequired[list[int]]
    callback_name: NotRequired[str]
    engine_command_count: NotRequired[int]
    outbound_short_count: NotRequired[int]
    outbound_sysex_count: NotRequired[int]


# ---------------------------------------------------------------------------
# Shared payload types
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# T2459-H4 slice 13 — Maschine MK1 transport messages.
# ---------------------------------------------------------------------------
#
# The host-client transport facade (slice 11) talks to the
# controller-host through these three message types. Slice 14 lands
# the engine-side HID parser that emits maschine_hid_event; slice 15
# lands the bulk-display sink that consumes maschine_bulk_frame.
# Slice 12's daemon flag-aware factory already routes through these
# envelopes once MAP2_MASCHINE_HOST_CLIENT_TRANSPORT=1 is set.


class MaschineHidEvent(TypedDict):
    """Inbound (host → daemon) decoded HID input from the Maschine MK1.

    The host owns the USB device and runs the HID parser (slice 14).
    The daemon receives one of these per pad / button / encoder change.
    ``kind`` discriminates which queue the daemon's ``read_pads`` /
    ``read_buttons_encoders`` consumer drains from. ``bytes`` is the
    decoded HID payload — same byte shape as ``mk1_protocol.py`` parses
    today.
    """
    type: Literal["maschine_hid_event"]
    msg_id: str
    schema_version: int
    controller_key: str       # always "maschine-mk1"
    timestamp_ns: int
    kind: str                 # "pad" | "button" | "encoder"
    bytes: list[int]          # raw decoded HID payload


class MaschineBulkFrame(TypedDict):
    """Outbound (daemon → host) bulk frame for the Maschine MK1.

    ``kind="led"`` carries the LED primer + grid frame the daemon
    composes from the choreography state machine.
    ``kind="display"`` carries the 256×64 framebuffer rendered by the
    daemon's render loop. The host (slice 15) writes the bytes to the
    appropriate USB endpoint.
    """
    type: Literal["maschine_bulk_frame"]
    msg_id: str
    schema_version: int
    controller_key: str       # always "maschine-mk1"
    kind: str                 # "led" | "display"
    bytes: list[int]          # raw bytes the host writes to the EP


class MaschineInitRequest(TypedDict):
    """Outbound (daemon → host) boot-time init request.

    Mirrors ``MaschineMK1UsbTransport.initialize_device`` — sends the
    interface alt-setting + LED primer packets that the device needs
    before it streams pad/button input. The host responds with a
    ``log_event`` of level ``info`` on success or ``error`` on
    failure.
    """
    type: Literal["maschine_init"]
    msg_id: str
    schema_version: int
    controller_key: str       # always "maschine-mk1"


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


# T2459-H1 — MIDI port descriptor + list-ports response. The Python
# midi_host_client lifts this into MidiPortInfo for parity with
# python-rtmidi's `(name, is_input, is_virtual)` shape.
class MidiPortPayload(TypedDict):
    name: str
    id: str
    is_input: bool
    is_virtual: bool


class MidiListPortsResponse(TypedDict):
    """Response to MidiListPortsRequest."""
    type: Literal["midi_list_ports_response"]
    msg_id: str
    schema_version: int
    backend: str   # "jack_midi" | "pipewire" | "alsa_seq" | "alsa_raw" | "none"
    ports: list[MidiPortPayload]
    degraded: bool   # true when backend != jack_midi (locked Q2 fallback)


# ---------------------------------------------------------------------------
# Field manifest — used by the schema-sync test to compare against the C++
# struct definitions in juce-engine/Source/ControllerHost/IpcMessages.h.
# ---------------------------------------------------------------------------

FIELD_MANIFEST: dict[str, list[str]] = {
    "ScriptLoadRequest": list(ScriptLoadRequest.__annotations__.keys()),
    "MappingActivate":   list(MappingActivate.__annotations__.keys()),
    "MappingDeactivate": list(MappingDeactivate.__annotations__.keys()),
    "MappingReload":     list(MappingReload.__annotations__.keys()),
    "MidiSendRequest":   list(MidiSendRequest.__annotations__.keys()),
    "Shutdown":          list(Shutdown.__annotations__.keys()),
    "MidiListPortsRequest":  list(MidiListPortsRequest.__annotations__.keys()),
    "MidiListPortsResponse": list(MidiListPortsResponse.__annotations__.keys()),
    "MidiPortPayload":        list(MidiPortPayload.__annotations__.keys()),
    "MidiOpenInputRequest":   list(MidiOpenInputRequest.__annotations__.keys()),
    "MidiCreateVirtualPortRequest": list(MidiCreateVirtualPortRequest.__annotations__.keys()),
    "EngineCommand":     list(EngineCommand.__annotations__.keys()),
    "ControllerEvent":   list(ControllerEvent.__annotations__.keys()),
    "LogEvent":          list(LogEvent.__annotations__.keys()),
    "ScriptError":       list(ScriptError.__annotations__.keys()),
    "EventFeedback":     list(EventFeedback.__annotations__.keys()),
    "MaschineHidEvent":   list(MaschineHidEvent.__annotations__.keys()),
    "MaschineBulkFrame":  list(MaschineBulkFrame.__annotations__.keys()),
    "MaschineInitRequest": list(MaschineInitRequest.__annotations__.keys()),
    "MappingControlPayload":    list(MappingControlPayload.__annotations__.keys()),
    "MappingDescriptorPayload": list(MappingDescriptorPayload.__annotations__.keys()),
}


# Type aliases for the dispatcher.
InboundMessage = (
    ScriptLoadRequest
    | MappingActivate
    | MappingDeactivate
    | MappingReload
    | MidiSendRequest
    | Shutdown
    | MidiListPortsRequest
    | MidiOpenInputRequest
    | MidiCreateVirtualPortRequest
    # T2459-H4 slice 13 — Maschine MK1 daemon → host envelopes.
    | MaschineBulkFrame
    | MaschineInitRequest
)
OutboundMessage = (
    EngineCommand
    | ControllerEvent
    | LogEvent
    | ScriptError
    | EventFeedback
    | MidiListPortsResponse
    # T2459-H4 slice 13 — Maschine MK1 host → daemon envelopes.
    | MaschineHidEvent
)


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
