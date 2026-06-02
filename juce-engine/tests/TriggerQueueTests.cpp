// =============================================================================
// T2511-4 — TriggerQueue unit tests.
// =============================================================================
//
// Covers the sample-accurate trigger ring (§6):
//   - push/drainPending round-trips entries in FIFO order into a stack
//     array.
//   - resolve(): a trigger inside the buffer yields its exact intra-buffer
//     offset (sample-accurate apply).
//   - resolve(): a trigger at/before buffer start clamps to offset 0
//     (clamp, not drop — §6 rule 3).
//   - resolve(): a trigger after the buffer end is Hold (held for a later
//     buffer — §6 rule 3).
//   - drop-newest on full + overflow counter (mirror of the automation
//     ring).
//   - sentinel-slot capacity (count usable, count+1 overflows).
//   - concurrent control-thread push + audio-thread drain.

#include <atomic>
#include <thread>
#include <vector>

#include <catch2/catch_test_macros.hpp>

#include "Recorder/Playback/TriggerQueue.h"

using map2::recorder::TriggerQueue;
using map2::recorder::SourceSwitchTrigger;
using map2::recorder::kTriggerRingCapacity;


TEST_CASE("TriggerQueue — push then drain round-trips in FIFO order",
          "[t2511][trigger]") {
    TriggerQueue q;
    REQUIRE(q.push(100, 1));
    REQUIRE(q.push(200, 0));
    REQUIRE(q.push(300, 1));
    REQUIRE(q.getNumReady() == 3);

    SourceSwitchTrigger out[8];
    const int n = q.drainPending(out, 8);
    REQUIRE(n == 3);
    REQUIRE(out[0].applyAtSample == 100);
    REQUIRE(out[0].desiredSourceIndex == 1);
    REQUIRE(out[1].applyAtSample == 200);
    REQUIRE(out[1].desiredSourceIndex == 0);
    REQUIRE(out[2].applyAtSample == 300);
    REQUIRE(out[2].desiredSourceIndex == 1);
    REQUIRE(q.getNumReady() == 0);
}


TEST_CASE("TriggerQueue — drain into a stack array empties the ring",
          "[t2511][trigger]") {
    TriggerQueue q;
    for (int i = 0; i < 10; ++i) {
        REQUIRE(q.push(i * 64, i % 2));
    }
    SourceSwitchTrigger stackBuf[16];
    const int n = q.drainPending(stackBuf, 16);
    REQUIRE(n == 10);
    REQUIRE(q.getNumReady() == 0);
    // A second drain on the empty ring yields nothing.
    REQUIRE(q.drainPending(stackBuf, 16) == 0);
}


TEST_CASE("TriggerQueue — resolve: in-window trigger is sample-accurate",
          "[t2511][trigger][resolve]") {
    // Buffer [128, 192). Trigger at 160 -> offset 32.
    SourceSwitchTrigger t{160, 1};
    int offset = -1;
    const auto res = TriggerQueue::resolve(t, /*bufferStart*/ 128,
                                           /*numSamples*/ 64, offset);
    REQUIRE(res == TriggerQueue::Resolution::Apply);
    REQUIRE(offset == 32);
}


TEST_CASE("TriggerQueue — resolve: late trigger clamps to offset 0",
          "[t2511][trigger][resolve]") {
    // Buffer [128, 192). Trigger at 100 (before start) clamps to offset 0.
    SourceSwitchTrigger t{100, 1};
    int offset = -1;
    const auto res = TriggerQueue::resolve(t, 128, 64, offset);
    REQUIRE(res == TriggerQueue::Resolution::Apply);
    REQUIRE(offset == 0);

    // Exactly at buffer start also clamps to offset 0.
    SourceSwitchTrigger t2{128, 1};
    int offset2 = -1;
    const auto res2 = TriggerQueue::resolve(t2, 128, 64, offset2);
    REQUIRE(res2 == TriggerQueue::Resolution::Apply);
    REQUIRE(offset2 == 0);
}


