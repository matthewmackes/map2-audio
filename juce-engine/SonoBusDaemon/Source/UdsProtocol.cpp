// T2521-4 — UdsProtocol cycle-1 skeleton. Full bind/accept/decode lands
// in cycle 2.

#include "UdsProtocol.h"

#include <cstdio>
#include <cstring>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/un.h>
#include <unistd.h>
#include <utility>

namespace map2 {
namespace sonobus {

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
    // Cycle 2 work: actually bind + listen. For now just unlink any
    // stale socket so the bench operator's first run is clean.
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

    // Mode 0660 so the map2 group (supervisor process is map2) can connect.
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
    // Cycle 2 work: accept + decode.
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
}

}  // namespace sonobus
}  // namespace map2
