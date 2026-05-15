// T2521-4 — JackBridge cycle-1 skeleton.

#include "JackBridge.h"

#include <cstdio>

#if MAP2_SONOBUS_HAS_JACK
#include <jack/jack.h>
#endif

namespace map2 {
namespace sonobus {

JackBridge::JackBridge(uint32_t sample_rate_hz, uint32_t buffer_size)
    : sample_rate_hz_(sample_rate_hz)
    , buffer_size_(buffer_size)
{
}

JackBridge::~JackBridge()
{
    shutdown();
}

int JackBridge::initialize()
{
#if MAP2_SONOBUS_HAS_JACK
    // Cycle 4: jack_client_open(JACK_CLIENT_NAME), register process callback,
    // create AOO source/sink ports per active stream.
    std::fprintf(stderr, "[jack] JACK build enabled — full bridge lands in cycle 4 (sr=%u buf=%u)\n",
                 sample_rate_hz_, buffer_size_);
    connected_ = true;
    return 0;
#else
    std::fprintf(stderr, "[jack] JACK not in build; running in stub mode (sr=%u buf=%u)\n",
                 sample_rate_hz_, buffer_size_);
    connected_ = false;
    return -1;
#endif
}

void JackBridge::shutdown()
{
#if MAP2_SONOBUS_HAS_JACK
    // Cycle 4: jack_client_close().
#endif
    connected_ = false;
}

}  // namespace sonobus
}  // namespace map2
