// T2521-4 — DaemonServer skeleton (cycle 1).
//
// Cycle 1 ships build-only scaffolding so the CMake target compiles
// against either AOO (when vendored) or the stub mode. The main loop,
// UDS protocol decoding, AOO bridging, and JACK port handoff land in
// cycles 2-7.

#include "DaemonServer.h"
#include "UdsProtocol.h"
#include "AooTransport.h"
#include "JackBridge.h"
#include "MetricsCollector.h"

#include <chrono>
#include <cstdio>
#include <thread>

namespace map2 {
namespace sonobus {

DaemonServer::DaemonServer(const DaemonArgs& args)
    : args_(args)
    , uds_(std::make_unique<UdsProtocol>(args.socket_path))
    , aoo_(std::make_unique<AooTransport>(args.port_base, args.port_count))
    , jack_(std::make_unique<JackBridge>(args.sample_rate_hz, args.buffer_size))
    , metrics_(std::make_unique<MetricsCollector>())
{
}

DaemonServer::~DaemonServer() = default;

void DaemonServer::requestShutdown()
{
    shutdown_requested_.store(true, std::memory_order_release);
}

int DaemonServer::run()
{
    // Initialize all subsystems. Each returns 0 on success.
    if (int rc = uds_->initialize(); rc != 0)
    {
        std::fprintf(stderr, "[daemon] UDS init failed (rc=%d)\n", rc);
        return rc;
    }
    if (int rc = aoo_->initialize(); rc != 0)
    {
        std::fprintf(stderr, "[daemon] AOO init failed (rc=%d)\n", rc);
        return rc;
    }
    if (int rc = jack_->initialize(); rc != 0)
    {
        // JACK init failure is non-fatal in stub mode (we can run without
        // a JACK server for the daemon-lifecycle test); the supervisor
        // gets a "degraded" status via the UDS hello frame.
        std::fprintf(stderr, "[daemon] JACK init returned %d — running in degraded mode\n", rc);
    }
    metrics_->initialize();

    // Main loop. Cycle 1 = simple poll loop. Cycle 2 swaps in libuv.
    constexpr auto kPollIntervalMs = std::chrono::milliseconds(50);
    while (! shutdown_requested_.load(std::memory_order_acquire))
    {
        uds_->poll();
        aoo_->poll();
        metrics_->tick();
        std::this_thread::sleep_for(kPollIntervalMs);
    }

    // Graceful shutdown.
    jack_->shutdown();
    aoo_->shutdown();
    uds_->shutdown();
    return 0;
}

}  // namespace sonobus
}  // namespace map2
