// T2521-4 — DaemonServer cycle 2: wire the supervisor handshake + the
// AOO source/sink lifecycle commands into the UDS protocol dispatcher.
//
// Commands routed in this cycle:
//   - hello                  → handshake; daemon replies with version + build mode
//   - create_source          → AooTransport::createSource
//   - destroy_source         → AooTransport::destroySource
//   - create_sink            → AooTransport::createSink
//   - destroy_sink           → AooTransport::destroySink
//   - shutdown               → graceful exit
//
// Cycle 4 wires JACK commands; cycle 7 wires metrics_query.

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

using json = nlohmann::json;

namespace {

std::string transportResultName(TransportResult r)
{
    switch (r)
    {
        case TransportResult::Ok:                   return "ok";
        case TransportResult::Unavailable:          return "transport_unavailable";
        case TransportResult::NotInitialized:       return "not_initialized";
        case TransportResult::PortAllocationFailed: return "port_allocation_failed";
        case TransportResult::PeerNotFound:         return "peer_not_found";
        case TransportResult::InvalidArgument:      return "invalid_argument";
    }
    return "unknown";
}

CommandResult okResult(json data = json::object())
{
    CommandResult r;
    r.ok = true;
    r.data = std::move(data);
    return r;
}

CommandResult errResult(const std::string& code, const std::string& msg)
{
    CommandResult r;
    r.ok = false;
    r.error_code = code;
    r.error_message = msg;
    return r;
}

}  // namespace

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
        std::fprintf(stderr, "[daemon] JACK init returned %d — running in degraded mode\n", rc);
    }
    metrics_->initialize();

    // ─── Register UDS command handlers ───────────────────────────────

    uds_->registerHandler("hello", [this](const Frame&) -> CommandResult {
        return okResult({
            {"version", DAEMON_VERSION},
            {"build_mode", IS_STUB_BUILD ? "stub" : "full"},
            {"has_aoo", ! IS_STUB_BUILD},
            {"has_jack", HAS_JACK_BUILD},
            {"sample_rate_hz", args_.sample_rate_hz},
            {"buffer_size", args_.buffer_size},
            {"port_base", args_.port_base},
            {"port_count", args_.port_count},
        });
    });

    // Cycle 7 — source/sink lifecycle handlers also register with the
    // metrics collector so the diagnostics surface reflects the
    // currently-active stream set. In stub mode the AOO call returns
    // transport_unavailable; we DO still register the stream so the
    // operator sees the binding rows in /api/sonobus/diagnostics with
    // metrics=0 (rather than an empty list that hides the binding).

    uds_->registerHandler("create_source", [this](const Frame& f) -> CommandResult {
        if (! f.payload.is_object() || ! f.payload.contains("stream_id"))
            return errResult("invalid_argument", "payload must contain stream_id");
        std::string stream_id = f.payload.at("stream_id").get<std::string>();
        auto r = aoo_->createSource(stream_id);
        if (r == TransportResult::Ok || r == TransportResult::Unavailable)
        {
            metrics_->registerStream(stream_id);
        }
        if (r != TransportResult::Ok)
            return errResult(transportResultName(r),
                             "createSource(" + stream_id + ") failed");
        return okResult({{"stream_id", stream_id}});
    });

    uds_->registerHandler("destroy_source", [this](const Frame& f) -> CommandResult {
        if (! f.payload.is_object() || ! f.payload.contains("stream_id"))
            return errResult("invalid_argument", "payload must contain stream_id");
        std::string stream_id = f.payload.at("stream_id").get<std::string>();
        auto r = aoo_->destroySource(stream_id);
        metrics_->unregisterStream(stream_id);
        if (r != TransportResult::Ok)
            return errResult(transportResultName(r),
                             "destroySource(" + stream_id + ") failed");
        return okResult({{"stream_id", stream_id}});
    });

    uds_->registerHandler("create_sink", [this](const Frame& f) -> CommandResult {
        if (! f.payload.is_object() || ! f.payload.contains("stream_id"))
            return errResult("invalid_argument", "payload must contain stream_id");
        std::string stream_id = f.payload.at("stream_id").get<std::string>();
        auto r = aoo_->createSink(stream_id);
        if (r == TransportResult::Ok || r == TransportResult::Unavailable)
        {
            metrics_->registerStream(stream_id);
        }
        if (r != TransportResult::Ok)
            return errResult(transportResultName(r),
                             "createSink(" + stream_id + ") failed");
        return okResult({{"stream_id", stream_id}});
    });

    uds_->registerHandler("destroy_sink", [this](const Frame& f) -> CommandResult {
        if (! f.payload.is_object() || ! f.payload.contains("stream_id"))
            return errResult("invalid_argument", "payload must contain stream_id");
        std::string stream_id = f.payload.at("stream_id").get<std::string>();
        auto r = aoo_->destroySink(stream_id);
        metrics_->unregisterStream(stream_id);
        if (r != TransportResult::Ok)
            return errResult(transportResultName(r),
                             "destroySink(" + stream_id + ") failed");
        return okResult({{"stream_id", stream_id}});
    });

    // Cycle 7 — per-binding metrics query. Returns either the full
    // metric snapshot (no payload.stream_id) or a single stream's
    // metrics (when payload.stream_id is set).
    uds_->registerHandler("metrics_query", [this](const Frame& f) -> CommandResult {
        if (f.payload.is_object() && f.payload.contains("stream_id"))
        {
            std::string stream_id = f.payload.at("stream_id").get<std::string>();
            auto snap = metrics_->snapshotStreamJson(stream_id);
            if (snap.is_null())
                return errResult("stream_not_found",
                                 "no metrics tracked for stream_id=" + stream_id);
            return okResult(snap);
        }
        return okResult(metrics_->snapshotJson());
    });

    uds_->registerHandler("shutdown", [this](const Frame&) -> CommandResult {
        std::fprintf(stderr, "[daemon] shutdown requested by supervisor\n");
        requestShutdown();
        return okResult();
    });

    uds_->registerHandler("ping", [](const Frame&) -> CommandResult {
        return okResult({{"pong", true}});
    });

    // ─── Main loop ───────────────────────────────────────────────────

    constexpr auto kPollIntervalMs = std::chrono::milliseconds(50);
    while (! shutdown_requested_.load(std::memory_order_acquire))
    {
        uds_->poll();
        aoo_->poll();
        metrics_->tick();

        // Cycle 7 — periodic metrics_snapshot event push. The collector
        // gates the snapshot internally (default 5s interval) so this
        // call is essentially free until the timer elapses.
        if (uds_->hasClient())
        {
            json snapshot;
            if (metrics_->maybeBuildPeriodicSnapshot(snapshot))
            {
                uds_->pushEvent("metrics_snapshot", std::move(snapshot));
            }
        }

        std::this_thread::sleep_for(kPollIntervalMs);
    }

    jack_->shutdown();
    aoo_->shutdown();
    uds_->shutdown();
    return 0;
}

}  // namespace sonobus
}  // namespace map2
