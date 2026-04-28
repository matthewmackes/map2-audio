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

#include "QuickJSEngine.h"
#include "Midi/Map2MidiBackend.h"

#include <atomic>
#include <cerrno>
#include <csignal>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <sstream>
#include <string>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/un.h>
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
    auto end = frame.find ('"', pos);
    if (end == std::string::npos) return {};
    return frame.substr (pos, end - pos);
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

    map2::controller_host::QuickJSEngine engine;

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
