// T2521-4 — UdsProtocol: line-delimited JSON protocol over a UNIX domain
// socket. The backend supervisor connects + sends commands; the daemon
// responds + pushes async events.
//
// Frame format (each line terminated by '\n'):
//   {"v":1,"type":"<cmd>","id":"<uuid>","payload":{...}}
//
// Single-client by design — the supervisor is the only legitimate peer.
// If a second client connects, the existing one is closed and the new
// one takes over. (Operator can use `socat - UNIX-CONNECT:/run/map2/...`
// to debug, but the supervisor will take back ownership on its next reconnect.)

#pragma once

#include <atomic>
#include <cstdint>
#include <functional>
#include <string>
#include <unordered_map>
#include <vector>

#include <nlohmann/json.hpp>

namespace map2 {
namespace sonobus {

using json = nlohmann::json;

// Command/event types over the protocol (kept narrow — single string
// enum at the wire level for readability with `journalctl` + `jq`).
struct Frame
{
    int version = 1;            // protocol version; bumped on breaking change
    std::string type;           // "hello" / "create_source" / ...
    std::string id;             // request ID, echoed back on the response
    json payload = json::object();
};

// Result of a command-handler invocation. The dispatcher converts this
// into a response frame and writes it back to the client.
struct CommandResult
{
    bool ok = true;
    std::string error_code;     // only set on ok=false; canonical strings
    std::string error_message;  // human-readable
    json data = json::object(); // command-specific response payload
};

// Pluggable command handler. Cycle 3 wires AOO commands here; cycle 4
// wires JACK commands; cycle 5 wires the supervisor handshake.
using CommandHandler = std::function<CommandResult(const Frame&)>;

class UdsProtocol
{
public:
    explicit UdsProtocol(std::string socket_path);
    ~UdsProtocol();

    UdsProtocol(const UdsProtocol&) = delete;
    UdsProtocol& operator=(const UdsProtocol&) = delete;

    int initialize();           // bind UDS, set non-blocking, listen
    void poll();                // accept new connections, decode messages
    void shutdown();            // close fd, unlink socket

    // Register a handler for a specific command type. Replaces any
    // previous handler with the same key. Thread-safe before `run()`
    // starts; not called from the audio thread.
    void registerHandler(const std::string& type, CommandHandler handler);

    // Push an async event to the connected client. No-op if no client.
    // The frame is serialized + queued — the next poll() flush writes it.
    void pushEvent(const std::string& type, json payload);

    // True if a supervisor is currently connected.
    bool hasClient() const { return client_fd_ >= 0; }

    // Tunable for tests + main-loop pacing (default 50ms).
    int poll_interval_ms = 50;

private:
    // Accept a new connection if any. Closes the previous client.
    void acceptConnection();

    // Drain one client's read buffer. Calls dispatchFrame() per complete line.
    void readFromClient();

    // Parse + dispatch one decoded frame.
    void dispatchFrame(const std::string& line);

    // Flush any queued outbound events to the client. Returns false if
    // the write fails (client disconnected); caller closes the fd.
    bool flushOutbound();

    // Write a single frame to the client. Appends '\n'.
    bool writeFrame(const json& frame);

    // Send a typed error response.
    void sendError(const std::string& request_id,
                   const std::string& error_code,
                   const std::string& error_message);

    std::string socket_path_;
    int listen_fd_ = -1;
    int client_fd_ = -1;
    std::string read_buffer_;   // unterminated tail from the last read

    std::unordered_map<std::string, CommandHandler> handlers_;
    std::vector<std::string> outbound_queue_;  // serialized frames (with \n)
};

}  // namespace sonobus
}  // namespace map2
