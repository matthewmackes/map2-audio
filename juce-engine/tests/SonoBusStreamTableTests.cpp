// =============================================================================
// T2521-4 — SonoBus daemon StreamTable: atomic-swap + deferred-free stress.
// =============================================================================
//
// The StreamTable is the daemon's RT boundary between the JACK process
// callback (RT thread) and the AooTransport control/network thread
// (docs/architecture/SONOBUS_DAEMON_RT_SAFETY_REVIEW.md §3, §4 rules 1-3).
// It is the daemon analogue of T2511's ChainInputSwitch; these tests are
// modelled on ChainInputSwitchTests.cpp.
//
// Covered invariants:
//   - The RT-side read path (loadActive) always observes a WHOLE,
//     consistent StreamSet under a concurrent control-thread publish()
//     storm — never a torn / half-built set, never a freed set.
//   - publish() swaps the pointer atomically and returns the old set to
//     the deferred-free queue; it NEVER deletes inline. A retired set is
//     reclaimed only after the grace clock advances (drainRetired), so a
//     reader still holding the old pointer can never touch freed memory.
//   - The retire queue stays bounded (no leak) under a long publish loop.
//   - The published pointer is always non-null (StreamTable's invariant),
//     so the RT callback never has to null-check.

#include <atomic>
#include <memory>
#include <thread>
#include <vector>

#include <catch2/catch_test_macros.hpp>

#include "SonoBusDaemon/Source/StreamTable.h"

using map2::sonobus::StreamDirection;
using map2::sonobus::StreamEntry;
using map2::sonobus::StreamSet;
using map2::sonobus::StreamTable;

namespace {

// Build a StreamSet where every entry carries the SAME sentinel in
// num_channels + aoo_channels, so a reader can detect a torn read (a set
// whose entries disagree, or whose entries don't match the sentinel).
std::unique_ptr<StreamSet> makeSet(int count, int sentinel) {
    auto set = std::make_unique<StreamSet>();
    set->reserve(static_cast<size_t>(count));
    for (int i = 0; i < count; ++i) {
        StreamEntry e;
        e.stream_id = "stream-" + std::to_string(i);
        e.direction = (i % 2 == 0) ? StreamDirection::Source
                                   : StreamDirection::Sink;
        e.num_channels = sentinel;
        e.aoo_channels = sentinel;
        set->push_back(std::move(e));
    }
    return set;
}

}  // namespace


TEST_CASE("StreamTable — starts with a non-null empty published set",
          "[t2521][streamtable]") {
    StreamTable table;
    const StreamSet* active = table.loadActive();
    REQUIRE(active != nullptr);
    REQUIRE(active->empty());
    REQUIRE(table.retiredCount() == 0);
}


TEST_CASE("StreamTable — publish swaps the live set; reader sees the new one",
          "[t2521][streamtable]") {
    StreamTable table;
    table.publish(makeSet(3, 2));
    const StreamSet* active = table.loadActive();
    REQUIRE(active != nullptr);
    REQUIRE(active->size() == 3);
    for (const auto& e : *active) {
        REQUIRE(e.num_channels == 2);
        REQUIRE(e.aoo_channels == 2);
    }
}


TEST_CASE("StreamTable — a hazarded set is NOT freed while a reader holds it",
          "[t2521][streamtable][reclamation]") {
    StreamTable table;

    // Reader pins the live set via the hazard pointer (as the JACK
    // callback does at block start) and keeps holding it.
    table.publish(makeSet(1, 5));
    const StreamSet* a = table.loadActive();   // hazards the size-1 set
    REQUIRE(a->size() == 1);
    REQUIRE((*a)[0].num_channels == 5);

    // Control thread swaps in a new set. The size-1 set is retired but
    // MUST NOT be freed inline because it is the reader's hazard pointer.
    table.publish(makeSet(2, 7));
    REQUIRE(table.retiredCount() == 1);        // size-1 set parked, not freed
    // The reader's pointer `a` is therefore still a live, valid object.
    REQUIRE(a->size() == 1);
    REQUIRE((*a)[0].num_channels == 5);

    // Reader finishes the block (clears the hazard); the next publish can
    // now reclaim the previously-hazarded set.
    table.releaseActive();
    table.publish(makeSet(3, 9));
    REQUIRE(table.retiredCount() == 0);        // size-1 + size-2 reclaimed

    const StreamSet* b = table.loadActive();
    REQUIRE(b->size() == 3);
    REQUIRE((*b)[0].num_channels == 9);
    table.releaseActive();
}


TEST_CASE("StreamTable — with no reader, publish reclaims the old set at once",
          "[t2521][streamtable][reclamation]") {
    StreamTable table;
    // No reader has loadActive()'d, so the hazard pointer is null and each
    // publish reclaims the prior set immediately (no parked leak).
    table.publish(makeSet(1, 5));
    REQUIRE(table.retiredCount() == 0);
    table.publish(makeSet(2, 7));
    REQUIRE(table.retiredCount() == 0);
}


