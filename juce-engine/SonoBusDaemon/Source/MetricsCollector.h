// T2521-4 cycle 7 — MetricsCollector: per-stream RTT, loss, jitter,
// resend count, observed latency. Cycle 1 was an empty skeleton; this
// cycle adds the public query API + snapshot push.
//
// In stub mode all per-stream metrics are zero (no actual transport),
// but the per-stream registry still tracks which stream_ids the
// supervisor has spun up so the diagnostics surface returns rows for
// each known binding instead of an empty list.

#pragma once

#include <chrono>
#include <cstdint>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

#include <nlohmann/json.hpp>

namespace map2 {
namespace sonobus {

// Per-stream metric tuple. Mirrored on the Python side in
// SonoBusDiagnosticBinding (binding_id keyed via stream_id).
struct StreamMetrics
{
    std::string stream_id;
    double rtt_ms = 0.0;
    double loss_pct = 0.0;
    double jitter_ms = 0.0;
    uint64_t resend_count = 0;
    double observed_latency_ms = 0.0;
    int64_t last_update_unix_ms = 0;
};

class MetricsCollector
{
public:
    MetricsCollector();
    ~MetricsCollector();

    void initialize();
    void tick();      // called from main loop every poll interval

    // Stream lifecycle. Called from the AOO/JACK paths when a stream
    // is opened or torn down so the diagnostics surface reflects the
    // current set of active bindings.
    void registerStream(const std::string& stream_id);
    void unregisterStream(const std::string& stream_id);

    // Snapshot the current metric state. Used to:
    //   1. Answer the `metrics_query` UDS command
    //   2. Periodically push `metrics_snapshot` events to the supervisor
    nlohmann::json snapshotJson() const;

    // Snapshot one stream's metrics; returns null JSON if unknown.
    nlohmann::json snapshotStreamJson(const std::string& stream_id) const;

    // Returns true and replaces `out` with the latest snapshot iff
    // SNAPSHOT_INTERVAL_MS has elapsed since the last push. Lets the
    // main loop decide when to push without holding the lock.
    bool maybeBuildPeriodicSnapshot(nlohmann::json& out);

    // For testing — set the periodic snapshot interval in ms.
    void setSnapshotIntervalMs(int64_t ms);

private:
    mutable std::mutex lock_;
    std::unordered_map<std::string, StreamMetrics> streams_;
    int64_t snapshot_interval_ms_ = 5000;  // 5s default
    int64_t last_snapshot_unix_ms_ = 0;

    static int64_t nowUnixMs();
};

}  // namespace sonobus
}  // namespace map2
