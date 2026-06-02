// T2521-4 — JackBridge implementation.
//
// Two compile modes, ONE binary:
//   MAP2_SONOBUS_HAS_JACK=1 → real JACK client + RT process callback.
//   MAP2_SONOBUS_HAS_JACK=0 → degraded no-op (initialize() returns -1).
//
// The RT callback honours docs/architecture/SONOBUS_DAEMON_RT_SAFETY_REVIEW.md
// §4 rule 1: it loads the published StreamTable ONCE (acquire), then for
// each active stream calls AooSource/Sink::process() + jack_port_get_buffer
// and nothing else. No malloc, no lock, no socket, no AOO send/recv.

#include "JackBridge.h"

#include "DaemonConfig.h"

#include <cstdio>
#include <cstring>

#if MAP2_SONOBUS_HAS_JACK
#include <jack/jack.h>
#endif

#if MAP2_SONOBUS_HAS_AOO
#include "aoo.h"
#include "aoo_source.hpp"
#include "aoo_sink.hpp"
#endif

namespace map2 {
namespace sonobus {

namespace {
// Channel ceiling for the per-block stack pointer array. Bounds the
// per-callback stack cost; matches StreamEntry::ports[] width.
constexpr int kMaxStreamChannels = 8;
}  // namespace

JackBridge::JackBridge(uint32_t sample_rate_hz, uint32_t buffer_size)
    : sample_rate_hz_(sample_rate_hz)
    , buffer_size_(buffer_size)
{
}

JackBridge::~JackBridge()
{
    shutdown();
}

#if MAP2_SONOBUS_HAS_JACK

int JackBridge::processTrampoline(uint32_t nframes, void* arg) noexcept
{
    return static_cast<JackBridge*>(arg)->process(nframes);
}

int JackBridge::bufferSizeTrampoline(uint32_t nframes, void* arg) noexcept
{
    // §4 rule 6 — buffer-size changes arrive on JACK's own (non-RT)
    // thread. We do NOT reconfigure AOO inline; AOO tolerates a smaller
    // block than its setup() max, and the daemon is pinned to a fixed
    // quantum in production. Record + return ok.
    auto* self = static_cast<JackBridge*>(arg);
    self->buffer_size_ = nframes;
    return 0;
}

int JackBridge::xrunTrampoline(void* arg) noexcept
{
    // §4 rule 6 — xruns surface on JACK's thread. Just count them; the
    // network thread reads the counter for metrics. We deliberately do
    // NOT call AooSource::reportXRun here (that would require touching
    // the stream set off the published snapshot); a future slice can
    // route the count through the metrics path.
    static_cast<JackBridge*>(arg)->xrun_count_.fetch_add(
        1, std::memory_order_relaxed);
    return 0;
}

// ---------------------------------------------------------------------
// THE RT THREAD. §4 rule 1: zero alloc / lock / syscall.
// ---------------------------------------------------------------------
int JackBridge::process(uint32_t nframes) noexcept
{
    StreamTable* table = stream_table_;
    if (table == nullptr) {
        return 0;
    }

    // (1) Load the published stream set EXACTLY ONCE (acquire) AND pin it
    //     via the hazard pointer so the control thread cannot reclaim it
    //     while we are mid-block. The set is immutable; we walk the whole
    //     block from this one local pointer and NEVER re-load (§3 / §4
    //     rule 1). Guaranteed non-null by StreamTable's invariant. The
    //     matching releaseActive() at block end frees the pin (§4 rule 3).
    const StreamSet* active = table->loadActive();

    // (2) Current NTP time for AOO (RT-safe; reads a clock, no syscall on
    //     the AOO contract). One sample for the whole block.
#if MAP2_SONOBUS_HAS_AOO
    const AooNtpTime t = aoo_getCurrentNtpTime();
#endif

    // (3) For each active stream: gather JACK port buffers into a stack
    //     pointer array and hand them to AOO process(). No heap.
    for (const StreamEntry& entry : *active) {
        const int nch = entry.num_channels < kMaxStreamChannels
                            ? entry.num_channels
                            : kMaxStreamChannels;
        if (nch <= 0) {
            continue;
        }

        float* chan_ptrs[kMaxStreamChannels];
        for (int ch = 0; ch < nch; ++ch) {
            chan_ptrs[ch] = static_cast<float*>(
                jack_port_get_buffer(
                    static_cast<jack_port_t*>(entry.ports[ch]),
                    nframes));
        }

#if MAP2_SONOBUS_HAS_AOO
        if (entry.direction == StreamDirection::Source && entry.source != nullptr) {
            // engine → peer: read JACK INPUT ports into the AOO source.
            // process() is RT-safe per the AOO contract (§2).
            entry.source->process(
                reinterpret_cast<AooSample**>(chan_ptrs),
                static_cast<AooInt32>(nframes), t);
        } else if (entry.direction == StreamDirection::Sink && entry.sink != nullptr) {
            // peer → engine: pull AOO sink audio into JACK OUTPUT ports.
            // The sink writes directly into the JACK buffers.
            entry.sink->process(
                reinterpret_cast<AooSample**>(chan_ptrs),
                static_cast<AooInt32>(nframes), t, nullptr, nullptr);
        } else
#endif
        {
            // No AOO object (stub mode, or a half-built entry that
            // somehow slipped through) — emit silence on OUTPUT ports so
            // the engine never reads stale buffer contents. INPUT ports
            // are read-only from our side; leave them untouched.
            if (entry.direction == StreamDirection::Sink) {
                for (int ch = 0; ch < nch; ++ch) {
                    std::memset(chan_ptrs[ch], 0, sizeof(float) * nframes);
                }
            }
        }
    }

    // (4) Block end: release the hazard pin so the control thread can
    //     reclaim a retired set we are no longer touching (§4 rule 3).
    table->releaseActive();
    return 0;
}

#endif  // MAP2_SONOBUS_HAS_JACK

int JackBridge::initialize()
{
#if MAP2_SONOBUS_HAS_JACK
    if (stream_table_ == nullptr) {
        std::fprintf(stderr,
                     "[jack] initialize() called before setStreamTable(); "
                     "refusing to install callback\n");
        return -1;
    }

    jack_status_t status = static_cast<jack_status_t>(0);
    jack_client_t* client = jack_client_open(
        JACK_CLIENT_NAME, JackNoStartServer, &status);
    if (client == nullptr) {
        std::fprintf(stderr,
                     "[jack] jack_client_open failed (status=0x%x) — running "
                     "in degraded mode (no audio path)\n",
                     static_cast<unsigned>(status));
        connected_ = false;
        return -1;
    }
    jack_client_ = client;

    jack_set_process_callback(client, &JackBridge::processTrampoline, this);
    jack_set_buffer_size_callback(client, &JackBridge::bufferSizeTrampoline, this);
    jack_set_xrun_callback(client, &JackBridge::xrunTrampoline, this);

    // Pick up the server's actual sample rate / buffer size.
    sample_rate_hz_ = jack_get_sample_rate(client);
    buffer_size_    = jack_get_buffer_size(client);

    if (int rc = jack_activate(client); rc != 0) {
        std::fprintf(stderr,
                     "[jack] jack_activate failed (rc=%d) — degraded mode\n", rc);
        jack_client_close(client);
        jack_client_ = nullptr;
        connected_ = false;
        return -1;
    }

    std::fprintf(stderr,
                 "[jack] connected — client='%s' sr=%u buf=%u (RT callback live)\n",
                 JACK_CLIENT_NAME, sample_rate_hz_, buffer_size_);
    connected_ = true;
    return 0;
#else
    std::fprintf(stderr,
                 "[jack] JACK not compiled in (HAS_JACK=0); degraded mode "
                 "(sr=%u buf=%u) — UDS control plane stays up, audio does "
                 "not move\n",
                 sample_rate_hz_, buffer_size_);
    connected_ = false;
    return -1;
#endif
}

void JackBridge::shutdown()
{
#if MAP2_SONOBUS_HAS_JACK
    if (jack_client_ != nullptr) {
        jack_client_t* client = static_cast<jack_client_t*>(jack_client_);
        // Deactivate first so the process callback can no longer fire,
        // then close. Ports are unregistered implicitly by close.
        jack_deactivate(client);
        jack_client_close(client);
        jack_client_ = nullptr;
    }
#endif
    connected_ = false;
}

bool JackBridge::createPorts(StreamEntry& entry) noexcept
{
#if MAP2_SONOBUS_HAS_JACK
    if (jack_client_ == nullptr) {
        return false;
    }
    jack_client_t* client = static_cast<jack_client_t*>(jack_client_);

    const int nch = entry.num_channels < kMaxStreamChannels
                        ? entry.num_channels
                        : kMaxStreamChannels;
    // Source = engine → daemon → peer: we INPUT from JACK.
    // Sink   = peer → daemon → engine: we OUTPUT to JACK.
    const unsigned long flags =
        (entry.direction == StreamDirection::Source) ? JackPortIsInput
                                                     : JackPortIsOutput;
    for (int ch = 0; ch < nch; ++ch) {
        char name[64];
        std::snprintf(name, sizeof(name), "%s_%s_%d_%d",
                      entry.stream_id.c_str(),
                      (entry.direction == StreamDirection::Source) ? "in" : "out",
                      port_name_counter_, ch);
        jack_port_t* port = jack_port_register(
            client, name, JACK_DEFAULT_AUDIO_TYPE, flags, 0);
        if (port == nullptr) {
            // Roll back any ports we already created for this entry.
            for (int j = 0; j < ch; ++j) {
                if (entry.ports[j] != nullptr) {
                    jack_port_unregister(
                        client, static_cast<jack_port_t*>(entry.ports[j]));
                    entry.ports[j] = nullptr;
                }
            }
            std::fprintf(stderr,
                         "[jack] port_register failed for %s\n", name);
            return false;
        }
        entry.ports[ch] = port;
    }
    ++port_name_counter_;
    return true;
#else
    (void) entry;
    return false;
#endif
}

void JackBridge::destroyPorts(StreamEntry& entry) noexcept
{
#if MAP2_SONOBUS_HAS_JACK
    if (jack_client_ == nullptr) {
        return;
    }
    jack_client_t* client = static_cast<jack_client_t*>(jack_client_);
    for (int ch = 0; ch < kMaxStreamChannels; ++ch) {
        if (entry.ports[ch] != nullptr) {
            jack_port_unregister(
                client, static_cast<jack_port_t*>(entry.ports[ch]));
            entry.ports[ch] = nullptr;
        }
    }
#else
    (void) entry;
#endif
}

}  // namespace sonobus
}  // namespace map2