TEST_CASE("TriggerQueue — resolve: future trigger is held",
          "[t2511][trigger][resolve]") {
    // Buffer [128, 192). Trigger at 192 (== end) and 300 (after) both Hold.
    int offset = 999;
    SourceSwitchTrigger atEnd{192, 1};
    REQUIRE(TriggerQueue::resolve(atEnd, 128, 64, offset)
            == TriggerQueue::Resolution::Hold);

    SourceSwitchTrigger after{300, 1};
    REQUIRE(TriggerQueue::resolve(after, 128, 64, offset)
            == TriggerQueue::Resolution::Hold);

    // The last in-window sample (191) still applies.
    int inOffset = -1;
    SourceSwitchTrigger last{191, 1};
    REQUIRE(TriggerQueue::resolve(last, 128, 64, inOffset)
            == TriggerQueue::Resolution::Apply);
    REQUIRE(inOffset == 63);
}


TEST_CASE("TriggerQueue — fills to capacity then drops-newest + counts",
          "[t2511][trigger][overflow]") {
    TriggerQueue q;
    for (int i = 0; i < kTriggerRingCapacity; ++i) {
        REQUIRE(q.push(i, 0));
    }
    REQUIRE(q.getNumReady() == kTriggerRingCapacity);
    REQUIRE(q.overflowCount() == 0);

    // One past capacity overflows (drop-newest).
    REQUIRE_FALSE(q.push(99999, 1));
    REQUIRE(q.overflowCount() == 1);
    REQUIRE_FALSE(q.push(99999, 1));
    REQUIRE(q.overflowCount() == 2);
    // The ring still holds exactly capacity (the newest were dropped, not
    // the oldest).
    REQUIRE(q.getNumReady() == kTriggerRingCapacity);
}


TEST_CASE("TriggerQueue — partial drain leaves the remainder queued",
          "[t2511][trigger]") {
    TriggerQueue q;
    for (int i = 0; i < 5; ++i) {
        REQUIRE(q.push(i * 10, 0));
    }
    SourceSwitchTrigger out[2];
    REQUIRE(q.drainPending(out, 2) == 2);
    REQUIRE(out[0].applyAtSample == 0);
    REQUIRE(out[1].applyAtSample == 10);
    REQUIRE(q.getNumReady() == 3);
    // Drain the rest in FIFO order.
    SourceSwitchTrigger rest[8];
    REQUIRE(q.drainPending(rest, 8) == 3);
    REQUIRE(rest[0].applyAtSample == 20);
    REQUIRE(rest[2].applyAtSample == 40);
}


TEST_CASE("TriggerQueue — concurrent control push + audio drain",
          "[t2511][trigger][concurrent]") {
    TriggerQueue q;
    constexpr int kTriggers = 20000;

    std::atomic<int> pushed{0};
    std::atomic<int> dropped{0};
    std::atomic<long> drained{0};

    std::atomic<bool> producerDone{false};
    std::thread producer([&]() {
        for (int i = 0; i < kTriggers; ++i) {
            if (q.push(i, i % 2)) {
                pushed.fetch_add(1, std::memory_order_relaxed);
            } else {
                dropped.fetch_add(1, std::memory_order_relaxed);
            }
            std::this_thread::yield();
        }
        producerDone.store(true, std::memory_order_release);
    });

    std::thread consumer([&]() {
        SourceSwitchTrigger buf[64];
        while (!producerDone.load(std::memory_order_acquire)
               || q.getNumReady() > 0) {
            const int n = q.drainPending(buf, 64);
            drained.fetch_add(n, std::memory_order_relaxed);
            if (n == 0) {
                std::this_thread::yield();
            }
        }
    });

    producer.join();
    consumer.join();

    // Every push attempt was either queued (and later drained) or dropped.
    REQUIRE(pushed.load() + dropped.load() == kTriggers);
    REQUIRE(drained.load() == static_cast<long>(pushed.load()));
    REQUIRE(q.overflowCount() == static_cast<std::uint64_t>(dropped.load()));
}