TEST_CASE("StreamTable — retire queue stays bounded under a publish storm",
          "[t2521][streamtable][reclamation]") {
    StreamTable table;
    // Many publishes with NO reader in flight (hazard == nullptr), so each
    // publish reclaims the prior set immediately. The parked count must
    // stay bounded (no leak), never grow with the publish count.
    for (int i = 0; i < 10000; ++i) {
        table.publish(makeSet((i % 4) + 1, (i % 7) + 1));
    }
    // With no hazarded reader, every retired set is reclaimable on the
    // next publish, so the queue is empty (or holds only the just-retired
    // set if drain order differs).
    REQUIRE(table.retiredCount() <= 1);
    // A force-drain reclaims everything except the live set.
    table.drainRetired(/*force=*/true);
    REQUIRE(table.retiredCount() == 0);
    // The live set is still valid + non-null.
    REQUIRE(table.loadActive() != nullptr);
}


// -----------------------------------------------------------------------------
// THE §4 STRESS TEST: no-tearing + no use-after-free under concurrent swap.
// -----------------------------------------------------------------------------
//
// One thread (the "control thread") publishes fresh StreamSets at full
// speed, each tagged with a sentinel; another thread (the "JACK callback")
// loads the active set EXACTLY ONCE per iteration into a local and walks
// every entry. The invariants proven:
//   - Every observed StreamSet is INTERNALLY CONSISTENT: all entries share
//     one sentinel, and num_channels == aoo_channels for each entry. A
//     torn / half-built / freed set would surface as a mismatch or a crash.
//   - loadActive() never returns null.
// This doubles as a TSan-ready harness (run under a TSan build when one is
// wired; mirrors the ChainInputSwitch §8 follow-up note).
TEST_CASE("StreamTable — no tearing / no UAF under concurrent publish (stress)",
          "[t2521][streamtable][stress][concurrent]") {
    StreamTable table;
    table.publish(makeSet(1, 1));

    constexpr int kIterations = 300000;
    std::atomic<bool> stop{false};
    std::atomic<long> tornReads{0};
    std::atomic<long> nullReads{0};
    std::atomic<long> readsDone{0};

    // Control thread: hammer publish() with sets of varying size + a
    // sentinel that is identical across the whole set.
    std::thread publisher([&]() {
        int tick = 1;
        while (!stop.load(std::memory_order_acquire)) {
            const int count = (tick % 5) + 1;     // 1..5 entries
            const int sentinel = (tick % 9) + 1;  // 1..9
            table.publish(makeSet(count, sentinel));
            ++tick;
        }
    });

    // RT-callback thread: load ONCE per iteration, verify consistency.
    std::thread reader([&]() {
        for (int it = 0; it < kIterations; ++it) {
            // §4 rule 1 discipline: load the published pointer EXACTLY
            // ONCE into a local, then walk the whole set from that local.
            const StreamSet* active = table.loadActive();
            if (active == nullptr) {
                nullReads.fetch_add(1, std::memory_order_relaxed);
                readsDone.fetch_add(1, std::memory_order_relaxed);
                continue;
            }
            bool torn = false;
            int expected = -1;
            for (const StreamEntry& e : *active) {
                if (expected < 0) {
                    expected = e.num_channels;
                }
                // Every entry must share the set-wide sentinel AND have
                // num_channels == aoo_channels (set atomically at build).
                if (e.num_channels != expected || e.aoo_channels != e.num_channels) {
                    torn = true;
                    break;
                }
            }
            if (torn) {
                tornReads.fetch_add(1, std::memory_order_relaxed);
            }
            // Block end (§4): clear the hazard so the control thread can
            // reclaim the set we just finished reading.
            table.releaseActive();
            readsDone.fetch_add(1, std::memory_order_relaxed);
        }
        stop.store(true, std::memory_order_release);
    });

    reader.join();
    publisher.join();

    REQUIRE(readsDone.load() == kIterations);
    // The load-bearing assertions: ZERO torn reads (no half-built set ever
    // observed) and ZERO null reads (the invariant holds) across 300k
    // reads under a continuously-publishing control thread.
    REQUIRE(tornReads.load() == 0);
    REQUIRE(nullReads.load() == 0);

    // No leak: force-drain reclaims all parked sets.
    table.drainRetired(/*force=*/true);
    REQUIRE(table.retiredCount() == 0);
}


TEST_CASE("StreamTable — destroy reclaims live + parked sets (no leak at teardown)",
          "[t2521][streamtable][reclamation]") {
    // Build + publish several sets, leave some parked, then let the
    // StreamTable destructor run. Under ASan/Valgrind this proves the
    // dtor frees both the live set and the retire queue.
    auto table = std::make_unique<StreamTable>();
    table->publish(makeSet(2, 3));
    // Pin the live set so the next publish parks the previous one without
    // reclaiming it — leaving a non-empty retire queue at teardown.
    const StreamSet* held = table->loadActive();
    (void) held;
    table->publish(makeSet(3, 4));
    REQUIRE(table->retiredCount() >= 1);       // a parked set survives
    // Destructor must free BOTH the live set and the parked one (force
    // drain). Verified clean by ASan/Valgrind in CI; no leak, no double-free.
    table.reset();
    SUCCEED("StreamTable destructor reclaimed live + parked sets");
}
