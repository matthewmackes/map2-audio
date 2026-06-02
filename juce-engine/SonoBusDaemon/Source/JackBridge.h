// T2521-4 — JackBridge: the daemon's JACK client + RT process callback.
//
// The JACK process callback is the daemon's ONE real-time thread (a
// SEPARATE process from the JUCE engine; see
// docs/architecture/SONOBUS_DAEMON_RT_SAFETY_REVIEW.md §1). Per §3/§4 the
// callback does ONLY:
//   - read the published StreamTable snapshot ONCE via acquire-load
//   - for each active stream: AooSource::process() / AooSink::process()
//     + jack_port_get_buffer() + memcpy
// NO send/recv/socket/malloc/lock on the callback (§4 rule 1).
//
// Port CREATION/DESTRUCTION runs on the control thread (createPorts /
// destroyPorts), never the callback (§4 rule 2). The callback observes
// only the immutable published StreamTable.
//
// When JACK headers/lib are absent (MAP2_SONOBUS_HAS_JACK=0) the bridge
// compiles to a degraded no-op: initialize() returns -1 and no callback
// is ever installed (§4 rule 7).

#pragma once

#include <atomic>
#include <cstdint>
#include <string>
#include <vector>

#include "StreamTable.h"

namespace map2 {
namespace sonobus {

class JackBridge
{
public:
    JackBridge(uint32_t sample_rate_hz, uint32_t buffer_size);
    ~JackBridge();

    JackBridge(const JackBridge&)            = delete;
    JackBridge& operator=(const JackBridge&) = delete;

    // Wire the shared StreamTable the RT callback reads. MUST be called
    // (with a non-null table) before initialize() installs the callback.
    // The table is owned by AooTransport; JackBridge holds a borrowed ptr.
    void setStreamTable(StreamTable* table) noexcept { stream_table_ = table; }

    // Returns 0 on success; -1 if JACK server unreachable OR JACK was not
    // compiled in. The daemon tolerates -1 (degraded mode — UDS still
    // works, audio doesn't move).
    int initialize();
    void shutdown();

    // True iff a JACK client is connected and the process callback is live.
    bool isConnected() const noexcept { return connected_; }

    // ------------------------------------------------------------------
    // Control-thread port lifecycle (§4 rule 2). Called by AooTransport
    // when a stream is created / destroyed. NEVER from the RT callback.
    // ------------------------------------------------------------------

    // Create `num_channels` JACK ports for `stream_id` in `direction`,
    // filling entry.ports[] / entry.num_channels. Source streams get
    // INPUT ports (engine → daemon); Sink streams get OUTPUT ports
    // (daemon → engine). Returns true on success. No-op + false in
    // degraded mode.
    bool createPorts(StreamEntry& entry) noexcept;

    // Unregister the JACK ports recorded in `entry`. Control thread only;
    // call only after the stream has been removed from the published
    // StreamTable AND a grace period has elapsed (the StreamTable's
    // deferred-free discipline guarantees the callback dropped the entry).
    void destroyPorts(StreamEntry& entry) noexcept;

    uint32_t sampleRateHz() const noexcept { return sample_rate_hz_; }
    uint32_t bufferSize()   const noexcept { return buffer_size_; }

private:
#if MAP2_SONOBUS_HAS_JACK
    // The JACK process callback (RT thread). Static trampoline → member.
    static int processTrampoline(uint32_t nframes, void* arg) noexcept;
    int process(uint32_t nframes) noexcept;

    // JACK delivers xrun/buffer-size on its own (non-RT) thread.
    static int bufferSizeTrampoline(uint32_t nframes, void* arg) noexcept;
    static int xrunTrampoline(void* arg) noexcept;
#endif

    uint32_t sample_rate_hz_;
    uint32_t buffer_size_;
    bool     connected_ = false;

    // Borrowed (owned by AooTransport). Read in the RT callback.
    StreamTable* stream_table_ = nullptr;

#if MAP2_SONOBUS_HAS_JACK
    void* jack_client_ = nullptr;  // jack_client_t* (opaque here)
    // Monotonic xrun counter the network thread can read for metrics.
    std::atomic<uint64_t> xrun_count_{0};
#endif

    // Total channels of JACK ports created so far — used to give each
    // port a unique name suffix. Control-thread only.
    int port_name_counter_ = 0;
};

}  // namespace sonobus
}  // namespace map2
