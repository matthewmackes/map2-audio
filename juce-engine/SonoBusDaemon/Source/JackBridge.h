// T2521-4 — JackBridge: creates JACK ports for each active AOO source/sink
// and shuttles PCM between the JACK process callback and the AOO transport
// via a lock-free SPSC ring (built in cycle 4).

#pragma once

#include <cstdint>

namespace map2 {
namespace sonobus {

class JackBridge
{
public:
    JackBridge(uint32_t sample_rate_hz, uint32_t buffer_size);
    ~JackBridge();

    // Returns 0 on success; -1 if JACK server unreachable. The daemon
    // tolerates a -1 return (degraded mode — UDS still works, audio
    // doesn't move).
    int initialize();
    void shutdown();

private:
    uint32_t sample_rate_hz_;
    uint32_t buffer_size_;
    bool connected_ = false;
};

}  // namespace sonobus
}  // namespace map2
