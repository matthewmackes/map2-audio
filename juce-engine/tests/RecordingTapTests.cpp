// =============================================================================
// T2507-1 — RecordingTap unit tests.
// =============================================================================
//
// Covers the SPSC ring's RT-safe contract:
//   - Single push round-trips a frame's audio data verbatim.
//   - Producer can fill all 16 slots without overflow.
//   - 17th push overflows + bumps overflowCount_.
//   - Reader drains the ring in FIFO order.
//   - After a drain, the producer can fill again.
//   - Channel + sample clamps stay within the pre-allocated frame.
//   - Concurrent producer + consumer (single thread each) reaches a
//     known total without losing frames.

#include <atomic>
#include <thread>
#include <vector>

#include <catch2/catch_test_macros.hpp>

#include "Recorder/RecordingTap.h"

using map2::recorder::RecordingTap;
using map2::recorder::kTapMaxChannels;
using map2::recorder::kTapMaxSamplesPerFrame;
using map2::recorder::kTapRingFrameCount;

namespace {

// Build a frame's worth of channel pointers + values. Each sample
// gets a deterministic value so the test can assert the writer's
// readback matches the producer's input.
void makeRamp(std::vector<std::vector<float>>& storage,
              std::vector<const float*>& pointers,
              int numChannels,
              int numSamples,
              float offset)
{
    storage.assign(numChannels, std::vector<float>(numSamples, 0.0f));
    pointers.assign(numChannels, nullptr);
    for (int ch = 0; ch < numChannels; ++ch) {
        for (int s = 0; s < numSamples; ++s) {
            storage[ch][s] = offset + static_cast<float>(ch * 1000 + s);
        }
        pointers[ch] = storage[ch].data();
    }
}

}  // namespace


TEST_CASE("RecordingTap — single push round-trips audio verbatim",
          "[t2507][recorder][tap]") {
    RecordingTap tap;

    std::vector<std::vector<float>> storage;
    std::vector<const float*>       inputs;
    makeRamp(storage, inputs, /*channels*/ 2, /*samples*/ 64, /*offset*/ 0.5f);

    REQUIRE(tap.pushAudioFrame(inputs.data(), 2, 64, /*startSample*/ 12345));
    REQUIRE(tap.getNumReady() == 1);

    const auto* frame = tap.prepareToReadFrame();
    REQUIRE(frame != nullptr);
    REQUIRE(frame->numChannels      == 2);
    REQUIRE(frame->numSamples       == 64);
    REQUIRE(frame->startSampleIndex == 12345);

    for (int ch = 0; ch < 2; ++ch) {
        for (int s = 0; s < 64; ++s) {
            REQUIRE(frame->channels[ch][s] == storage[ch][s]);
        }
    }

    tap.finishedReadFrame();
    REQUIRE(tap.getNumReady() == 0);
    REQUIRE(tap.overflowCount() == 0);
}


TEST_CASE("RecordingTap — fills all 16 slots without overflow",
          "[t2507][recorder][tap]") {
    RecordingTap tap;
    std::vector<std::vector<float>> storage;
    std::vector<const float*>       inputs;
    makeRamp(storage, inputs, 2, 64, 0.0f);

    for (int i = 0; i < kTapRingFrameCount; ++i) {
        REQUIRE(tap.pushAudioFrame(inputs.data(), 2, 64,
                                   static_cast<std::int64_t>(i) * 64));
    }
    REQUIRE(tap.getNumReady() == kTapRingFrameCount);
    REQUIRE(tap.overflowCount() == 0);
}


TEST_CASE("RecordingTap — 17th push returns false + bumps overflow counter",
          "[t2507][recorder][tap]") {
    RecordingTap tap;
    std::vector<std::vector<float>> storage;
    std::vector<const float*>       inputs;
    makeRamp(storage, inputs, 2, 64, 0.0f);

    for (int i = 0; i < kTapRingFrameCount; ++i) {
        REQUIRE(tap.pushAudioFrame(inputs.data(), 2, 64, 0));
    }

    // 17th push should overflow.
    REQUIRE_FALSE(tap.pushAudioFrame(inputs.data(), 2, 64, 0));
    REQUIRE(tap.overflowCount() == 1);

    // Additional pushes against a full ring keep incrementing.
    REQUIRE_FALSE(tap.pushAudioFrame(inputs.data(), 2, 64, 0));
    REQUIRE_FALSE(tap.pushAudioFrame(inputs.data(), 2, 64, 0));
    REQUIRE(tap.overflowCount() == 3);
}


TEST_CASE("RecordingTap — reader drains in FIFO order",
          "[t2507][recorder][tap]") {
    RecordingTap tap;
    std::vector<std::vector<float>> storage;
    std::vector<const float*>       inputs;
    makeRamp(storage, inputs, 1, 32, 0.0f);

    // Push 5 frames with distinct startSampleIndex values.
    for (int i = 0; i < 5; ++i) {
        REQUIRE(tap.pushAudioFrame(inputs.data(), 1, 32,
                                   static_cast<std::int64_t>(i + 1) * 100));
    }

    for (int expected = 1; expected <= 5; ++expected) {
        const auto* frame = tap.prepareToReadFrame();
        REQUIRE(frame != nullptr);
        REQUIRE(frame->startSampleIndex == expected * 100);
        tap.finishedReadFrame();
    }
    REQUIRE(tap.getNumReady() == 0);
}


