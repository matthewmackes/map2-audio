// T2521-4 — AooTransport implementation.
//
// Real path (MAP2_SONOBUS_HAS_AOO=1) mirrors vendor/aoo/examples/cpp/
// simple_sender.cpp + simple_receiver.cpp: an AooClient owns the UDP
// socket; AooSource / AooSink objects are added to it; the client's
// send()/receive() loops run on the network thread (our poll()).
//
// Threading map (docs/architecture/SONOBUS_DAEMON_RT_SAFETY_REVIEW.md §2/§3):
//   - AooSource/Sink::process()  → RT (JACK callback, in JackBridge.cpp).
//   - AooClient::send()/receive()→ network thread (poll(), here).
//   - createSource/createSink    → control thread; ALLOC ok (§4 rule 2);
//     publishes a new StreamSet into the StreamTable (§4 rule 3).

#include "AooTransport.h"
#include "JackBridge.h"
#include "DaemonConfig.h"

#include <cstdio>

#if MAP2_SONOBUS_HAS_AOO
#include <map>
#include <sstream>

#include "aoo.h"
#include "aoo_source.hpp"
#include "aoo_sink.hpp"
#include "aoo_client.hpp"
#include "codec/aoo_pcm.h"
#endif

namespace map2 {
namespace sonobus {

#if MAP2_SONOBUS_HAS_AOO

namespace {
// Per-stream channel count. v1 ships stereo streams; the StreamEntry +
// JACK-port arrays support up to 8 (see StreamTable.h / JackBridge).
constexpr int kStreamChannels = 2;

// Network-thread pump timeout. Short, non-blocking-ish slices so poll()
// stays responsive to the 50ms main loop without busy-spinning.
constexpr double kPumpTimeoutSeconds = 0.0;  // return immediately if idle
}  // namespace

struct AooTransport::Impl
{
    AooClient::Ptr client;

    // stream_id → AOO object. Owns the AOO source/sink lifetime; the
    // StreamEntry in the published table holds a NON-OWNING raw pointer.
    std::map<std::string, AooSource::Ptr> sources;
    std::map<std::string, AooSink::Ptr>   sinks;

