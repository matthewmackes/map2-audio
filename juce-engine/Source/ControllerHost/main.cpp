// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// map2-controller-host — separate-process runtime for mapping JavaScript.
//
// Listens on a Unix-domain socket (`--socket /run/map2/controller-host.sock`
// by default), accepts a single backend connection, and exchanges
// length-prefixed JSON frames per app/schemas/controller_host.py.
//
// Worklist: T2459-B2

#include "EventRing/ShmEventRing.h"
#include "MappingEngine/Map2MappingEngine.h"
#include "Midi/LibremidiAdapter.h"
#include "Midi/Map2MidiBackend.h"

#include <algorithm>
#include <atomic>
#include <cerrno>
#include <csignal>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <optional>
#include <poll.h>
#include <regex>
#include <sstream>
#include <string>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/un.h>
#include <unordered_map>
#include <unistd.h>
#include <vector>

namespace
{

std::atomic<bool> g_shutdownRequested { false };

void signal_handler (int /*sig*/)
{
    g_shutdownRequested.store (true, std::memory_order_release);
}

void install_signal_handlers()
{
    std::signal (SIGINT, signal_handler);
    std::signal (SIGTERM, signal_handler);
}

// T2459-H1 — naive JSON string field extractor. Looks up `"key":"value"`
// (string field) and returns the value substring, or empty when missing.
// This is a deliberately small surface — full JSON parsing lands with the
// proper request dispatcher in T2459-H2.
std::string extract_string_field (const std::string& frame, const std::string& key)
{
    const std::string needle = "\"" + key + "\":\"";
    auto pos = frame.find (needle);
    if (pos == std::string::npos) return {};
    pos += needle.size();
    std::string value;
    value.reserve (64);
    bool escape = false;
    for (std::size_t i = pos; i < frame.size(); ++i)
    {
        const char c = frame[i];
        if (escape)
        {
            switch (c)
            {
                case 'n': value.push_back ('\n'); break;
                case 'r': value.push_back ('\r'); break;
                case 't': value.push_back ('\t'); break;
                case '"': value.push_back ('"'); break;
                case '\\': value.push_back ('\\'); break;
                default: value.push_back (c); break;
            }
            escape = false;
            continue;
        }
        if (c == '\\')
        {
            escape = true;
            continue;
        }
        if (c == '"')
            return value;
        value.push_back (c);
    }
    return {};
}

// JSON-escape a string for embedding in our hand-rolled response.
std::string json_escape (const std::string& s)
{
    std::string out;
    out.reserve (s.size() + 2);
    for (char c : s)
    {
        switch (c)
        {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n";  break;
            case '\r': out += "\\r";  break;
            case '\t': out += "\\t";  break;
            default:
                if (static_cast<unsigned char> (c) < 0x20)
                {
                    char buf[8];
                    std::snprintf (buf, sizeof (buf), "\\u%04x", c & 0xFF);
                    out += buf;
                }
                else out += c;
        }
    }
    return out;
}

// T2459-H1 — build the midi_list_ports_response payload from a backend.
std::string build_list_ports_response (const std::string& msg_id,
                                        map2::controller_host::Map2MidiBackend& backend)
{
    using map2::controller_host::MidiBackend;
    const auto sel = backend.selectedBackend();
    const auto ports = backend.listPorts();
    const bool degraded = (sel != MidiBackend::JackMidi && sel != MidiBackend::None);

    std::ostringstream oss;
    oss << "{\"type\":\"midi_list_ports_response\","
        << "\"msg_id\":\"" << json_escape (msg_id) << "\","
        << "\"schema_version\":1,"
        << "\"backend\":\"" << map2::controller_host::Map2MidiBackend::backendName (sel) << "\","
        << "\"ports\":[";
    bool first = true;
    for (const auto& p : ports)
    {
        if (! first) oss << ",";
        first = false;
        oss << "{\"name\":\"" << json_escape (p.name) << "\","
            << "\"id\":\"" << json_escape (p.id) << "\","
            << "\"is_input\":" << (p.isInput ? "true" : "false") << ","
            << "\"is_virtual\":" << (p.isVirtual ? "true" : "false") << "}";
    }
    oss << "],\"degraded\":" << (degraded ? "true" : "false") << "}";
    return oss.str();
}

std::string build_log_event (const std::string& msg_id,
                             const std::string& level,
                             const std::string& message,
                             const std::optional<std::string>& controller_key = std::nullopt)
{
    std::ostringstream oss;
    oss << "{\"type\":\"log_event\","
        << "\"msg_id\":\"" << json_escape (msg_id) << "\","
        << "\"schema_version\":1,";
    if (controller_key.has_value())
        oss << "\"controller_key\":\"" << json_escape (*controller_key) << "\",";
    oss << "\"level\":\"" << json_escape (level) << "\","
        << "\"message\":\"" << json_escape (message) << "\"}";
    return oss.str();
}

std::string build_engine_command_frame (const map2::controller_host::PendingEngineCommand& cmd)
{
    std::ostringstream oss;
    oss << "{\"type\":\"engine_command\","
        << "\"msg_id\":\"\","
        << "\"schema_version\":1,"
        << "\"controller_key\":\"" << json_escape (cmd.controller_key) << "\","
        << "\"target\":\"" << json_escape (cmd.target) << "\","
        << "\"action\":\"" << json_escape (cmd.action) << "\"";
    if (cmd.value.has_value())
        oss << ",\"value\":" << *cmd.value;
    if (! cmd.args.empty())
    {
        oss << ",\"args\":[";
        for (std::size_t i = 0; i < cmd.args.size(); ++i)
        {
            if (i > 0) oss << ",";
            oss << "\"" << json_escape (cmd.args[i]) << "\"";
        }
        oss << "]";
    }
    oss << "}";
    return oss.str();
}

std::string build_log_event_from_pending (const map2::controller_host::PendingLogEvent& ev)
{
    std::ostringstream oss;
    oss << "{\"type\":\"log_event\","
        << "\"msg_id\":\"\","
        << "\"schema_version\":1,";
    if (! ev.controller_key.empty())
        oss << "\"controller_key\":\"" << json_escape (ev.controller_key) << "\",";
    oss << "\"level\":\"" << json_escape (ev.level) << "\","
        << "\"message\":\"" << json_escape (ev.message) << "\"}";
    return oss.str();
}

std::string build_midi_send_request_frame (const std::string& controller_key,
                                            const std::vector<std::uint8_t>& bytes)
{
    std::ostringstream oss;
    oss << "{\"type\":\"midi_send_request\","
        << "\"msg_id\":\"\","
        << "\"schema_version\":1,"
        << "\"controller_key\":\"" << json_escape (controller_key) << "\","
        << "\"bytes\":[";
    for (std::size_t i = 0; i < bytes.size(); ++i)
    {
        if (i > 0) oss << ",";
        oss << static_cast<int> (bytes[i]);
    }
    oss << "]}";
    return oss.str();
}

std::string build_script_error (const std::string& msg_id,
                                const std::string& controller_key,
                                const map2::controller_host::ScriptException& exc)
{
    std::ostringstream oss;
    oss << "{\"type\":\"script_error\","
        << "\"msg_id\":\"" << json_escape (msg_id) << "\","
        << "\"schema_version\":1,"
        << "\"controller_key\":\"" << json_escape (controller_key) << "\","
        << "\"file\":\"" << json_escape (exc.file) << "\","
        << "\"line\":" << exc.line << ","
        << "\"column\":" << exc.column << ","
        << "\"message\":\"" << json_escape (exc.message) << "\","
        << "\"stack\":\"" << json_escape (exc.stack) << "\"}";
    return oss.str();
}

std::optional<std::string> extract_json_region (const std::string& json,
                                                const std::string& key,
                                                char open_char,
                                                char close_char)
{
    const std::string needle = "\"" + key + "\":";
    auto pos = json.find (needle);
    if (pos == std::string::npos) return std::nullopt;
    pos = json.find (open_char, pos + needle.size());
    if (pos == std::string::npos) return std::nullopt;

    bool in_string = false;
    bool escape = false;
    int depth = 0;
    for (std::size_t i = pos; i < json.size(); ++i)
    {
        const char c = json[i];
        if (in_string)
        {
            if (escape) escape = false;
            else if (c == '\\') escape = true;
            else if (c == '"') in_string = false;
            continue;
        }
        if (c == '"')
        {
            in_string = true;
            continue;
        }
        if (c == open_char) ++depth;
        else if (c == close_char)
        {
            --depth;
            if (depth == 0)
                return json.substr (pos, i - pos + 1);
        }
    }
    return std::nullopt;
}

std::optional<std::string> extract_string_field_from_json (const std::string& json,
                                                           const std::string& key)
{
    const std::regex re ("\"" + key + "\":\"((?:\\\\.|[^\"])*)\"");
    std::smatch match;
    if (! std::regex_search (json, match, re)) return std::nullopt;
    return match[1].str();
}

std::optional<int> extract_int_field_from_json (const std::string& json, const std::string& key)
{
    const std::regex re ("\"" + key + "\":(-?[0-9]+)");
    std::smatch match;
    if (! std::regex_search (json, match, re)) return std::nullopt;
    try
    {
        return std::stoi (match[1].str());
    }
    catch (...) { return std::nullopt; }
}

bool extract_bool_field_from_json (const std::string& json,
                                   const std::string& key,
                                   bool fallback = false)
{
    const std::regex re ("\"" + key + "\":(true|false)");
    std::smatch match;
    if (! std::regex_search (json, match, re)) return fallback;
    return match[1].str() == "true";
}

std::vector<std::string> parse_string_array (const std::string& array_json)
{
    std::vector<std::string> out;
    const std::regex re ("\"((?:\\\\.|[^\"])*)\"");
    for (std::sregex_iterator it (array_json.begin(), array_json.end(), re), end; it != end; ++it)
        out.push_back ((*it)[1].str());
    return out;
}

std::vector<std::string> split_object_array (const std::string& array_json)
{
    std::vector<std::string> out;
    bool in_string = false;
    bool escape = false;
    int depth = 0;
    std::size_t object_start = std::string::npos;

    for (std::size_t i = 0; i < array_json.size(); ++i)
    {
        const char c = array_json[i];
        if (in_string)
        {
            if (escape) escape = false;
            else if (c == '\\') escape = true;
            else if (c == '"') in_string = false;
            continue;
        }
        if (c == '"')
        {
            in_string = true;
            continue;
        }
        if (c == '{')
        {
            if (depth == 0) object_start = i;
            ++depth;
        }
        else if (c == '}')
        {
            --depth;
            if (depth == 0 && object_start != std::string::npos)
            {
                out.push_back (array_json.substr (object_start, i - object_start + 1));
                object_start = std::string::npos;
            }
        }
    }
    return out;
}

std::unordered_map<std::string, std::string> parse_alias_table (const std::string& object_json)
{
    std::unordered_map<std::string, std::string> out;
    const std::regex re ("\"((?:\\\\.|[^\"])*)\":\"((?:\\\\.|[^\"])*)\"");
    for (std::sregex_iterator it (object_json.begin(), object_json.end(), re), end; it != end; ++it)
        out.emplace ((*it)[1].str(), (*it)[2].str());
    return out;
}

std::optional<std::string> read_text_file (const std::filesystem::path& path)
{
    if (! std::filesystem::exists (path)) return std::nullopt;
    std::ifstream in (path, std::ios::binary);
    if (! in.good()) return std::nullopt;
    std::ostringstream buf;
    buf << in.rdbuf();
    return buf.str();
}

std::optional<std::string> resolve_script_body (const std::string& ref,
                                                const std::string& pack_id,
                                                const std::unordered_map<std::string, std::string>& script_cache)
{
    if (const auto it = script_cache.find (ref); it != script_cache.end())
        return it->second;

    const std::filesystem::path ref_path (ref);
    if (ref_path.is_absolute())
        return read_text_file (ref_path);

    const auto cwd = std::filesystem::current_path();
    for (auto base = cwd; ! base.empty(); base = base.parent_path())
    {
        if (const auto body = read_text_file (base / ref_path); body.has_value())
            return body;
        if (! pack_id.empty())
        {
            if (const auto body = read_text_file (base / "device-packs" / pack_id / ref_path); body.has_value())
                return body;
        }
        if (base == base.root_path()) break;
    }
    return std::nullopt;
}

bool parse_mapping_activate_frame (const std::string& frame,
                                   map2::controller_host::MappingDescriptorSpec& descriptor_out,
                                   std::string& controller_key_out)
{
    controller_key_out = extract_string_field (frame, "controller_key");
    if (controller_key_out.empty()) return false;
    const auto descriptor_json = extract_json_region (frame, "descriptor", '{', '}');
    if (! descriptor_json.has_value()) return false;

    descriptor_out.pack_id = extract_string_field_from_json (*descriptor_json, "pack_id").value_or ("");
    descriptor_out.model = extract_string_field_from_json (*descriptor_json, "model").value_or ("");
    descriptor_out.kind = extract_string_field_from_json (*descriptor_json, "kind").value_or ("midi");

    if (const auto scripts = extract_json_region (*descriptor_json, "scripts", '[', ']'); scripts.has_value())
        descriptor_out.scripts = parse_string_array (*scripts);

    if (const auto controls = extract_json_region (*descriptor_json, "controls", '[', ']'); controls.has_value())
    {
        for (const auto& control_json : split_object_array (*controls))
        {
            map2::controller_host::MappingControlSpec control;
            if (const auto value = extract_int_field_from_json (control_json, "status"); value.has_value())
                control.status = *value;
            if (const auto value = extract_int_field_from_json (control_json, "midino"); value.has_value())
                control.midino = *value;
            if (const auto value = extract_int_field_from_json (control_json, "channel"); value.has_value())
                control.channel = *value;
            if (const auto value = extract_string_field_from_json (control_json, "target"); value.has_value())
                control.target = *value;
            if (const auto value = extract_string_field_from_json (control_json, "action"); value.has_value())
                control.action = *value;
            if (const auto value = extract_string_field_from_json (control_json, "script"); value.has_value())
                control.script = *value;
            control.fast_path = extract_bool_field_from_json (control_json, "fast_path", false);
            control.description = extract_string_field_from_json (control_json, "description").value_or ("");
            descriptor_out.controls.push_back (std::move (control));
        }
    }

    if (const auto outputs = extract_json_region (*descriptor_json, "outputs", '[', ']'); outputs.has_value())
    {
        for (const auto& output_json : split_object_array (*outputs))
        {
            map2::controller_host::MappingControlSpec output;
            if (const auto value = extract_int_field_from_json (output_json, "status"); value.has_value())
                output.status = *value;
            if (const auto value = extract_int_field_from_json (output_json, "midino"); value.has_value())
                output.midino = *value;
            if (const auto value = extract_int_field_from_json (output_json, "channel"); value.has_value())
                output.channel = *value;
            if (const auto value = extract_string_field_from_json (output_json, "target"); value.has_value())
                output.target = *value;
            if (const auto value = extract_string_field_from_json (output_json, "action"); value.has_value())
                output.action = *value;
            if (const auto value = extract_string_field_from_json (output_json, "script"); value.has_value())
                output.script = *value;
            output.fast_path = extract_bool_field_from_json (output_json, "fast_path", false);
            output.description = extract_string_field_from_json (output_json, "description").value_or ("");
            descriptor_out.outputs.push_back (std::move (output));
        }
    }

    if (const auto aliases = extract_json_region (*descriptor_json, "mixxx_alias_table", '{', '}'); aliases.has_value())
        descriptor_out.mixxx_alias_table = parse_alias_table (*aliases);

    return true;
}

bool descriptor_uses_script_callbacks (const map2::controller_host::MappingDescriptorSpec& descriptor)
{
    const auto has_script = [] (const map2::controller_host::MappingControlSpec& spec)
    {
        return spec.script.has_value() && ! spec.script->empty();
    };
    return std::any_of (descriptor.controls.begin(), descriptor.controls.end(), has_script)
        || std::any_of (descriptor.outputs.begin(), descriptor.outputs.end(), has_script);
}

bool send_frame (int fd, const std::string& payload)
{
    const std::uint32_t length = static_cast<std::uint32_t> (payload.size());
    std::uint8_t header[4] = {
        static_cast<std::uint8_t> ((length >> 24) & 0xFF),
        static_cast<std::uint8_t> ((length >> 16) & 0xFF),
        static_cast<std::uint8_t> ((length >> 8) & 0xFF),
        static_cast<std::uint8_t> (length & 0xFF),
    };
    if (::send (fd, header, 4, MSG_NOSIGNAL) != 4)
        return false;
    if (length > 0
        && ::send (fd, payload.data(), payload.size(), MSG_NOSIGNAL)
            != static_cast<ssize_t> (payload.size()))
        return false;
    return true;
}

bool recv_frame (int fd, std::string& out)
{
    std::uint8_t header[4];
    ssize_t n = ::recv (fd, header, 4, MSG_WAITALL);
    if (n != 4)
        return false;
    const std::uint32_t length = (static_cast<std::uint32_t> (header[0]) << 24)
                                | (static_cast<std::uint32_t> (header[1]) << 16)
                                | (static_cast<std::uint32_t> (header[2]) << 8)
                                |  static_cast<std::uint32_t> (header[3]);
    out.resize (length);
    if (length > 0)
    {
        n = ::recv (fd, out.data(), length, MSG_WAITALL);
        if (n != static_cast<ssize_t> (length))
            return false;
    }
    return true;
}

// T2459-H11 — broadcast an outbound frame to every connected backend client.
// Each subscriber (EngineCommandBridge, future SnapshotBridge, etc.) gets the
// same event stream and filters client-side via its registered
// MidiEventSubscription callbacks. Clients that fail send() are appended to
// `dead_clients_out` so the caller can prune them after the broadcast loop —
// we must not mutate the client set while iterating it.
inline void broadcast_frame (const std::vector<int>& clients,
                             const std::string& payload,
                             std::vector<int>& dead_clients_out)
{
    for (int fd : clients)
    {
        if (! send_frame (fd, payload))
            dead_clients_out.push_back (fd);
    }
}

// T2459-H3 Slice 5/6 + T2459-H11 — drain a shm ring up to maxEvents per call,
// dispatch each event through the loaded mapping descriptor matching the
// slot's per-port controllerIndex, and emit any resulting engine commands /
// logs / outbound MIDI as IPC frames BROADCAST to every connected backend.
// Slot index 0 (or any out-of-range index) falls back to
// `fallback_controller_key` (preserves Slice 5 most-recently-opened-
// controller behavior for any path that pushes without an index).
//
// Pre-H11 this took a single client_fd; now it fans out to all connected
// clients so each persistent subscriber (engine_command, log_event, …) gets
// the events its callbacks need. Dead clients are appended to
// `dead_clients_out` for the caller to prune.
//
// Always returns void — historical "returns false to indicate disconnect"
// semantics no longer apply with the broadcast model; per-client failures
// are surfaced through `dead_clients_out` instead.
void drain_ring_and_dispatch (const std::vector<int>& clients,
                              map2::controller_host::ShmEventRing& ring,
                              map2::controller_host::Map2MappingEngine& mapping_engine,
                              const std::vector<std::string>& controller_keys_by_index,
                              const std::string& fallback_controller_key,
                              std::size_t maxEvents,
                              map2::controller_host::LibremidiAdapter* outbound_adapter,
                              std::vector<int>& dead_clients_out)
{
    if (! ring.isOpen()) return;

    std::uint8_t buf[map2::controller_host::kMaxPayloadBytes];
    std::uint64_t ts = 0;
    std::uint16_t slot_index = 0;

    for (std::size_t i = 0; i < maxEvents; ++i)
    {
        const std::size_t n = ring.pop (&ts, buf, sizeof (buf), &slot_index);
        if (n == 0) break;
        if (n < 1) continue;

        // Resolve the per-event controller_key. Index 0 = unknown/legacy →
        // fall back to the most-recently-opened controller (Slice-5 behavior
        // preserved). Any non-zero index that is in range routes through the
        // matching loaded descriptor.
        std::string controller_key;
        if (slot_index != 0
            && slot_index <= controller_keys_by_index.size()
            && ! controller_keys_by_index[slot_index - 1].empty())
        {
            controller_key = controller_keys_by_index[slot_index - 1];
        }
        else
        {
            controller_key = fallback_controller_key;
        }
        if (controller_key.empty()) continue;

        const std::uint8_t status   = buf[0];
        const std::uint8_t data1    = (n > 1) ? buf[1] : 0u;
        const std::uint8_t channel  = static_cast<std::uint8_t> (status & 0x0Fu);
        const std::uint8_t statusHi = static_cast<std::uint8_t> (status & 0xF0u);

        // Mixxx-style descriptors store (status, midino, channel) where
        // status is the high nibble (e.g. 0xB0) and channel is split out
        // separately. Try the high-nibble+channel match first; if that
        // misses, fall back to the raw status byte for descriptors that
        // didn't split the channel out.
        auto plan = mapping_engine.planDispatch (controller_key, statusHi, data1, channel);
        if (! plan.matched)
            plan = mapping_engine.planDispatch (controller_key, status, data1, channel);
        if (! plan.matched)
            continue;
        if (plan.callback_name.empty())
            continue;

        std::vector<std::uint8_t> bytes (buf, buf + n);
        if (auto exc = mapping_engine.dispatch (controller_key, plan.callback_name, bytes);
            exc.has_value())
        {
            broadcast_frame (clients,
                             build_script_error ("", controller_key, *exc),
                             dead_clients_out);
        }
    }

    // Drain JS-side outbound queues regardless of how many events fired —
    // JS callbacks during dispatch may have queued engine commands / logs
    // / MIDI sends that must reach the backend. Broadcast each frame to
    // every connected subscriber.
    for (auto& cmd : mapping_engine.js().drainEngineCommands())
        broadcast_frame (clients, build_engine_command_frame (cmd), dead_clients_out);
    for (auto& ev : mapping_engine.js().drainLogs())
        broadcast_frame (clients, build_log_event_from_pending (ev), dead_clients_out);

    // T2482-P1.2 Gap C (iter 73) — prefer libremidi-direct send to
    // the host's virtual output port over the legacy
    // midi_send_request → Python IPC round-trip. Falls back to the
    // IPC path (broadcast) when no adapter is supplied OR no virtual
    // output is open (transitional behaviour until per-hardware-output
    // port resolution lands in a future loop).
    for (auto& sm : mapping_engine.drainShortMidi())
    {
        const std::vector<std::uint8_t> bytes { sm.status, sm.data1, sm.data2 };
        bool sent_libremidi = false;
        if (outbound_adapter != nullptr)
        {
            sent_libremidi = outbound_adapter->sendToVirtualOutput (
                bytes.data(), bytes.size());
        }
        if (! sent_libremidi)
        {
            broadcast_frame (clients,
                             build_midi_send_request_frame (sm.controller_key, bytes),
                             dead_clients_out);
        }
    }
    for (auto& sx : mapping_engine.drainSysExMidi())
    {
        bool sent_libremidi = false;
        if (outbound_adapter != nullptr)
        {
            sent_libremidi = outbound_adapter->sendToVirtualOutput (
                sx.bytes.data(), sx.bytes.size());
        }
        if (! sent_libremidi)
        {
            broadcast_frame (clients,
                             build_midi_send_request_frame (sx.controller_key, sx.bytes),
                             dead_clients_out);
        }
    }
}

int run_main_loop (const std::string& socket_path)
{
    // Remove any leftover socket file from a prior crashed run.
    ::unlink (socket_path.c_str());

    // T2459-H11 — SOCK_NONBLOCK so the poll-fanout accept loop can
    // drain ALL pending accepts in one tick without blocking. The
    // listen socket is polled via POLLIN and we accept4() in a loop
    // until EAGAIN. Client fds inherit blocking semantics from
    // accept4() (we pass SOCK_CLOEXEC only); recv_frame's blocking
    // MSG_WAITALL is preserved for partial-frame handling — clients
    // shouldn't send a partial header and stall the daemon in
    // practice, but if it ever becomes a problem the path forward is
    // a per-fd partial-frame buffer, not a non-blocking flip on the
    // client fd (which would require re-architecting recv_frame).
    int listen_fd = ::socket (AF_UNIX, SOCK_STREAM | SOCK_NONBLOCK, 0);
    if (listen_fd < 0)
    {
        std::cerr << "[map2-controller-host] socket() failed: " << std::strerror (errno) << "\n";
        return 1;
    }

    sockaddr_un addr {};
    addr.sun_family = AF_UNIX;
    std::strncpy (addr.sun_path, socket_path.c_str(), sizeof (addr.sun_path) - 1);

    if (::bind (listen_fd, reinterpret_cast<sockaddr*> (&addr), sizeof (addr)) < 0)
    {
        std::cerr << "[map2-controller-host] bind(" << socket_path << ") failed: "
                  << std::strerror (errno) << "\n";
        ::close (listen_fd);
        return 1;
    }

    // T2459-H9 — bump the kernel accept queue from 1 to 16. With backlog=1,
    // any probe that piles up while the daemon is mid-serve (initialising
    // libremidi, building shm rings) was rejected with EAGAIN, presenting
    // as a "daemon unreachable" wedge to the backend. 16 gives ample
    // headroom for probe storms (is_daemon_available() + the real backend
    // reconnect) without ever falling over.
    if (::listen (listen_fd, 16) < 0)
    {
        std::cerr << "[map2-controller-host] listen() failed: " << std::strerror (errno) << "\n";
        ::close (listen_fd);
        return 1;
    }

    std::cerr << "[map2-controller-host] listening on " << socket_path << "\n";

    map2::controller_host::Map2MappingEngine mapping_engine;
    mapping_engine.initialise();
    std::unordered_map<std::string, std::unordered_map<std::string, std::string>> controller_script_cache;

    // T2459-H9 — hoist the heavy per-process MIDI setup out of the
    // accept loop. Previously each new backend connection re-ran the
    // libremidi probe order and recreated shm rings, which took >2s
    // and caused the next inbound connect to time out at the probe
    // layer's 2.0s recv() deadline (see MidiHostClient._roundtrip).
    // Doing this once at process start means every accept now hits
    // poll() in single-digit microseconds.
    //
    // T2459-H1 — instantiate the MIDI backend and run the locked probe
    // order (JACK MIDI → PipeWire → ALSA seq → ALSA raw). Failure is
    // non-fatal here: the host still serves other IPC, and a list_ports
    // request will respond with backend = "none" + an empty port list.
    map2::controller_host::Map2MidiBackend midiBackend;

    // T2459-H7-PW-UMP — Path 4. When MAP2_MIDI_BACKEND_FORCE is set
    // (typically by app/services/controller_host_pipewire_substrate.py
    // after detecting the PipeWire 1.4.10 UMP-MIDI2 → MIDI 1.0 bridge
    // gap), bypass the locked probe order and bind the requested
    // backend directly. This is what makes the legacy MIDI 1.0 device
    // path work on PipeWire-1.4.10+ hosts without an aconnect dance.
    // Unrecognized values fall through to probe() so the host doesn't
    // hard-fail on a typo. See docs/midi/MIDI_BACKEND.md §10.
    bool forced = false;
    if (const char* override_raw = std::getenv ("MAP2_MIDI_BACKEND_FORCE"))
    {
        std::string override_lc = override_raw;
        std::transform (override_lc.begin(), override_lc.end(), override_lc.begin(),
                        [] (unsigned char c) { return std::tolower (c); });
        using MB = map2::controller_host::MidiBackend;
        std::optional<MB> requested;
        if (override_lc == "jack" || override_lc == "jack_midi" || override_lc == "jackmidi")
            requested = MB::JackMidi;
        else if (override_lc == "pipewire" || override_lc == "pipewire_native")
            requested = MB::PipewireNative;
        else if (override_lc == "alsa" || override_lc == "alsa_seq" || override_lc == "alsaseq")
            requested = MB::AlsaSeq;
        else if (override_lc == "alsa_raw" || override_lc == "alsaraw")
            requested = MB::AlsaRaw;

        if (requested.has_value())
        {
            std::cerr << "[map2-controller-host] MAP2_MIDI_BACKEND_FORCE="
                      << override_raw << " — bypassing probe order\n";
            if (midiBackend.forceSelect (*requested))
            {
                forced = true;
                std::cerr << "[map2-controller-host] midi backend = "
                          << map2::controller_host::Map2MidiBackend::backendName (
                                 midiBackend.selectedBackend())
                          << " (forced)\n";
            }
            else
            {
                std::cerr << "[map2-controller-host] forceSelect failed; "
                             "falling back to probe order\n";
            }
        }
        else
        {
            std::cerr << "[map2-controller-host] MAP2_MIDI_BACKEND_FORCE="
                      << override_raw << " — unrecognized value; "
                      << "expected one of jack|pipewire|alsa_seq|alsa_raw\n";
        }
    }

    if (! forced && ! midiBackend.probe())
        std::cerr << "[map2-controller-host] MIDI backend probe failed; "
                     "all MIDI requests will return empty\n";
    else if (! forced)
        std::cerr << "[map2-controller-host] midi backend = "
                  << map2::controller_host::Map2MidiBackend::backendName (
                         midiBackend.selectedBackend())
                  << "\n";

    // T2459-H3 Slice 5 — create the shm rings and wire them to the
    // libremidi adapter so live inbound MIDI is producer-pushed by the
    // libremidi I/O thread and consumer-popped by this main loop.
    // T2459-H9 — rings are now process-scoped (one set for the entire
    // daemon lifetime) so subsequent backend reconnects don't pay the
    // shm-create cost that previously stalled per-accept setup. PID-
    // based naming still prevents host-instance collisions.
    const std::string rt_shm_name      = "/map2-controller-host.midi.rt." + std::to_string (::getpid());
    const std::string control_shm_name = "/map2-controller-host.midi.control." + std::to_string (::getpid());
    map2::controller_host::ShmEventRing rtRing;
    map2::controller_host::ShmEventRing controlRing;
    const bool rt_ok = rtRing.open (rt_shm_name,
                                     map2::controller_host::kRtRingDefaultCapacity,
                                     map2::controller_host::ShmEventRing::Mode::CreateOwned);
    const bool ctl_ok = controlRing.open (control_shm_name,
                                            map2::controller_host::kControlRingDefaultCapacity,
                                            map2::controller_host::ShmEventRing::Mode::CreateOwned);
    if (! rt_ok || ! ctl_ok)
        std::cerr << "[map2-controller-host] shm ring open failed: rt="
                  << rtRing.errorMessage() << " control=" << controlRing.errorMessage() << "\n";
    if (auto* adapter = midiBackend.adapter(); adapter != nullptr)
        adapter->setEventRings (rt_ok ? &rtRing : nullptr, ctl_ok ? &controlRing : nullptr);

    // T2459-H3 Slice 5/6 — device state that is shared across ALL
    // backend connections. Pre-H11 this lived inside the per-accept
    // body which meant only one backend client could open ports and
    // load mappings; every other client saw an empty index table. With
    // the multi-client poll-fanout (T2459-H11) the libremidi adapter
    // is a single process-scope resource, so its state must also be
    // process-scope.
    //
    // port_to_controller: which controller_key owns each opened port.
    // controller_keys_by_index: 1-based table whose index is mirrored
    //     into the libremidi adapter via openInput(port, index). The
    //     producer writes the index into Slot::controllerIndex and the
    //     consumer dispatches through the matching descriptor. Index 0
    //     is reserved for the unknown/legacy fallback so the first
    //     real controller is index 1. A second port that names the
    //     same controller_key reuses the existing index so all ports
    //     for one controller dispatch through the same descriptor.
    // active_controller_key: most-recently-opened controller — the
    //     fallback for events that arrive with controllerIndex=0.
    std::unordered_map<std::string, std::string> port_to_controller;
    std::vector<std::string> controller_keys_by_index;
    std::string active_controller_key;

    // T2459-H11 — process_request_frame handles ONE inbound frame on a
    // specific client fd. Returns false if the frame caller should
    // close the connection (currently only the shutdown frame).
    //
    // Each handler that emits a response sends it back on the same
    // client_fd that issued the request (request/response semantics).
    // Async outbound events (engine_command, log_event, script_error,
    // midi_send_request) are broadcast to ALL connected clients out
    // of drain_ring_and_dispatch — they are NOT routed here.
    //
    // Captures by reference because the helper closes over the
    // process-scope state established above plus the local
    // controller_script_cache. (controller_script_cache is also
    // process-scope so a script loaded on one connection is visible
    // to mapping_activate on any other connection.)
    auto process_request_frame = [&] (int client_fd, const std::string& frame) -> bool
    {
        if (frame.find ("\"type\":\"shutdown\"") != std::string::npos)
        {
            g_shutdownRequested.store (true, std::memory_order_release);
            send_frame (client_fd, "{\"type\":\"log_event\",\"msg_id\":\"\","
                                   "\"schema_version\":1,\"level\":\"info\","
                                   "\"message\":\"shutting down\"}");
            return false;
        }

        if (frame.find ("\"type\":\"midi_list_ports_request\"") != std::string::npos)
        {
            const std::string msg_id = extract_string_field (frame, "msg_id");
            send_frame (client_fd, build_list_ports_response (msg_id, midiBackend));
            return true;
        }

        if (frame.find ("\"type\":\"midi_open_input_request\"") != std::string::npos)
        {
            const std::string msg_id = extract_string_field (frame, "msg_id");
            const std::string controller_key = extract_string_field (frame, "controller_key");
            const std::string port_id = extract_string_field (frame, "port_id");
            if (controller_key.empty() || port_id.empty())
            {
                send_frame (client_fd, build_log_event (
                    msg_id, "error",
                    "midi_open_input_request missing controller_key or port_id",
                    controller_key.empty() ? std::nullopt : std::optional<std::string> (controller_key)));
                return true;
            }

            auto* adapter = midiBackend.adapter();
            if (adapter == nullptr)
            {
                send_frame (client_fd, build_log_event (
                    msg_id, "error",
                    "midi_open_input_request: no MIDI backend bound",
                    controller_key));
                return true;
            }
            std::uint16_t controller_index = 0;
            for (std::size_t i = 0; i < controller_keys_by_index.size(); ++i)
            {
                if (controller_keys_by_index[i] == controller_key)
                {
                    controller_index = static_cast<std::uint16_t> (i + 1);
                    break;
                }
            }
            if (controller_index == 0)
            {
                controller_keys_by_index.push_back (controller_key);
                controller_index = static_cast<std::uint16_t> (controller_keys_by_index.size());
            }

            if (! adapter->openInput (port_id, controller_index))
            {
                send_frame (client_fd, build_log_event (
                    msg_id, "error",
                    "midi_open_input_request failed: " + adapter->errorMessage(),
                    controller_key));
                return true;
            }
            port_to_controller[port_id] = controller_key;
            active_controller_key = controller_key;
            send_frame (client_fd, build_log_event (
                msg_id, "info",
                "midi input opened: " + port_id,
                controller_key));
            return true;
        }

        if (frame.find ("\"type\":\"midi_create_virtual_port_request\"") != std::string::npos)
        {
            const std::string msg_id = extract_string_field (frame, "msg_id");
            const std::string name = extract_string_field (frame, "name");
            if (name.empty())
            {
                send_frame (client_fd, build_log_event (
                    msg_id, "error",
                    "midi_create_virtual_port_request missing name"));
                return true;
            }
            auto* adapter = midiBackend.adapter();
            if (adapter == nullptr)
            {
                send_frame (client_fd, build_log_event (
                    msg_id, "error",
                    "midi_create_virtual_port_request: no MIDI backend bound"));
                return true;
            }
            if (! adapter->openVirtualOutput (name))
            {
                send_frame (client_fd, build_log_event (
                    msg_id, "error",
                    "midi_create_virtual_port_request failed: "
                    + adapter->errorMessage()));
                return true;
            }
            send_frame (client_fd, build_log_event (
                msg_id, "info",
                "virtual output published: " + name));
            return true;
        }

        if (frame.find ("\"type\":\"script_load_request\"") != std::string::npos)
        {
            const std::string msg_id = extract_string_field (frame, "msg_id");
            const std::string controller_key = extract_string_field (frame, "controller_key");
            const std::string script_path = extract_string_field (frame, "script_path");
            const std::string script_body = extract_string_field (frame, "script_body");
            if (controller_key.empty() || script_path.empty())
            {
                send_frame (client_fd, build_log_event (
                    msg_id, "warning",
                    "script_load_request missing controller_key or script_path",
                    controller_key.empty() ? std::nullopt : std::optional<std::string> (controller_key)));
                return true;
            }

            controller_script_cache[controller_key][script_path] = script_body;
            send_frame (client_fd, build_log_event (
                msg_id, "info",
                "script cached: " + script_path,
                controller_key));
            return true;
        }

        if (frame.find ("\"type\":\"mapping_activate\"") != std::string::npos)
        {
            const std::string msg_id = extract_string_field (frame, "msg_id");
            map2::controller_host::MappingDescriptorSpec descriptor;
            std::string controller_key;
            if (! parse_mapping_activate_frame (frame, descriptor, controller_key))
            {
                send_frame (client_fd, build_log_event (
                    msg_id, "error",
                    "mapping_activate parse failed"));
                return true;
            }

            std::vector<std::string> resolved_scripts;
            const int declared_scripts = static_cast<int> (descriptor.scripts.size());
            const auto cache_it = controller_script_cache.find (controller_key);
            static const std::unordered_map<std::string, std::string> kEmptyCache;
            const auto& cache_for_controller = cache_it != controller_script_cache.end()
                ? cache_it->second
                : kEmptyCache;

            int missing_scripts = 0;
            for (const auto& script_ref : descriptor.scripts)
            {
                if (auto script_body = resolve_script_body (script_ref, descriptor.pack_id, cache_for_controller);
                    script_body.has_value())
                {
                    resolved_scripts.push_back (*script_body);
                    continue;
                }
                if (script_ref.find ("function") != std::string::npos
                    || script_ref.find ("=>") != std::string::npos
                    || script_ref.find ('\n') != std::string::npos
                    || script_ref.find ('{') != std::string::npos
                    || script_ref.find (';') != std::string::npos
                    || script_ref.find ("var ") != std::string::npos
                    || script_ref.find ("const ") != std::string::npos
                    || script_ref.find ("let ") != std::string::npos)
                {
                    resolved_scripts.push_back (script_ref);
                    continue;
                }
                ++missing_scripts;
            }
            descriptor.scripts = std::move (resolved_scripts);
            if (missing_scripts == declared_scripts
                && missing_scripts > 0
                && descriptor_uses_script_callbacks (descriptor))
            {
                map2::controller_host::ScriptException exc;
                exc.file = "<mapping_activate>";
                exc.line = 0;
                exc.column = 0;
                exc.message = "no descriptor scripts resolved for script-bound controls";
                send_frame (client_fd, build_script_error (msg_id, controller_key, exc));
                return true;
            }

            if (auto exc = mapping_engine.loadDescriptor (controller_key, descriptor); exc.has_value())
            {
                send_frame (client_fd, build_script_error (msg_id, controller_key, *exc));
                return true;
            }

            std::ostringstream message;
            message << "mapping activated: controls=" << descriptor.controls.size()
                    << " scripts=" << descriptor.scripts.size();
            if (missing_scripts > 0) message << " missing_scripts=" << missing_scripts;
            send_frame (client_fd, build_log_event (
                msg_id,
                missing_scripts > 0 ? "warning" : "info",
                message.str(),
                controller_key));
            return true;
        }

        if (frame.find ("\"type\":\"mapping_deactivate\"") != std::string::npos)
        {
            const std::string msg_id = extract_string_field (frame, "msg_id");
            const std::string controller_key = extract_string_field (frame, "controller_key");
            if (controller_key.empty())
            {
                send_frame (client_fd, build_log_event (
                    msg_id, "error",
                    "mapping_deactivate missing controller_key"));
                return true;
            }
            const bool removed = mapping_engine.unloadDescriptor (controller_key);
            send_frame (client_fd, build_log_event (
                msg_id,
                removed ? "info" : "warning",
                removed
                    ? std::string ("mapping deactivated")
                    : std::string ("mapping_deactivate: controller_key not loaded"),
                controller_key));
            return true;
        }

        if (frame.find ("\"type\":\"mapping_reload\"") != std::string::npos)
        {
            const std::string msg_id = extract_string_field (frame, "msg_id");
            map2::controller_host::MappingDescriptorSpec descriptor;
            std::string controller_key;
            if (! parse_mapping_activate_frame (frame, descriptor, controller_key))
            {
                send_frame (client_fd, build_log_event (
                    msg_id, "error",
                    "mapping_reload parse failed"));
                return true;
            }

            std::vector<std::string> resolved_scripts;
            const int declared_scripts = static_cast<int> (descriptor.scripts.size());
            const auto cache_it = controller_script_cache.find (controller_key);
            static const std::unordered_map<std::string, std::string> kEmptyCache;
            const auto& cache_for_controller = cache_it != controller_script_cache.end()
                ? cache_it->second
                : kEmptyCache;

            int missing_scripts = 0;
            for (const auto& script_ref : descriptor.scripts)
            {
                if (auto script_body = resolve_script_body (script_ref, descriptor.pack_id, cache_for_controller);
                    script_body.has_value())
                {
                    resolved_scripts.push_back (*script_body);
                    continue;
                }
                if (script_ref.find ("function") != std::string::npos
                    || script_ref.find ("=>") != std::string::npos
                    || script_ref.find ('\n') != std::string::npos
                    || script_ref.find ('{') != std::string::npos
                    || script_ref.find (';') != std::string::npos
                    || script_ref.find ("var ") != std::string::npos
                    || script_ref.find ("const ") != std::string::npos
                    || script_ref.find ("let ") != std::string::npos)
                {
                    resolved_scripts.push_back (script_ref);
                    continue;
                }
                ++missing_scripts;
            }
            descriptor.scripts = std::move (resolved_scripts);
            if (missing_scripts == declared_scripts
                && missing_scripts > 0
                && descriptor_uses_script_callbacks (descriptor))
            {
                map2::controller_host::ScriptException exc;
                exc.file = "<mapping_reload>";
                exc.line = 0;
                exc.column = 0;
                exc.message = "no descriptor scripts resolved for script-bound controls";
                send_frame (client_fd, build_script_error (msg_id, controller_key, exc));
                return true;
            }

            if (auto exc = mapping_engine.reloadDescriptor (controller_key, descriptor); exc.has_value())
            {
                send_frame (client_fd, build_script_error (msg_id, controller_key, *exc));
                return true;
            }

            std::ostringstream message;
            message << "mapping reloaded: controls=" << descriptor.controls.size()
                    << " scripts=" << descriptor.scripts.size();
            if (missing_scripts > 0) message << " missing_scripts=" << missing_scripts;
            send_frame (client_fd, build_log_event (
                msg_id,
                missing_scripts > 0 ? "warning" : "info",
                message.str(),
                controller_key));
            return true;
        }

        // Unknown frame type — log and drop. Don't close the connection;
        // the backend may evolve the protocol with new frame types we
        // haven't compiled in yet.
        std::cerr << "[map2-controller-host] unhandled frame type ("
                  << frame.size() << " bytes)\n";
        return true;
    };

    // T2459-H11 — single-threaded poll-fanout accept loop. Replaces the
    // strictly-serialized accept→handle→close model with one poll() over
    // [listen_fd, ...connected_client_fds]. On each tick:
    //   1. drain both shm rings ONCE and broadcast outbound frames to
    //      every connected backend (each subscriber filters
    //      client-side via its registered callbacks)
    //   2. accept() any pending new client on listen_fd (non-blocking)
    //   3. process up to one frame per ready client_fd via
    //      process_request_frame (request/response on the same fd)
    //   4. prune any client that hangs up
    //
    // Why poll-fanout vs threads: the mapping engine, libremidi adapter,
    // and shm rings were authored single-threaded and share state freely.
    // A thread-per-connection model would require auditing every call
    // site for races; the single-thread loop guarantees the existing
    // invariants without new mutex surface area. Connection scalability
    // is bounded by struct rlimit, but we expect 4–8 concurrent backend
    // subscribers in practice (one per long-lived bridge plus transient
    // short-lived round-trips), well under any reasonable limit.
    std::vector<int> client_fds;
    client_fds.reserve (16);
    std::vector<struct pollfd> pollset;
    pollset.reserve (16);
    std::vector<int> dead_clients;
    dead_clients.reserve (16);

    while (! g_shutdownRequested.load (std::memory_order_acquire))
    {
        // T2482-P1.2 Gap C (iter 73) — outbound MIDI from JS callbacks
        // lands on the host's virtual output port when one is open.
        auto* outbound_adapter = midiBackend.adapter();

        // Drain shm rings ONCE per outer iteration and broadcast.
        dead_clients.clear();
        if (rt_ok)
        {
            drain_ring_and_dispatch (client_fds, rtRing, mapping_engine,
                                     controller_keys_by_index,
                                     active_controller_key, 64,
                                     outbound_adapter,
                                     dead_clients);
        }
        if (ctl_ok)
        {
            drain_ring_and_dispatch (client_fds, controlRing, mapping_engine,
                                     controller_keys_by_index,
                                     active_controller_key, 16,
                                     outbound_adapter,
                                     dead_clients);
        }

        // Prune clients that broadcast-failed during ring drain.
        if (! dead_clients.empty())
        {
            for (int fd : dead_clients)
            {
                client_fds.erase (std::remove (client_fds.begin(),
                                                 client_fds.end(),
                                                 fd),
                                   client_fds.end());
                ::close (fd);
                std::cerr << "[map2-controller-host] backend pruned (broadcast send failed)\n";
            }
        }

        // Build the poll set fresh each tick — small N, allocation cost
        // is dwarfed by the libremidi I/O thread.
        pollset.clear();
        pollset.push_back ({ listen_fd, POLLIN, 0 });
        for (int fd : client_fds)
            pollset.push_back ({ fd, POLLIN, 0 });

        // 1 ms timeout matches the legacy single-client loop cadence so
        // ring-drain freshness is unchanged.
        const int pr = ::poll (pollset.data(),
                                static_cast<nfds_t> (pollset.size()),
                                1);
        if (pr < 0)
        {
            if (errno == EINTR) continue;
            std::cerr << "[map2-controller-host] poll() failed: "
                      << std::strerror (errno) << "\n";
            break;
        }
        if (pr == 0) continue; // timeout — loop back to drain.

        // Accept on listen_fd ready. Drain ALL pending accepts so a
        // probe storm doesn't queue across multiple ticks.
        if (pollset[0].revents & POLLIN)
        {
            while (true)
            {
                int new_fd = ::accept4 (listen_fd, nullptr, nullptr, SOCK_CLOEXEC);
                if (new_fd < 0)
                {
                    if (errno == EAGAIN || errno == EWOULDBLOCK) break;
                    if (errno == EINTR) continue;
                    std::cerr << "[map2-controller-host] accept() failed: "
                              << std::strerror (errno) << "\n";
                    break;
                }
                // T2459-H11 — bound recv stalls. poll() can signal
                // POLLIN on partial data; recv_frame's MSG_WAITALL
                // would then block until the rest arrives. A 5s
                // recv timeout ensures one slow/dying client can't
                // stall the whole single-threaded loop. Well-behaved
                // clients send full frames atomically (sendall in
                // python's MidiHostClient) so this is purely a safety
                // net.
                struct timeval tv { 5, 0 };
                ::setsockopt (new_fd, SOL_SOCKET, SO_RCVTIMEO,
                                &tv, sizeof (tv));
                client_fds.push_back (new_fd);
                std::cerr << "[map2-controller-host] backend connected (now "
                          << client_fds.size() << " client(s))\n";
            }
        }

        // Process up to one frame per ready client.
        dead_clients.clear();
        for (std::size_t i = 1; i < pollset.size(); ++i)
        {
            int fd = pollset[i].fd;
            short ev = pollset[i].revents;
            if (ev & (POLLERR | POLLHUP | POLLNVAL))
            {
                dead_clients.push_back (fd);
                std::cerr << "[map2-controller-host] backend disconnected (poll hup)\n";
                continue;
            }
            if (! (ev & POLLIN)) continue;

            std::string frame;
            if (! recv_frame (fd, frame))
            {
                dead_clients.push_back (fd);
                std::cerr << "[map2-controller-host] backend disconnected\n";
                continue;
            }
            std::cerr << "[map2-controller-host] frame received ("
                      << frame.size() << " bytes)\n";

            if (! process_request_frame (fd, frame))
            {
                // shutdown — close this client and stop the loop.
                dead_clients.push_back (fd);
                break;
            }
        }

        for (int fd : dead_clients)
        {
            client_fds.erase (std::remove (client_fds.begin(),
                                             client_fds.end(),
                                             fd),
                               client_fds.end());
            ::close (fd);
        }
    }

    // Shutdown: close every connected client.
    for (int fd : client_fds)
        ::close (fd);

    ::close (listen_fd);
    ::unlink (socket_path.c_str());
    std::cerr << "[map2-controller-host] exited cleanly\n";
    return 0;
}

void print_usage()
{
    std::cout << "Usage: map2-controller-host --socket <path>\n"
                 "  --socket PATH    Unix-domain socket path (default: "
                 "/run/map2/controller-host.sock)\n"
                 "  --version        Print version and exit\n";
}

} // anonymous namespace

int main (int argc, char* argv[])
{
    install_signal_handlers();

    std::string socket_path = "/run/map2/controller-host.sock";

    for (int i = 1; i < argc; ++i)
    {
        const std::string arg = argv[i];
        if (arg == "--socket" && i + 1 < argc)
        {
            socket_path = argv[++i];
        }
        else if (arg == "--version")
        {
            std::cout << "map2-controller-host 0.1 (T2459-B2 scaffold)\n";
            return 0;
        }
        else if (arg == "--help" || arg == "-h")
        {
            print_usage();
            return 0;
        }
        else
        {
            std::cerr << "Unknown argument: " << arg << "\n";
            print_usage();
            return 2;
        }
    }

    return run_main_loop (socket_path);
}
