// T2521-4 — DaemonServer owns the daemon's lifecycle and wires together
// the UDS protocol, AOO transport, JACK bridge, and metrics collector.

#pragma once

#include "DaemonConfig.h"

#include <atomic>
#include <memory>
#include <string>

namespace map2 {
namespace sonobus {

class UdsProtocol;
class AooTransport;
class JackBridge;
class MetricsCollector;

class DaemonServer
{
public:
    explicit DaemonServer(const DaemonArgs& args);
    ~DaemonServer();

    // Non-copyable, non-movable.
    DaemonServer(const DaemonServer&) = delete;
    DaemonServer& operator=(const DaemonServer&) = delete;

    // Runs the main event loop. Blocks until SIGTERM/SIGINT or fatal error.
    // Returns the exit code (0 = clean shutdown, nonzero = error).
    int run();

    // Signal-handler-safe shutdown request. Sets an atomic flag the main
    // loop checks every iteration.
    void requestShutdown();

private:
    DaemonArgs args_;
    std::atomic<bool> shutdown_requested_{false};

    std::unique_ptr<UdsProtocol> uds_;
    std::unique_ptr<AooTransport> aoo_;
    std::unique_ptr<JackBridge> jack_;
    std::unique_ptr<MetricsCollector> metrics_;
};

}  // namespace sonobus
}  // namespace map2