    // Monotonic AOO id allocator (each source/sink needs a distinct id).
    AooId next_id = 1;
};

#endif  // MAP2_SONOBUS_HAS_AOO

AooTransport::AooTransport(uint16_t port_base, uint16_t port_count)
    : port_base_(port_base)
    , port_count_(port_count)
{
}

AooTransport::~AooTransport()
{
    shutdown();
}

void AooTransport::setJackBridge(JackBridge* bridge) noexcept
{
    jack_ = bridge;
}

int AooTransport::initialize()
{
#if MAP2_SONOBUS_HAS_AOO
    if (initialized_) {
        return 0;
    }
    // Initialize the AOO library once per process.
    if (aoo_initialize(nullptr) != kAooOk) {
        std::fprintf(stderr, "[aoo] aoo_initialize failed\n");
        return -1;
    }

    impl_ = std::make_unique<Impl>();
    impl_->client = AooClient::create();
    if (!impl_->client) {
        std::fprintf(stderr, "[aoo] AooClient::create failed\n");
        aoo_terminate();
        return -1;
    }

    AooClientSettings settings;
    settings.portNumber = port_base_;
    if (auto err = impl_->client->setup(settings); err != kAooOk) {
        std::fprintf(stderr,
                     "[aoo] AooClient::setup(port=%u) failed: %s — running "
                     "without transport (UDS still up)\n",
                     port_base_, aoo_strerror(err));
        impl_->client.reset();
        impl_.reset();
        aoo_terminate();
        return -1;
    }

    initialized_ = true;
    std::fprintf(stderr,
                 "[aoo] initialized — AooClient bound to UDP port %u "
                 "(range %u-%u reserved)\n",
                 port_base_, port_base_, port_base_ + port_count_ - 1);
    return 0;
#else
    initialized_ = true;  // stub considers itself "initialized" so the
                          // supervisor's hello frame can report ready.
    std::fprintf(stderr,
                 "[aoo] STUB MODE — no transport. Bench operator vendors AOO "
                 "source to flip to full transport (port range %u-%u "
                 "reserved).\n",
                 port_base_, port_base_ + port_count_ - 1);
    return 0;
#endif
}

void AooTransport::poll()
{
#if MAP2_SONOBUS_HAS_AOO
    // Network thread (the daemon main loop calls this). Do all UDP I/O +
    // event handling here — NEVER on the JACK callback (§2/§3).
    if (initialized_ && impl_ && impl_->client) {
        // send() flushes outgoing AOO packets; receive() reads + dispatches
        // incoming ones (which internally calls handleMessage on the
        // matching source/sink). Both return kAooErrorWouldBlock when idle.
        impl_->client->send(kPumpTimeoutSeconds);
        impl_->client->receive(kPumpTimeoutSeconds);
        impl_->client->run(kPumpTimeoutSeconds);
        // Reclaim any retired stream tables now that more swaps may have
        // advanced the grace clock (cheap; control-thread only).
        stream_table_.drainRetired(/*force=*/false);
    }
#endif
}

void AooTransport::shutdown()
{
#if MAP2_SONOBUS_HAS_AOO
    if (impl_) {
        // Destroy ports for every live stream, then drop the AOO objects.
        if (jack_ != nullptr) {
            // Publish an empty table first so the RT callback stops
            // touching any stream, THEN free ports/objects after a grace
            // period. (At shutdown the JACK client is normally already
            // deactivated by DaemonServer, but we stay defensive.)
            stream_table_.publish(std::make_unique<StreamSet>());
            stream_table_.drainRetired(/*force=*/true);
            for (auto& [id, src] : impl_->sources) {
                (void) src;
                StreamEntry tmp;
                tmp.stream_id = id;
                tmp.direction = StreamDirection::Source;
                tmp.num_channels = kStreamChannels;
                jack_->destroyPorts(tmp);
            }
            for (auto& [id, snk] : impl_->sinks) {
                (void) snk;
                StreamEntry tmp;
                tmp.stream_id = id;
                tmp.direction = StreamDirection::Sink;
                tmp.num_channels = kStreamChannels;
                jack_->destroyPorts(tmp);
            }
        }
        impl_->sources.clear();
        impl_->sinks.clear();
        if (impl_->client) {
            impl_->client->stop();
            impl_->client.reset();
        }
        impl_.reset();
        aoo_terminate();
    }
#endif
    initialized_ = false;
}

#if MAP2_SONOBUS_HAS_AOO

bool AooTransport::rebuildAndPublish()
{
    // Build a brand-new immutable StreamSet from the current registries
    // (control thread; allocation here is fine — §4 rule 2). The JACK
    // ports were already created by the caller into the registry's
    // StreamEntry; we re-derive the published view from the live objects.
    auto next = std::make_unique<StreamSet>();
    next->reserve(impl_->sources.size() + impl_->sinks.size());

    for (auto& [id, src] : impl_->sources) {
        StreamEntry entry;
        entry.stream_id = id;
        entry.direction = StreamDirection::Source;
        entry.source = src.get();
        entry.num_channels = kStreamChannels;
        entry.aoo_channels = kStreamChannels;
        // Ports were stamped into port_registry_ at create time; we keep
        // a parallel registry below.
        auto pit = port_registry_.find(id);
        if (pit != port_registry_.end()) {
            for (int ch = 0; ch < kStreamChannels && ch < 8; ++ch) {
                entry.ports[ch] = pit->second.ports[ch];
            }
        }
        next->push_back(std::move(entry));
    }
    for (auto& [id, snk] : impl_->sinks) {
        StreamEntry entry;
        entry.stream_id = id;
        entry.direction = StreamDirection::Sink;
        entry.sink = snk.get();
        entry.num_channels = kStreamChannels;
        entry.aoo_channels = kStreamChannels;
        auto pit = port_registry_.find(id);
        if (pit != port_registry_.end()) {
            for (int ch = 0; ch < kStreamChannels && ch < 8; ++ch) {
                entry.ports[ch] = pit->second.ports[ch];
            }
        }
        next->push_back(std::move(entry));
    }

    // Atomic-swap publish + deferred-free of the old set (§4 rule 3).
    stream_table_.publish(std::move(next));
    return true;
}

#endif  // MAP2_SONOBUS_HAS_AOO

TransportResult AooTransport::createSource(const std::string& stream_id)
{
#if MAP2_SONOBUS_HAS_AOO
    if (!initialized_ || !impl_) return TransportResult::NotInitialized;
    if (stream_id.empty()) return TransportResult::InvalidArgument;
    if (impl_->sources.count(stream_id) || impl_->sinks.count(stream_id)) {
        return TransportResult::Ok;  // idempotent: already exists
    }

    // 1. Create JACK INPUT ports for this stream (control thread).
    StreamEntry port_entry;
    port_entry.stream_id = stream_id;
    port_entry.direction = StreamDirection::Source;
    port_entry.num_channels = kStreamChannels;
    if (jack_ == nullptr || !jack_->createPorts(port_entry)) {
        // No JACK (degraded mode) — we still create the AOO source so the
        // transport can run headless, but there are no ports to wire.
        // Treat absence of JACK as a soft port-alloc failure ONLY when a
        // bridge was expected; otherwise proceed portless.
        if (jack_ != nullptr && jack_->isConnected()) {
            return TransportResult::PortAllocationFailed;
        }
    }

    // 2. Create + setup the AOO source. setFormat starts a PCM stream.
    AooId id = impl_->next_id++;
    AooSource::Ptr source = AooSource::create(id);
    if (!source) {
        if (jack_ != nullptr) jack_->destroyPorts(port_entry);
        return TransportResult::PortAllocationFailed;
    }
    // Use the JACK buffer size as the AOO max block size.
    const int block = jack_ != nullptr ? static_cast<int>(jack_->bufferSize())
                                        : static_cast<int>(DEFAULT_BUFFER_SIZE);
    source->setup(kStreamChannels, static_cast<AooSampleRate>(
                      jack_ != nullptr ? jack_->sampleRateHz()
                                       : DEFAULT_SAMPLE_RATE_HZ),
                  block, 0);
    AooFormatPcm fmt;
    AooFormatPcm_init(&fmt, kStreamChannels,
                      static_cast<AooSampleRate>(
                          jack_ != nullptr ? jack_->sampleRateHz()
                                           : DEFAULT_SAMPLE_RATE_HZ),
                      block, kAooPcmFloat32);
    source->setFormat(fmt.header);

    impl_->client->addSource(source.get());
    source->startStream(0, nullptr);

    // 3. Record the source + its ports, then atomic-swap publish.
    PortRecord rec;
    for (int ch = 0; ch < kStreamChannels && ch < 8; ++ch) {
        rec.ports[ch] = port_entry.ports[ch];
    }
    port_registry_[stream_id] = rec;
    impl_->sources[stream_id] = std::move(source);
    rebuildAndPublish();
    return TransportResult::Ok;
#else
    (void) stream_id;
    return TransportResult::Unavailable;
#endif
}

TransportResult AooTransport::destroySource(const std::string& stream_id)
{
#if MAP2_SONOBUS_HAS_AOO
    if (!initialized_ || !impl_) return TransportResult::NotInitialized;
    auto it = impl_->sources.find(stream_id);
    if (it == impl_->sources.end()) {
        return TransportResult::Ok;  // idempotent
    }

    // Stop the stream + remove from the client BEFORE freeing.
    it->second->stopStream(0);
    impl_->client->removeSource(it->second.get());

    // 1. Drop the entry from the registry and re-publish WITHOUT it. The
    //    StreamTable defers the old set's free, so the RT callback can no
    //    longer reach this source by the time we destroy it.
    impl_->sources.erase(it);
    rebuildAndPublish();
    // Force a grace drain so the prior table (which referenced this
    // source) is reclaimed before we tear the AOO object + ports down.
    stream_table_.publish(std::make_unique<StreamSet>(*stream_table_.peek()));
    stream_table_.drainRetired(/*force=*/true);

    // 2. Now safe to release ports + AOO object (the source Ptr's
    //    destructor ran on erase()).
    auto pit = port_registry_.find(stream_id);
    if (pit != port_registry_.end()) {
        StreamEntry tmp;
        tmp.stream_id = stream_id;
        tmp.direction = StreamDirection::Source;
        tmp.num_channels = kStreamChannels;
        for (int ch = 0; ch < kStreamChannels && ch < 8; ++ch) {
            tmp.ports[ch] = pit->second.ports[ch];
        }
        if (jack_ != nullptr) jack_->destroyPorts(tmp);
        port_registry_.erase(pit);
    }
    return TransportResult::Ok;
#else
    (void) stream_id;
    return TransportResult::Unavailable;
#endif
}

TransportResult AooTransport::createSink(const std::string& stream_id)
{
#if MAP2_SONOBUS_HAS_AOO
    if (!initialized_ || !impl_) return TransportResult::NotInitialized;
    if (stream_id.empty()) return TransportResult::InvalidArgument;
    if (impl_->sources.count(stream_id) || impl_->sinks.count(stream_id)) {
        return TransportResult::Ok;  // idempotent
    }

    // 1. Create JACK OUTPUT ports for this stream.
    StreamEntry port_entry;
    port_entry.stream_id = stream_id;
    port_entry.direction = StreamDirection::Sink;
    port_entry.num_channels = kStreamChannels;
    if (jack_ == nullptr || !jack_->createPorts(port_entry)) {
        if (jack_ != nullptr && jack_->isConnected()) {
            return TransportResult::PortAllocationFailed;
        }
    }

    // 2. Create + setup the AOO sink.
    AooId id = impl_->next_id++;
    AooSink::Ptr sink = AooSink::create(id);
    if (!sink) {
        if (jack_ != nullptr) jack_->destroyPorts(port_entry);
        return TransportResult::PortAllocationFailed;
    }
    const int block = jack_ != nullptr ? static_cast<int>(jack_->bufferSize())
                                        : static_cast<int>(DEFAULT_BUFFER_SIZE);
    sink->setup(kStreamChannels, static_cast<AooSampleRate>(
                    jack_ != nullptr ? jack_->sampleRateHz()
                                     : DEFAULT_SAMPLE_RATE_HZ),
                block, 0);
    impl_->client->addSink(sink.get());

    PortRecord rec;
    for (int ch = 0; ch < kStreamChannels && ch < 8; ++ch) {
        rec.ports[ch] = port_entry.ports[ch];
    }
    port_registry_[stream_id] = rec;
    impl_->sinks[stream_id] = std::move(sink);
    rebuildAndPublish();
    return TransportResult::Ok;
#else
    (void) stream_id;
    return TransportResult::Unavailable;
#endif
}

TransportResult AooTransport::destroySink(const std::string& stream_id)
{
#if MAP2_SONOBUS_HAS_AOO
    if (!initialized_ || !impl_) return TransportResult::NotInitialized;
    auto it = impl_->sinks.find(stream_id);
    if (it == impl_->sinks.end()) {
        return TransportResult::Ok;  // idempotent
    }

    impl_->client->removeSink(it->second.get());
    impl_->sinks.erase(it);
    rebuildAndPublish();
    stream_table_.publish(std::make_unique<StreamSet>(*stream_table_.peek()));
    stream_table_.drainRetired(/*force=*/true);

    auto pit = port_registry_.find(stream_id);
    if (pit != port_registry_.end()) {
        StreamEntry tmp;
        tmp.stream_id = stream_id;
        tmp.direction = StreamDirection::Sink;
        tmp.num_channels = kStreamChannels;
        for (int ch = 0; ch < kStreamChannels && ch < 8; ++ch) {
            tmp.ports[ch] = pit->second.ports[ch];
        }
        if (jack_ != nullptr) jack_->destroyPorts(tmp);
        port_registry_.erase(pit);
    }
    return TransportResult::Ok;
#else
    (void) stream_id;
    return TransportResult::Unavailable;
#endif
}

}  // namespace sonobus
}  // namespace map2
