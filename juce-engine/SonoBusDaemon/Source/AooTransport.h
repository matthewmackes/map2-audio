// T2521-4 — AooTransport: C++ wrapper around the AOO source/sink runtime.
//
// Build-mode switch:
//   MAP2_SONOBUS_HAS_AOO=1 → real AOO: aoo_initialize + an AooClient that
//     owns the UDP socket, plus AooSource/AooSink objects keyed by
//     stream_id. createSource/createSink ALLOCATE here (control / network
//     thread — never the RT callback, §4 rule 2) and publish a fresh
//     StreamSet into the shared StreamTable via atomic-swap + deferred-free
//     (§4 rule 3). poll() is the network-thread pump: AooClient::send() +
//     receive() do the UDP I/O (syscalls), off the JACK callback (§2/§3).
//   MAP2_SONOBUS_HAS_AOO=0 → stub: every transport call returns
//     TransportResult::Unavailable; the StreamTable stays empty. The UDS
//     control plane works identically. Same binary, same API.
//
// The AooTransport header API is STABLE across both modes (DaemonServer +
// the UDS handlers call it identically).

#pragma once

#include <cstdint>
#include <map>
#include <memory>
#include <string>

#include "StreamTable.h"

namespace map2 {
namespace sonobus {

class JackBridge;

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

    AooTransport(const AooTransport&)            = delete;
    AooTransport& operator=(const AooTransport&) = delete;

    // Wire the JACK bridge so createSource/createSink can register ports.
    // Must be set before initialize(); the StreamTable is shared with the
    // bridge here. JackBridge is borrowed (owned by DaemonServer).
    void setJackBridge(JackBridge* bridge) noexcept;

    // The shared StreamTable the JACK callback reads. Owned by
    // AooTransport. DaemonServer wires it into JackBridge::setStreamTable.
    StreamTable* streamTable() noexcept { return &stream_table_; }

    int initialize();    // 0 on success; -1 in stub mode is normal
    void poll();         // network-thread pump: send + receive + events
    void shutdown();

    // Source/sink lifecycle (control/network thread, never RT).
    TransportResult createSource(const std::string& stream_id);
    TransportResult destroySource(const std::string& stream_id);
    TransportResult createSink(const std::string& stream_id);
    TransportResult destroySink(const std::string& stream_id);

private:
    uint16_t port_base_;
    uint16_t port_count_;
    bool initialized_ = false;

    JackBridge* jack_ = nullptr;

    // The shared, RT-safe active-stream table. Published-to here (control
    // thread); read by the JACK callback. §3 / §4 rule 3.
    StreamTable stream_table_;

#if MAP2_SONOBUS_HAS_AOO
    // PIMPL so the AOO C++ headers don't leak into this header (keeps the
    // stub-mode TU free of AOO includes). Defined in AooTransport.cpp.
    struct Impl;
    std::unique_ptr<Impl> impl_;

    // Control-thread record of the JACK ports created for each stream, so
    // rebuildAndPublish() can re-stamp them into the published StreamSet
    // and destroy*() can unregister them. Keyed by stream_id. Never read
    // on the RT callback (the published StreamSet carries the live copy).
    struct PortRecord { void* ports[8] = {nullptr}; };
    std::map<std::string, PortRecord> port_registry_;

    // Rebuild + publish a fresh StreamSet from the current source/sink
    // registries. Control-thread only. Returns false on port-alloc fail.
    bool rebuildAndPublish();
#endif
};

}  // namespace sonobus
}  // namespace map2
