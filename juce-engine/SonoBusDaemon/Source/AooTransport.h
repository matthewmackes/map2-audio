// T2521-4 — AooTransport: thin C++ wrapper around the AOO source/sink
// runtime. Cycle 1 ships the API shape; cycle 3 lands the full bridging.
//
// Stub mode (MAP2_SONOBUS_HAS_AOO=0): every transport call returns
// E_AOO_UNAVAILABLE. Same API, same shape — backend supervisor can
// connect + drive the daemon for lifecycle tests, audio just doesn't
// move. Bench operator vendors AOO source to flip to full mode.

#pragma once

#include <cstdint>
#include <string>

namespace map2 {
namespace sonobus {

// AOO transport error codes (mirrored on the supervisor side via UDS).
enum class TransportResult
{
    Ok = 0,
    Unavailable = -1,         // stub mode; AOO not vendored
    NotInitialized = -2,
    PortAllocationFailed = -3,
    PeerNotFound = -4,
    InvalidArgument = -5,
};

class AooTransport
{
public:
    AooTransport(uint16_t port_base, uint16_t port_count);
    ~AooTransport();

    int initialize();    // 0 on success; -1 in stub mode is normal
    void poll();         // pump AOO events
    void shutdown();

    // Source/sink lifecycle (cycle 3).
    TransportResult createSource(const std::string& stream_id);
    TransportResult destroySource(const std::string& stream_id);
    TransportResult createSink(const std::string& stream_id);
    TransportResult destroySink(const std::string& stream_id);

private:
    uint16_t port_base_;
    uint16_t port_count_;
    bool initialized_ = false;
};

}  // namespace sonobus
}  // namespace map2
