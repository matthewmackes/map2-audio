// T2521-4 — AooTransport cycle-1 skeleton.
//
// Build-mode switch: MAP2_SONOBUS_HAS_AOO=1 wires real AOO calls (cycle 3),
// MAP2_SONOBUS_HAS_AOO=0 returns TransportResult::Unavailable for every
// transport API.

#include "AooTransport.h"

#include <cstdio>

#if MAP2_SONOBUS_HAS_AOO
// AOO headers land in cycle 3 once vendor/aoo/ has the actual source tree.
// #include <aoo/aoo_source.hpp>
// #include <aoo/aoo_sink.hpp>
#endif

namespace map2 {
namespace sonobus {

AooTransport::AooTransport(uint16_t port_base, uint16_t port_count)
    : port_base_(port_base)
    , port_count_(port_count)
{
}

AooTransport::~AooTransport()
{
    shutdown();
}

int AooTransport::initialize()
{
#if MAP2_SONOBUS_HAS_AOO
    // Cycle 3 work: aoo::initialize(), allocate UDP socket on port_base_,
    // register peer-discovery handler.
    initialized_ = true;
    std::fprintf(stderr, "[aoo] initialized — full transport (port range %u-%u)\n",
                 port_base_, port_base_ + port_count_ - 1);
    return 0;
#else
    initialized_ = true;  // stub considers itself "initialized" so the
                          // supervisor's hello frame can report ready.
    std::fprintf(stderr,
                 "[aoo] STUB MODE — no transport. Bench operator vendors AOO source "
                 "to flip to full transport (port range %u-%u reserved).\n",
                 port_base_, port_base_ + port_count_ - 1);
    return 0;
#endif
}

void AooTransport::poll()
{
#if MAP2_SONOBUS_HAS_AOO
    // Cycle 3: drain AOO event queue (peer-up, peer-down, drop, etc.)
#endif
}

void AooTransport::shutdown()
{
    initialized_ = false;
}

TransportResult AooTransport::createSource(const std::string& stream_id)
{
    (void) stream_id;
#if MAP2_SONOBUS_HAS_AOO
    if (! initialized_) return TransportResult::NotInitialized;
    // Cycle 3.
    return TransportResult::Ok;
#else
    return TransportResult::Unavailable;
#endif
}

TransportResult AooTransport::destroySource(const std::string& stream_id)
{
    (void) stream_id;
#if MAP2_SONOBUS_HAS_AOO
    return TransportResult::Ok;
#else
    return TransportResult::Unavailable;
#endif
}

TransportResult AooTransport::createSink(const std::string& stream_id)
{
    (void) stream_id;
#if MAP2_SONOBUS_HAS_AOO
    return TransportResult::Ok;
#else
    return TransportResult::Unavailable;
#endif
}

TransportResult AooTransport::destroySink(const std::string& stream_id)
{
    (void) stream_id;
#if MAP2_SONOBUS_HAS_AOO
    return TransportResult::Ok;
#else
    return TransportResult::Unavailable;
#endif
}

}  // namespace sonobus
}  // namespace map2
