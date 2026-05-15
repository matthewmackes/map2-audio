// T2521-4 cycle 2 — UdsProtocol: accept + decode + dispatch + push.

#include "UdsProtocol.h"

#include <cerrno>
#include <cstdio>
#include <cstring>
#include <fcntl.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/un.h>
#include <unistd.h>
#include <utility>

namespace map2 {
namespace sonobus {

namespace {

// Tunable: max accepted frame size (1 MB). Anything larger means a
// malformed peer and the daemon disconnects them.
constexpr size_t kMaxFrameBytes = 1 * 1024 * 1024;

// Canonical error codes (mirrored on the supervisor side).
namespace err {
constexpr const char* kInvalidJson      = "invalid_json";
constexpr const char* kInvalidFrame     = "invalid_frame";
constexpr const char* kUnknownCommand   = "unknown_command";
constexpr const char* kHandlerThrew     = "handler_exception";
}

[[maybe_unused]] bool setNonBlocking(int fd)
{
    int flags = ::fcntl(fd, F_GETFL, 0);
    if (flags < 0) return false;
    return ::fcntl(fd, F_SETFL, flags | O_NONBLOCK) == 0;
}

}  // namespace

UdsProtocol::UdsProtocol(std::string socket_path)
    : socket_path_(std::move(socket_path))
{
}

UdsProtocol::~UdsProtocol()
{
    shutdown();
}

int UdsProtocol::initialize()
{
    ::unlink(socket_path_.c_str());

    listen_fd_ = ::socket(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC | SOCK_NONBLOCK, 0);
    if (listen_fd_ < 0)
    {
        std::fprintf(stderr, "[uds] socket() failed: %s\n", std::strerror(errno));
        return -1;
    }

    struct sockaddr_un addr;
    std::memset(&addr, 0, sizeof(addr));
    addr.sun_family = AF_UNIX;
    std::strncpy(addr.sun_path, socket_path_.c_str(), sizeof(addr.sun_path) - 1);

    if (::bind(listen_fd_, reinterpret_cast<struct sockaddr*>(&addr), sizeof(addr)) < 0)
    {
        std::fprintf(stderr, "[uds] bind(%s) failed: %s\n",
                     socket_path_.c_str(), std::strerror(errno));
        ::close(listen_fd_);
        listen_fd_ = -1;
        return -1;
    }

    // Mode 0660: owner (root or map2) + map2 group can connect.
    ::chmod(socket_path_.c_str(), 0660);

    if (::listen(listen_fd_, 4) < 0)
    {
        std::fprintf(stderr, "[uds] listen() failed: %s\n", std::strerror(errno));
        ::close(listen_fd_);
        listen_fd_ = -1;
        ::unlink(socket_path_.c_str());
        return -1;
    }

    std::fprintf(stderr, "[uds] listening on %s\n", socket_path_.c_str());
    return 0;
}

void UdsProtocol::poll()
{
    if (listen_fd_ < 0) return;

    acceptConnection();

    if (client_fd_ >= 0)
    {
        readFromClient();
        if (client_fd_ >= 0 && ! outbound_queue_.empty())
        {
            if (! flushOutbound())
            {
                std::fprintf(stderr, "[uds] outbound flush failed, disconnecting client\n");
                ::close(client_fd_);
                client_fd_ = -1;
                read_buffer_.clear();
            }
        }
    }
}

void UdsProtocol::acceptConnection()
{
    struct sockaddr_un peer;
    socklen_t peer_len = sizeof(peer);
    int fd = ::accept4(listen_fd_, reinterpret_cast<struct sockaddr*>(&peer), &peer_len,
                       SOCK_CLOEXEC | SOCK_NONBLOCK);
    if (fd < 0)
    {
        if (errno != EAGAIN && errno != EWOULDBLOCK)
        {
            std::fprintf(stderr, "[uds] accept failed: %s\n", std::strerror(errno));
        }
        return;
    }

    // New connection takes over; close any existing client.
    if (client_fd_ >= 0)
    {
        std::fprintf(stderr, "[uds] new client preempts existing connection\n");
        ::close(client_fd_);
        read_buffer_.clear();
        outbound_queue_.clear();
    }
    client_fd_ = fd;
    std::fprintf(stderr, "[uds] client connected (fd=%d)\n", client_fd_);
}

void UdsProtocol::readFromClient()
{
    char buf[4096];
    while (client_fd_ >= 0)
    {
        ssize_t n = ::read(client_fd_, buf, sizeof(buf));
        if (n > 0)
        {
            read_buffer_.append(buf, static_cast<size_t>(n));
            if (read_buffer_.size() > kMaxFrameBytes)
            {
                std::fprintf(stderr, "[uds] read buffer exceeded %zu bytes, disconnecting\n",
                             kMaxFrameBytes);
                ::close(client_fd_);
                client_fd_ = -1;
                read_buffer_.clear();
                return;
            }
            // Drain any complete '\n'-terminated frames.
            for (;;)
            {
                auto nl = read_buffer_.find('\n');
                if (nl == std::string::npos) break;
                std::string line = read_buffer_.substr(0, nl);
                read_buffer_.erase(0, nl + 1);
                if (! line.empty()) dispatchFrame(line);
            }
        }
        else if (n == 0)
        {
            // Peer closed.
            std::fprintf(stderr, "[uds] client disconnected (EOF)\n");
            ::close(client_fd_);
            client_fd_ = -1;
            read_buffer_.clear();
            return;
        }
        else
        {
            if (errno == EAGAIN || errno == EWOULDBLOCK) return;
            if (errno == EINTR) continue;
            std::fprintf(stderr, "[uds] read failed: %s\n", std::strerror(errno));
            ::close(client_fd_);
            client_fd_ = -1;
            read_buffer_.clear();
            return;
        }
    }
}

void UdsProtocol::dispatchFrame(const std::string& line)
{
    json parsed;
    try
    {
        parsed = json::parse(line);
    }
    catch (const json::parse_error& e)
    {
        std::fprintf(stderr, "[uds] parse error: %s (line %zu bytes)\n",
                     e.what(), line.size());
        sendError("", err::kInvalidJson, e.what());
        return;
    }

    Frame frame;
    try
    {
        if (! parsed.is_object()) throw std::runtime_error("frame is not a JSON object");
        if (parsed.contains("v")) frame.version = parsed.at("v").get<int>();
        if (! parsed.contains("type") || ! parsed.at("type").is_string())
            throw std::runtime_error("missing or non-string `type`");
        frame.type = parsed.at("type").get<std::string>();
        if (parsed.contains("id") && parsed.at("id").is_string())
            frame.id = parsed.at("id").get<std::string>();
        if (parsed.contains("payload"))
            frame.payload = parsed.at("payload");
    }
    catch (const std::exception& e)
    {
        sendError("", err::kInvalidFrame, e.what());
        return;
    }

    auto it = handlers_.find(frame.type);
    if (it == handlers_.end())
    {
        sendError(frame.id, err::kUnknownCommand,
                  "no handler registered for type=" + frame.type);
        return;
    }

    CommandResult result;
    try
    {
        result = it->second(frame);
    }
    catch (const std::exception& e)
    {
        sendError(frame.id, err::kHandlerThrew, e.what());
        return;
    }

    // Serialize the response.
    json response = {
        {"v", 1},
        {"type", frame.type + ".response"},
        {"id", frame.id},
        {"ok", result.ok},
    };
    if (! result.ok)
    {
        response["error"] = {
            {"code", result.error_code},
            {"message", result.error_message},
        };
    }
    response["data"] = result.data;

    if (! writeFrame(response))
    {
        std::fprintf(stderr, "[uds] response write failed, disconnecting client\n");
        ::close(client_fd_);
        client_fd_ = -1;
        read_buffer_.clear();
    }
}

bool UdsProtocol::flushOutbound()
{
    while (! outbound_queue_.empty())
    {
        const std::string& frame = outbound_queue_.front();
        size_t total = frame.size();
        size_t written = 0;
        while (written < total)
        {
            ssize_t n = ::write(client_fd_, frame.data() + written, total - written);
            if (n > 0)
            {
                written += static_cast<size_t>(n);
            }
            else if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK))
            {
                // Backpressure: stash the partial remainder + retry on next poll.
                outbound_queue_.front() = frame.substr(written);
                return true;
            }
            else if (n < 0 && errno == EINTR)
            {
                continue;
            }
            else
            {
                return false;
            }
        }
        outbound_queue_.erase(outbound_queue_.begin());
    }
    return true;
}