TEST_CASE("RecordingTap — after drain, producer can fill again",
          "[t2507][recorder][tap]") {
    RecordingTap tap;
    std::vector<std::vector<float>> storage;
    std::vector<const float*>       inputs;
    makeRamp(storage, inputs, 2, 64, 0.0f);

    // Fill.
    for (int i = 0; i < kTapRingFrameCount; ++i) {
        REQUIRE(tap.pushAudioFrame(inputs.data(), 2, 64, 0));
    }
    // Drain all.
    for (int i = 0; i < kTapRingFrameCount; ++i) {
        REQUIRE(tap.prepareToReadFrame() != nullptr);
        tap.finishedReadFrame();
    }
    // Producer can fill the ring again.
    for (int i = 0; i < kTapRingFrameCount; ++i) {
        REQUIRE(tap.pushAudioFrame(inputs.data(), 2, 64, 0));
    }
    REQUIRE(tap.getNumReady() == kTapRingFrameCount);
    REQUIRE(tap.overflowCount() == 0);
}


TEST_CASE("RecordingTap — numSamples > max clamps without UB",
          "[t2507][recorder][tap]") {
    RecordingTap tap;
    std::vector<std::vector<float>> storage;
    std::vector<const float*>       inputs;
    // Allocate kTapMaxSamplesPerFrame + 64 so the producer hands the
    // tap a buffer wider than the slot. The tap should clamp + accept.
    makeRamp(storage, inputs, 2, kTapMaxSamplesPerFrame + 64, 0.0f);

    REQUIRE(tap.pushAudioFrame(inputs.data(),
                               /*channels*/ 2,
                               /*samples*/  kTapMaxSamplesPerFrame + 64,
                               0));

    const auto* frame = tap.prepareToReadFrame();
    REQUIRE(frame != nullptr);
    REQUIRE(frame->numSamples == kTapMaxSamplesPerFrame);
    tap.finishedReadFrame();
}


TEST_CASE("RecordingTap — numChannels > max clamps",
          "[t2507][recorder][tap]") {
    RecordingTap tap;
    std::vector<std::vector<float>> storage;
    std::vector<const float*>       inputs;
    makeRamp(storage, inputs, kTapMaxChannels + 4, 32, 0.0f);

    REQUIRE(tap.pushAudioFrame(inputs.data(), kTapMaxChannels + 4, 32, 0));
    const auto* frame = tap.prepareToReadFrame();
    REQUIRE(frame != nullptr);
    REQUIRE(frame->numChannels == kTapMaxChannels);
    tap.finishedReadFrame();
}


TEST_CASE("RecordingTap — producer + consumer threads reach a known total",
          "[t2507][recorder][tap][concurrent]") {
    RecordingTap tap;
    constexpr int kPushCount = 1000;

    std::atomic<int> produced{0};
    std::atomic<int> consumed{0};
    std::atomic<int> overflowed{0};

    std::vector<std::vector<float>> storage;
    std::vector<const float*>       inputs;
    makeRamp(storage, inputs, 2, 64, 0.0f);

    // Producer thread — simulates the audio callback firing
    // kPushCount times. Spin on overflow to mimic the "drop newest +
    // continue" policy (we count drops but keep going).
    std::thread producer([&]() {
        for (int i = 0; i < kPushCount; ++i) {
            if (tap.pushAudioFrame(inputs.data(), 2, 64, i)) {
                produced.fetch_add(1, std::memory_order_relaxed);
            } else {
                overflowed.fetch_add(1, std::memory_order_relaxed);
            }
            // Tiny back-off so the consumer can keep up.
            std::this_thread::yield();
        }
    });

    // Consumer thread — drains until the producer is done AND the
    // ring is empty.
    std::atomic<bool> producerDone{false};
    std::thread consumer([&]() {
        while (!producerDone.load(std::memory_order_acquire)
               || tap.getNumReady() > 0) {
            if (const auto* f = tap.prepareToReadFrame()) {
                (void)f;
                tap.finishedReadFrame();
                consumed.fetch_add(1, std::memory_order_relaxed);
            } else {
                std::this_thread::yield();
            }
        }
    });

    producer.join();
    producerDone.store(true, std::memory_order_release);
    consumer.join();

    // The producer attempted kPushCount pushes. Every attempt was
    // either successfully produced or overflowed; the consumer
    // drained exactly what was produced.
    REQUIRE(produced.load() + overflowed.load() == kPushCount);
    REQUIRE(consumed.load() == produced.load());
    REQUIRE(tap.overflowCount() ==
            static_cast<std::uint64_t>(overflowed.load()));
}
