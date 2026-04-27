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

inline constexpr int kSchemaVersion = 1;

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

struct MidiSendRequest
{
    static constexpr const char* kType = "midi_send_request";
    std::string msg_id;
    int schema_version = kSchemaVersion;
    std::string controller_key;
    std::vector<std::uint8_t> bytes;
};

struct Shutdown
{
    static constexpr const char* kType = "shutdown";
    std::string msg_id;
    int schema_version = kSchemaVersion;
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

// ---------------------------------------------------------------------------
// Field manifest — must match app/schemas/controller_host.py FIELD_MANIFEST.
// CI test tests/test_controller_host_ipc_schema.py reads this header
// textually + compares against the Python TypedDict annotations.
// ---------------------------------------------------------------------------
//
// CPP_FIELD_MANIFEST_BEGIN
// ScriptLoadRequest: type, msg_id, schema_version, controller_key, pack_id, model, script_path, script_body
// MappingActivate: type, msg_id, schema_version, controller_key, descriptor
// MidiSendRequest: type, msg_id, schema_version, controller_key, bytes
// Shutdown: type, msg_id, schema_version
// EngineCommand: type, msg_id, schema_version, controller_key, target, action, value, args
// ControllerEvent: type, msg_id, schema_version, controller_key, timestamp_ns, bytes
// LogEvent: type, msg_id, schema_version, controller_key, level, message
// ScriptError: type, msg_id, schema_version, controller_key, file, line, column, message, stack
// MappingControlPayload: status, midino, channel, target, action, script, fast_path, description
// MappingDescriptorPayload: pack_id, model, kind, scripts, controls, outputs, settings, mixxx_alias_table
// CPP_FIELD_MANIFEST_END

} // namespace map2::ipc::controller_host
