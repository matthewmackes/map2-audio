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

#include "MappingEngine/Map2MappingEngine.h"
#include "Midi/Map2MidiBackend.h"

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

int run_main_loop (const std::string& socket_path)
{
    // Remove any leftover socket file from a prior crashed run.
    ::unlink (socket_path.c_str());

    int listen_fd = ::socket (AF_UNIX, SOCK_STREAM, 0);
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

    if (::listen (listen_fd, 1) < 0)
    {
        std::cerr << "[map2-controller-host] listen() failed: " << std::strerror (errno) << "\n";
        ::close (listen_fd);
        return 1;
    }

    std::cerr << "[map2-controller-host] listening on " << socket_path << "\n";

    map2::controller_host::Map2MappingEngine mapping_engine;
    mapping_engine.initialise();
    std::unordered_map<std::string, std::unordered_map<std::string, std::string>> controller_script_cache;

    while (! g_shutdownRequested.load (std::memory_order_acquire))
    {
        int client_fd = ::accept (listen_fd, nullptr, nullptr);
        if (client_fd < 0)
        {
            if (errno == EINTR)
                continue;
            std::cerr << "[map2-controller-host] accept() failed: " << std::strerror (errno) << "\n";
            break;
        }

        std::cerr << "[map2-controller-host] backend connected\n";

        // T2459-H1 — instantiate the MIDI backend on first connection and
        // run the locked probe order (JACK MIDI → PipeWire → ALSA seq →
        // ALSA raw). Failure is non-fatal here: the host still serves
        // other IPC, and a list_ports request will respond with backend
        // = "none" + an empty port list.
        map2::controller_host::Map2MidiBackend midiBackend;
        if (! midiBackend.probe())
            std::cerr << "[map2-controller-host] MIDI backend probe failed; "
                         "all MIDI requests will return empty\n";
        else
            std::cerr << "[map2-controller-host] midi backend = "
                      << map2::controller_host::Map2MidiBackend::backendName (
                             midiBackend.selectedBackend())
                      << "\n";

        while (! g_shutdownRequested.load (std::memory_order_acquire))
        {
            std::string frame;
            if (! recv_frame (client_fd, frame))
            {
                std::cerr << "[map2-controller-host] backend disconnected\n";
                break;
            }
            // Minimum-viable handler: T2459-H1 wires midi_list_ports_request,
            // T2459-B2-followup will replace the find()-based dispatch with
            // a proper JSON parser. For now, the type literal is the gate.
            std::cerr << "[map2-controller-host] frame received (" << frame.size() << " bytes)\n";

            // Naive shutdown detection — if the payload mentions
            // "shutdown" type, exit. JSON parser integration in
            // follow-up.
            if (frame.find ("\"type\":\"shutdown\"") != std::string::npos)
            {
                g_shutdownRequested.store (true, std::memory_order_release);
                send_frame (client_fd, "{\"type\":\"log_event\",\"msg_id\":\"\","
                                       "\"schema_version\":1,\"level\":\"info\","
                                       "\"message\":\"shutting down\"}");
                break;
            }

            // T2459-H1 — list-ports request.
            if (frame.find ("\"type\":\"midi_list_ports_request\"") != std::string::npos)
            {
                const std::string msg_id = extract_string_field (frame, "msg_id");
                const std::string response = build_list_ports_response (msg_id, midiBackend);
                send_frame (client_fd, response);
                continue;
            }

            // T2459-H3 — cache script sources for later mapping activation.
            if (frame.find ("\"type\":\"script_load_request\"") != std::string::npos)
            {
                const std::string msg_id = extract_string_field (frame, "msg_id");
                const std::string controller_key = extract_string_field (frame, "controller_key");
                const std::string script_path = extract_string_field (frame, "script_path");
                const std::string script_body = extract_string_field (frame, "script_body");
                if (controller_key.empty() || script_path.empty())
                {
                    send_frame (client_fd, build_log_event (
                        msg_id,
                        "warning",
                        "script_load_request missing controller_key or script_path",
                        controller_key.empty() ? std::nullopt : std::optional<std::string> (controller_key)));
                    continue;
                }

                controller_script_cache[controller_key][script_path] = script_body;
                send_frame (client_fd, build_log_event (
                    msg_id,
                    "info",
                    "script cached: " + script_path,
                    controller_key));
                continue;
            }

            // T2459-H3 — mapping activation consumed by the production
            // host loop. Descriptor/script parsing remains intentionally
            // conservative until the full JSON dispatcher lands.
            if (frame.find ("\"type\":\"mapping_activate\"") != std::string::npos)
            {
                const std::string msg_id = extract_string_field (frame, "msg_id");
                map2::controller_host::MappingDescriptorSpec descriptor;
                std::string controller_key;
                if (! parse_mapping_activate_frame (frame, descriptor, controller_key))
                {
                    send_frame (client_fd, build_log_event (
                        msg_id,
                        "error",
                        "mapping_activate parse failed"));
                    continue;
                }

                std::vector<std::string> resolved_scripts;
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
                    // Fallback: allow inline script bodies.
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

                if (auto exc = mapping_engine.loadDescriptor (controller_key, descriptor); exc.has_value())
                {
                    send_frame (client_fd, build_script_error (msg_id, controller_key, *exc));
                    continue;
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
                continue;
            }
        }

        ::close (client_fd);
    }

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
