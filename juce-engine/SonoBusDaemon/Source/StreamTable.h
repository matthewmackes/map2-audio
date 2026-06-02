// T2521-4 — StreamTable: the shared, RT-safe handoff between the daemon's
// JACK process callback (RT thread) and the AOO transport's control /
// network thread.
//
// This is the daemon analogue of T2511's ChainInputSwitch
// (juce-engine/Source/Recorder/Playback/ChainInputSwitch.h). Same shape,
// different payload: ChainInputSwitch swaps an atomic POINTER to a single
// source; StreamTable swaps an atomic POINTER to an immutable VECTOR of
// active streams.
//
// RT-safety contract (docs/architecture/SONOBUS_DAEMON_RT_SAFETY_REVIEW.md
// §3, §4 rules 1-3):
//   - JACK callback (RT): publishedTable_.load(acquire) EXACTLY ONCE at
//     buffer start into a local pointer; walk the whole buffer from that
//     local. The atomic is NEVER re-loaded mid-block, NEVER mutated, and
//     the table it points to is IMMUTABLE for the callback. No alloc, no
//     lock, no syscall (§4 rule 1).
//   - Control / network thread: build a brand-new StreamSet off-thread
//     (allocation is fine HERE — never the callback, §4 rule 2), then
//     publish() it with a release CAS. The old table is RETURNED to the
//     caller for deferred reclamation (§4 rule 3) — it is NEVER deleted
//     inline because the callback may still hold it in its per-buffer
//     local. retire() pushes the old table onto an internal grace-period
//     queue that the control thread drains at least one audio period
//     after the swap is observed (the RCU grace-period analogue).
//   - acquire/release pairing: a StreamSet is fully constructed before
//     the publishing CAS's release store; the callback's acquire load
//     therefore only ever observes a complete, immutable set (§3, §4
//     rule 3). The callback sees either the old set or the new set,
//     never a torn / half-built one.
//
// Ownership: each StreamEntry holds NON-OWNING pointers to the AOO
// source/sink objects (owned by AooTransport) and the JACK port handles
// (owned by JackBridge). StreamTable owns only the StreamSet vectors it
// allocates; reclamation is via the deferred-free queue.

#pragma once

#include <atomic>
#include <cstdint>
#include <memory>
#include <string>
#include <vector>

// Forward-declare the AOO C++ interfaces so this header compiles in BOTH
// modes (MAP2_SONOBUS_HAS_AOO=0 and =1). In stub mode the pointers are
// always null; the JACK callback simply finds an empty active set.
struct AooSource;
struct AooSink;

namespace map2 {
namespace sonobus {

// Direction of a stream relative to the local engine.
enum class StreamDirection : uint8_t
{
    // engine → peer: the daemon reads engine audio from JACK INPUT ports
    // and feeds it into an AooSource (which sends it over UDP).
    Source = 0,
    // peer → engine: the daemon pulls peer audio from an AooSink and
    // writes it to JACK OUTPUT ports (which the engine reads).
    Sink = 1,
};

// One active stream as the RT callback sees it. Immutable once published.
// All pointers are NON-OWNING — owned by AooTransport (AOO objects) and
// JackBridge (port handles).
struct StreamEntry
{
    std::string    stream_id;
    StreamDirection direction = StreamDirection::Source;

    // Exactly one of source / sink is non-null, per `direction`.
    AooSource*     source = nullptr;   // direction == Source
    AooSink*       sink   = nullptr;   // direction == Sink

    // JACK ports for this stream. The void* avoids leaking <jack/jack.h>
    // into this header (JackBridge reinterpret_casts them back to
    // jack_port_t*). Non-owning; JackBridge owns port lifetime.
    int            num_channels = 0;
    void*          ports[8] = {nullptr};  // up to DEFAULT_MAX_CHANNELS/4

    // Number of channels AOO setup() was given (mirrors num_channels but
    // kept explicit so the callback never reads a half-set field).
    int            aoo_channels = 0;
};

// An immutable snapshot of the active stream set. The control thread
// builds a fresh one and publishes it; the RT callback reads it.
using StreamSet = std::vector<StreamEntry>;

class StreamTable
{
public:
    StreamTable()
    {
        // Publish an empty set so the callback always observes a valid
        // (non-null) pointer — it never has to null-check the table.
        auto* empty = new StreamSet();
        published_.store(empty, std::memory_order_release);
    }

    ~StreamTable()
    {
        // Daemon teardown: both threads are stopped by now (JACK client
        // closed, network thread joined). Free the live table + anything
        // still parked in the retire queue.
        delete published_.load(std::memory_order_acquire);
        drainRetired(/*force=*/true);
    }

    StreamTable(const StreamTable&)            = delete;
    StreamTable& operator=(const StreamTable&) = delete;

    // ------------------------------------------------------------------
    // RT-thread API (JACK process callback). The ONLY methods the callback
    // calls. Both are RT-safe: pure atomic loads/stores — no alloc, lock,
    // or syscall (§4 rule 1).
    //
    // Reclamation safety uses a single-reader HAZARD POINTER, not a
    // publish-count grace period. The JACK callback is the daemon's ONE
    // RT reader (§4 rule 4); it publishes the set it is about to read into
    // a hazard slot, so the control thread's drainRetired() can never free
    // a set the callback is mid-block on. This is sound even under an
    // unpaced publish storm (a publish-count grace period is NOT — a fast
    // publisher laps the reader and frees underneath it).
    // ------------------------------------------------------------------