bool UdsProtocol::writeFrame(const json& frame)
{
    if (client_fd_ < 0) return false;
    std::string serialized = frame.dump();
    serialized.push_back('\n');
    outbound_queue_.push_back(std::move(serialized));
    return flushOutbound();
}

void UdsProtocol::sendError(const std::string& request_id,
                            const std::string& error_code,
                            const std::string& error_message)
{
    if (client_fd_ < 0) return;
    json err = {
        {"v", 1},
        {"type", "error"},
        {"id", request_id},
        {"ok", false},
        {"error", {
            {"code", error_code},
            {"message", error_message},
        }},
    };
    writeFrame(err);
}

void UdsProtocol::registerHandler(const std::string& type, CommandHandler handler)
{
    handlers_[type] = std::move(handler);
}

void UdsProtocol::pushEvent(const std::string& type, json payload)
{
    if (client_fd_ < 0) return;
    json frame = {
        {"v", 1},
        {"type", type},
        {"event", true},
        {"payload", std::move(payload)},
    };
    writeFrame(frame);
}

void UdsProtocol::shutdown()
{
    if (client_fd_ >= 0)
    {
        ::close(client_fd_);
        client_fd_ = -1;
    }
    if (listen_fd_ >= 0)
    {
        ::close(listen_fd_);
        listen_fd_ = -1;
        ::unlink(socket_path_.c_str());
    }
    read_buffer_.clear();
    outbound_queue_.clear();
}

}  // namespace sonobus
}  // namespace map2
