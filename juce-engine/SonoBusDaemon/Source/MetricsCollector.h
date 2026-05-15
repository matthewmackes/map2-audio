// T2521-4 — MetricsCollector: per-binding RTT, loss, jitter, resends,
// observed_latency. Fed to `GET /api/sonobus/diagnostics` via UDS push.

#pragma once

namespace map2 {
namespace sonobus {

class MetricsCollector
{
public:
    MetricsCollector();
    ~MetricsCollector();

    void initialize();
    void tick();      // called from main loop every poll interval
};

}  // namespace sonobus
}  // namespace map2
