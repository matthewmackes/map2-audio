// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// IpcMessages.h — wire-level message types shared between map2-backend
// (Python) and map2-controller-host (C++/QuickJS).
//
// **Hard contract:** every field listed here must match the matching
// TypedDict in app/schemas/controller_host.py exactly. CI test
// tests/test_controller_host_ipc_schema.py compares the FIELD_MANIFEST
// in the Python module against the cpp_field_manifest() table at the
// bottom of this file and fails the build if they diverge.
//
// Worklist: T2459-A5
// Architecture: docs/architecture/CONTROLLER_LAYER.md §5

#pragma once

#include <array>
#include <cstdint>
#include <map>
#include <optional>
#include <string>
#include <vector>

namespace map2::ipc::controller_host
{

// T2482-P1.2 Gap F.2 (iter 63): bumped 1 → 2 to mirror the Python
// SCHEMA_VERSION bump in iter 62. The new envelopes
// (MappingDeactivate / MappingReload / EventFeedback) are additive;
// older clients ignore them.
inline constexpr int kSchemaVersion = 2;

// ---------------------------------------------------------------------------
// Inbound: backend → controller-host
// ---------------------------------------------------------------------------

struct ScriptLoadRequest
{
    static constexpr const char* kType = "script_load_request";
    std::string msg_id;
    int schema_version = kSchemaVersion;
    std::string controller_key;
    std::string pack_id;
    std::string model;
    std::string script_path;
    std::string script_body;
};

struct MappingControlPayload
{
    std::optional<int> status;
    std::optional<int> midino;
    std::optional<int> channel;
    std::optional<std::string> target;
    std::optional<std::string> action;
    std::optional<std::string> script;
    bool fast_path = false;
    std::string description;
};

struct MappingDescriptorPayload
{
    std::string pack_id;
    std::string model;
    std::string kind;                                // "midi" | "hid"
    std::vector<std::string> scripts;
    std::vector<MappingControlPayload> controls;
    std::vector<MappingControlPayload> outputs;
    std::vector<std::map<std::string, std::string>> settings;
    std::map<std::string, std::string> mixxx_alias_table;
};

struct MappingActivate
{
    static constexpr const char* kType = "mapping_activate";
    std::string msg_id;
    int schema_version = kSchemaVersion;
    std::string controller_key;
    MappingDescriptorPayload descriptor;
};

// T2482-P1.2 Gap F.1+F.2 (iters 62-63) — operator-facing lifecycle.
struct MappingDeactivate
{
    static constexpr const char* kType = "mapping_deactivate";
    std::string msg_id;
    int schema_version = kSchemaVersion;
    std::string controller_key;
};

struct MappingReload
{
    static constexpr const char* kType = "mapping_reload";
    std::string msg_id;
    int schema_version = kSchemaVersion;
    std::string controller_key;
    MappingDescriptorPayload descriptor;
};

struct MidiSendRequest
{
    static constexpr const char* kType = "midi_send_request";
    std::string msg_id;
    int schema_version = kSchemaVersion;
    std::string controller_key;
    std::vector<std::uint8_t> bytes;
    // T2459-H5 Slice 13 — wire format discriminator. "midi1" (default,
    // omitted-on-wire for back-compat) or "ump". When "ump", `bytes`
    // carries a raw MIDI 2.0 UMP packet (4..16 bytes). The host's
    // outbound surface sends MIDI 1.0 byte streams to byte-stream
    // backends and UMP packets to UMP-capable backends.
    std::string format;   // "" / "midi1" / "ump"
};

struct Shutdown
{
    static constexpr const char* kType = "shutdown";
    std::string msg_id;
    int schema_version = kSchemaVersion;
};

// T2459-H1 — port enumeration over IPC.
struct MidiListPortsRequest
{
    static constexpr const char* kType = "midi_list_ports_request";
    std::string msg_id;
    int schema_version = kSchemaVersion;
};

struct MidiPortPayload
{
    std::string name;
    std::string id;
    bool is_input  = false;
    bool is_virtual = false;
};

struct MidiListPortsResponse
{
    static constexpr const char* kType = "midi_list_ports_response";
    std::string msg_id;
    int schema_version = kSchemaVersion;
    std::string backend;            // "jack_midi" | "pipewire" | ...
    std::vector<MidiPortPayload> ports;
    bool degraded = false;
};

// T2459-H3 Slice 5 — open a hardware input port and bind it to a
// controller_key for live event ingestion.
struct MidiOpenInputRequest
{
    static constexpr const char* kType = "midi_open_input_request";
    std::string msg_id;
    int schema_version = kSchemaVersion;
    std::string controller_key;
    std::string port_id;            // name/id from MidiListPortsResponse.ports
};

// T2482-P1.2 Gap C completion / iter 75 — publish a virtual MIDI
// output port. Mirrors Python MidiCreateVirtualPortRequest.
struct MidiCreateVirtualPortRequest
{
    static constexpr const char* kType = "midi_create_virtual_port_request";
    std::string msg_id;
    int schema_version = kSchemaVersion;
    std::string name;
};

// ---------------------------------------------------------------------------
// Outbound: controller-host → backend
// ---------------------------------------------------------------------------

struct EngineCommand
{
    static constexpr const char* kType = "engine_command";
    std::string msg_id;
    int schema_version = kSchemaVersion;
    std::string controller_key;
    std::string target;
    std::string action;
    std::optional<double> value;
    std::vector<std::string> args;     // serialized — JSON values become strings
};

struct ControllerEvent
{
    static constexpr const char* kType = "controller_event";
    std::string msg_id;
    int schema_version = kSchemaVersion;
    std::string controller_key;
    std::int64_t timestamp_ns = 0;
    std::vector<std::uint8_t> bytes;
};

struct LogEvent
{
    static constexpr const char* kType = "log_event";
    std::string msg_id;
    int schema_version = kSchemaVersion;
    std::optional<std::string> controller_key;
    std::string level;                 // "debug" | "info" | "warning" | "error"
    std::string message;
};

struct ScriptError
{
    static constexpr const char* kType = "script_error";
    std::string msg_id;
    int schema_version = kSchemaVersion;
    std::string controller_key;
    std::optional<std::string> file;
    std::optional<int> line;
    std::optional<int> column;
    std::string message;
    std::optional<std::string> stack;
};

// T2482-P1.2 Gap F.1+F.2 (iters 62-63) — operator-facing diagnostic
// feedback for in-flight controller events. Surfaces in the Mapping
// Editor as inline event-trace rows.
struct EventFeedback
{
    static constexpr const char* kType = "event_feedback";
    std::string msg_id;
    int schema_version = kSchemaVersion;
    std::string controller_key;
    std::string stage;                 // "received" | "matched" | "dispatched" | "drained"
    std::int64_t timestamp_ns = 0;
    std::optional<std::string> detail;
    std::vector<std::uint8_t> inbound_bytes;
    std::optional<std::string> callback_name;
    std::optional<int> engine_command_count;
    std::optional<int> outbound_short_count;
    std::optional<int> outbound_sysex_count;
};

// ---------------------------------------------------------------------------
// T2459-H4 slice 13 — Maschine MK1 transport messages.
// ---------------------------------------------------------------------------
//
// The host-client transport facade (slice 11) talks to the
// controller-host through these three message types. Slice 14 lands
// the engine-side HID parser that emits maschine_hid_event records;
// slice 15 lands the bulk-display sink that consumes
// maschine_bulk_frame writes. Slice 12's daemon flag-aware factory
// already routes through these envelopes once
// MAP2_MASCHINE_HOST_CLIENT_TRANSPORT=1 is set on the daemon.
//
// All three messages carry controller_key="maschine-mk1" so they can
// share a UDS connection with the existing MIDI traffic.

// Inbound (host → daemon): a decoded HID input event from the device.
struct MaschineHidEvent
{
    static constexpr const char* kType = "maschine_hid_event";
    std::string msg_id;
    int schema_version = kSchemaVersion;
    std::string controller_key;        // always "maschine-mk1"
    std::int64_t timestamp_ns = 0;
    std::string kind;                  // "pad" | "button" | "encoder"
    std::vector<std::uint8_t> bytes;   // raw decoded HID payload (matches mk1_protocol.py shape)
};

// Outbound (daemon → host): a bulk frame for the device.
// kind="led" → led primer + grid frame
// kind="display" → 256x64 framebuffer
struct MaschineBulkFrame
{
    static constexpr const char* kType = "maschine_bulk_frame";
    std::string msg_id;
    int schema_version = kSchemaVersion;
    std::string controller_key;        // always "maschine-mk1"
    std::string kind;                  // "led" | "display"
    std::vector<std::uint8_t> bytes;   // raw bytes the host writes to the EP
};

// Outbound (daemon → host): the boot-time init packet sequence.
struct MaschineInitRequest
{
    static constexpr const char* kType = "maschine_init";
    std::string msg_id;
    int schema_version = kSchemaVersion;
    std::string controller_key;        // always "maschine-mk1"
};

// ---------------------------------------------------------------------------
// Field manifest — must match app/schemas/controller_host.py FIELD_MANIFEST.
// CI test tests/test_controller_host_ipc_schema.py reads this header
// textually + compares against the Python TypedDict annotations.
// ---------------------------------------------------------------------------
//
// CPP_FIELD_MANIFEST_BEGIN
// ScriptLoadRequest: type, msg_id, schema_version, controller_key, pack_id, model, script_path, script_body
// MappingActivate: type, msg_id, schema_version, controller_key, descriptor
// MappingDeactivate: type, msg_id, schema_version, controller_key
// MappingReload: type, msg_id, schema_version, controller_key, descriptor
// MidiSendRequest: type, msg_id, schema_version, controller_key, bytes, format
// Shutdown: type, msg_id, schema_version
// MidiListPortsRequest: type, msg_id, schema_version
// MidiListPortsResponse: type, msg_id, schema_version, backend, ports, degraded
// MidiPortPayload: name, id, is_input, is_virtual
// MidiOpenInputRequest: type, msg_id, schema_version, controller_key, port_id
// MidiCreateVirtualPortRequest: type, msg_id, schema_version, name
// EngineCommand: type, msg_id, schema_version, controller_key, target, action, value, args
// ControllerEvent: type, msg_id, schema_version, controller_key, timestamp_ns, bytes
// LogEvent: type, msg_id, schema_version, controller_key, level, message
// ScriptError: type, msg_id, schema_version, controller_key, file, line, column, message, stack
// EventFeedback: type, msg_id, schema_version, controller_key, stage, timestamp_ns, detail, inbound_bytes, callback_name, engine_command_count, outbound_short_count, outbound_sysex_count
// MaschineHidEvent: type, msg_id, schema_version, controller_key, timestamp_ns, kind, bytes
// MaschineBulkFrame: type, msg_id, schema_version, controller_key, kind, bytes
// MaschineInitRequest: type, msg_id, schema_version, controller_key
// MappingControlPayload: status, midino, channel, target, action, script, fast_path, description
// MappingDescriptorPayload: pack_id, model, kind, scripts, controls, outputs, settings, mixxx_alias_table
// CPP_FIELD_MANIFEST_END

} // namespace map2::ipc::controller_host
