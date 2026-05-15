// T2521-4 — UdsProtocol: line-delimited JSON protocol over a UNIX domain
// socket. The backend supervisor connects + sends commands; the daemon
// responds + pushes async events.
//
// Frame format (each line terminated by '\n'):
//   {"v":1,"type":"<cmd>","id":"<uuid>","payload":{...}}

#pragma once

#include <string>

namespace map2 {
namespace sonobus {

class UdsProtocol
{
public:
    explicit UdsProtocol(std::string socket_path);
    ~UdsProtocol();

    int initialize();   // bind UDS, set non-blocking, listen
    void poll();        // accept new connections, decode messages
    void shutdown();    // close fd, unlink socket

private:
    std::string socket_path_;
    int listen_fd_ = -1;
    int client_fd_ = -1;  // single-client by design (the supervisor)
};

}  // namespace sonobus
}  // namespace map2