    /// Acquire-load the live stream set AND publish it as the hazard
    /// pointer in one step, so the control thread cannot reclaim it while
    /// the callback holds it. The callback MUST hold the returned pointer
    /// in a per-buffer local, walk the whole block from it (NEVER re-load
    /// mid-block — §3 / §4 rule 1), then call releaseActive() at block
    /// end. Guaranteed non-null + immutable.
    const StreamSet* loadActive() const noexcept
    {
        // Hazard-pointer publish-then-validate. The store to hazard_ and
        // the RE-LOAD of published_ MUST be sequentially consistent: a
        // weaker (release store + acquire load) pairing lets the CPU hoist
        // the re-load ABOVE the hazard store, so the control thread could
        // swap + free between our store and the (stale, hoisted) re-load —
        // a use-after-free. seq_cst forbids that reorder by putting the
        // hazard store and the re-load into one global total order shared
        // with publish()'s store + drainRetired()'s hazard load.
        //
        // This is still RT-safe: seq_cst atomics on x86-64 are a plain
        // store + an MFENCE-class barrier — no alloc, no lock, no syscall.
        StreamSet* p = published_.load(std::memory_order_acquire);
        for (;;) {
            hazard_.store(p, std::memory_order_seq_cst);
            StreamSet* again = published_.load(std::memory_order_seq_cst);
            if (again == p) {
                return p;
            }
            p = again;
        }
    }

    /// Clear the hazard pointer at block end (RT-safe). After this, the
    /// set the callback just read becomes eligible for reclamation.
    void releaseActive() const noexcept
    {
        hazard_.store(nullptr, std::memory_order_seq_cst);
    }

    // ------------------------------------------------------------------
    // Control / network-thread API (AooTransport). All mutation here.
    // ------------------------------------------------------------------

    /// Atomically publish `next` (a fully-constructed, heap-allocated
    /// StreamSet that StreamTable takes ownership of) as the live set.
    /// The OLD set is pushed onto the deferred-free queue — NEVER deleted
    /// inline (§4 rule 3), because the RT callback may still hold it.
    ///
    /// Runs on the control thread. Uses compare_exchange in a loop so a
    /// concurrent control caller (there should only be one) can't lose an
    /// update; the audio thread never waits.
    void publish(std::unique_ptr<StreamSet> next) noexcept
    {
        StreamSet* desired  = next.release();
        StreamSet* expected = published_.load(std::memory_order_acquire);
        // seq_cst on the swap so it orders against the reader's hazard
        // store + re-load (loadActive) and drainRetired's hazard load:
        // either the reader sees the new published_ on its re-load (and
        // retries onto the new set) OR drainRetired sees the reader's
        // hazard store (and keeps the old set). The total order rules out
        // the window where neither holds.
        while (!published_.compare_exchange_strong(
                   expected, desired,
                   std::memory_order_seq_cst,
                   std::memory_order_seq_cst)) {
            // expected reloaded with the current value; retry.
        }
        retire(expected);
        // Reclaim any retired set the RT reader is provably no longer
        // holding (hazard pointer doesn't point at it).
        drainRetired(/*force=*/false);
    }

    /// Snapshot of the live set for control-thread introspection / the
    /// rebuild path. NOT for the RT callback (use loadActive there).
    const StreamSet* peek() const noexcept
    {
        return published_.load(std::memory_order_acquire);
    }

    /// Drain reclaimable retired sets. Called automatically from
    /// publish(); also callable from a periodic control-thread tick so
    /// retired sets are freed even when no swap is happening.
    ///
    /// A retired set is freed only when the RT reader's HAZARD POINTER
    /// does NOT point at it — i.e. the JACK callback is provably not
    /// mid-block on it (§4 rule 3, hazard-pointer reclamation). `force`
    /// is used ONLY at teardown, after both threads are stopped, where no
    /// reader can be in flight.
    ///
    /// Control-thread only. Reads the hazard slot with acquire; this pairs
    /// with the reader's release store in loadActive(), giving the
    /// happens-before that makes the "not hazarded ⇒ safe to free"
    /// inference sound.
    void drainRetired(bool force) noexcept
    {
        // seq_cst hazard load: pairs with the reader's seq_cst hazard
        // store + the publish() seq_cst swap so the "not hazarded ⇒ safe
        // to free" inference is sound under the single global total order.
        StreamSet* hazard = force ? nullptr
                                  : hazard_.load(std::memory_order_seq_cst);
        auto it = retired_.begin();
        while (it != retired_.end()) {
            if (force || it->set != hazard) {
                delete it->set;
                it = retired_.erase(it);
            } else {
                ++it;
            }
        }
    }

    /// Number of sets currently parked awaiting reclamation. Tests assert
    /// this stays bounded (no leak) and that no inline delete happened
    /// while a reader was holding the set.
    std::size_t retiredCount() const noexcept { return retired_.size(); }

private:
    struct RetiredSet
    {
        StreamSet* set;
    };

    // Park `old` for deferred reclamation. Control-thread only.
    void retire(StreamSet* old) noexcept
    {
        if (old != nullptr) {
            retired_.push_back(RetiredSet{old});
        }
    }

    // The live, immutable set the RT callback reads. Published with
    // release; loaded with acquire. Always non-null.
    std::atomic<StreamSet*> published_{nullptr};

    // Hazard pointer: the set the single RT reader is currently holding
    // (or nullptr when idle). Reader stores with release in loadActive(),
    // clears in releaseActive(); the control thread reads with acquire in
    // drainRetired() to avoid freeing a hazarded set. `mutable` so the RT
    // const-methods loadActive()/releaseActive() can write it.
    mutable std::atomic<StreamSet*> hazard_{nullptr};

    // Deferred-free queue. Control-thread only — NEVER touched by the RT
    // callback. A std::vector is fine here: all access is off the RT path.
    std::vector<RetiredSet> retired_;
};

}  // namespace sonobus
}  // namespace map2
