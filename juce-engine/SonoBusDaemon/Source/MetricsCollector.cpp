// T2521-4 cycle 7 — MetricsCollector.

#include "MetricsCollector.h"

#include <chrono>

namespace map2 {
namespace sonobus {

MetricsCollector::MetricsCollector() = default;
MetricsCollector::~MetricsCollector() = default;

void MetricsCollector::initialize()
{
    std::lock_guard<std::mutex> guard(lock_);
    streams_.clear();
    last_snapshot_unix_ms_ = nowUnixMs();
}

void MetricsCollector::tick()
{
    // No-op in stub mode. In full mode (cycle 3/4) the AOO + JACK
    // observers will call recordRtt/recordLoss/etc. asynchronously.
}

void MetricsCollector::registerStream(const std::string& stream_id)
{
    std::lock_guard<std::mutex> guard(lock_);
    auto& m = streams_[stream_id];
    m.stream_id = stream_id;
    m.last_update_unix_ms = nowUnixMs();
}

void MetricsCollector::unregisterStream(const std::string& stream_id)
{
    std::lock_guard<std::mutex> guard(lock_);
    streams_.erase(stream_id);
}

nlohmann::json MetricsCollector::snapshotJson() const
{
    std::lock_guard<std::mutex> guard(lock_);
    nlohmann::json streams = nlohmann::json::array();
    for (const auto& [stream_id, m] : streams_)
    {
        streams.push_back({
            {"stream_id", stream_id},
            {"rtt_ms", m.rtt_ms},
            {"loss_pct", m.loss_pct},
            {"jitter_ms", m.jitter_ms},
            {"resend_count", m.resend_count},
            {"observed_latency_ms", m.observed_latency_ms},
            {"last_update_unix_ms", m.last_update_unix_ms},
        });
    }
    return {
        {"streams", streams},
        {"taken_at_unix_ms", nowUnixMs()},
    };
}

nlohmann::json MetricsCollector::snapshotStreamJson(const std::string& stream_id) const
{
    std::lock_guard<std::mutex> guard(lock_);
    auto it = streams_.find(stream_id);
    if (it == streams_.end()) return nullptr;
    const auto& m = it->second;
    return {
        {"stream_id", stream_id},
        {"rtt_ms", m.rtt_ms},
        {"loss_pct", m.loss_pct},
        {"jitter_ms", m.jitter_ms},
        {"resend_count", m.resend_count},
        {"observed_latency_ms", m.observed_latency_ms},
        {"last_update_unix_ms", m.last_update_unix_ms},
    };
}

bool MetricsCollector::maybeBuildPeriodicSnapshot(nlohmann::json& out)
{
    int64_t now_ms = nowUnixMs();
    {
        std::lock_guard<std::mutex> guard(lock_);
        if (snapshot_interval_ms_ <= 0) return false;
        if (now_ms - last_snapshot_unix_ms_ < snapshot_interval_ms_) return false;
        last_snapshot_unix_ms_ = now_ms;
    }
    out = snapshotJson();
    return true;
}

void MetricsCollector::setSnapshotIntervalMs(int64_t ms)
{
    std::lock_guard<std::mutex> guard(lock_);
    snapshot_interval_ms_ = ms;
}

int64_t MetricsCollector::nowUnixMs()
{
    using namespace std::chrono;
    return duration_cast<milliseconds>(
        system_clock::now().time_since_epoch()
    ).count();
}

}  // namespace sonobus
}  // namespace map2
