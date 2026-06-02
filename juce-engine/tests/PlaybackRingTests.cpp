// =============================================================================
// T2511-1 — PlaybackRing unit tests.
// =============================================================================
//
// Covers the SPSC playback ring's RT-safe consumer contract (the mirror
// of RecordingTapTests):
//   - push/pop round-trips a frame's audio data verbatim (multi-channel
//     memcpy correctness).
//   - pop on an empty ring underruns: returns false, silence-fills the
//     output, bumps underrunCount_.
//   - producer can fill all kPlaybackRingFrameCount slots without
//     overflow (sentinel-slot capacity).
//   - the (count+1) slot overflows: pushFrame returns false + bumps
//     overflowCount_.
//   - request wider than the frame zero-fills the surplus channels.
//   - request longer than the frame zero-fills the tail per channel.
//   - concurrent producer + consumer reach a known total.

#include <atomic>
#include <thread>
#include <vector>

#include <catch2/catch_test_macros.hpp>

#include "Recorder/Playback/PlaybackRing.h"

using map2::recorder::PlaybackRing;
using map2::recorder::kPlaybackMaxChannels;
using map2::recorder::kPlaybackMaxSamplesPerFrame;
using map2::recorder::kPlaybackRingFrameCount;

namespace {

// Deterministic ramp so readback can be asserted against the input.
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

// Allocate writable output channels for pop.
void makeOutput(std::vector<std::vector<float>>& storage,
                std::vector<float*>& pointers,
                int numChannels,
                int numSamples,
                float fill)
{
    storage.assign(numChannels, std::vector<float>(numSamples, fill));
    pointers.assign(numChannels, nullptr);
    for (int ch = 0; ch < numChannels; ++ch) {
        pointers[ch] = storage[ch].data();
    }
}

}  // namespace


TEST_CASE("PlaybackRing — push then pop round-trips audio verbatim",
          "[t2511][playback][ring]") {
    PlaybackRing ring;

    std::vector<std::vector<float>> inStore;
    std::vector<const float*>       inputs;
    makeRamp(inStore, inputs, /*channels*/ 2, /*samples*/ 64, /*offset*/ 0.5f);

    REQUIRE(ring.pushFrame(inputs.data(), 2, 64, /*startSample*/ 9000));
    REQUIRE(ring.getNumReady() == 1);

    std::vector<std::vector<float>> outStore;
    std::vector<float*>             outputs;
    makeOutput(outStore, outputs, 2, 64, /*fill*/ -1.0f);

    REQUIRE(ring.popAudioFrame(outputs.data(), 2, 64));
    REQUIRE(ring.getNumReady() == 0);
    REQUIRE(ring.underrunCount() == 0);

    for (int ch = 0; ch < 2; ++ch) {
        for (int s = 0; s < 64; ++s) {
            REQUIRE(outStore[ch][s] == inStore[ch][s]);
        }
    }
}


TEST_CASE("PlaybackRing — pop on empty ring underruns (silence + counter)",
          "[t2511][playback][ring][underrun]") {
    PlaybackRing ring;

    std::vector<std::vector<float>> outStore;
    std::vector<float*>             outputs;
    makeOutput(outStore, outputs, 2, 64, /*fill*/ 7.0f);

    REQUIRE_FALSE(ring.popAudioFrame(outputs.data(), 2, 64));
    REQUIRE(ring.underrunCount() == 1);

    // Subsequent underruns keep incrementing the counter.
    REQUIRE_FALSE(ring.popAudioFrame(outputs.data(), 2, 64));
    REQUIRE_FALSE(ring.popAudioFrame(outputs.data(), 2, 64));
    REQUIRE(ring.underrunCount() == 3);

    // popAudioFrame returning false does NOT itself zero the buffer (the
    // caller — FileInputProcessor — clears on underrun). The ring only
    // touches the output on a successful pop. So the output retains the
    // caller's fill here; this documents the contract boundary.
    for (int ch = 0; ch < 2; ++ch) {
        for (int s = 0; s < 64; ++s) {
            REQUIRE(outStore[ch][s] == 7.0f);
        }
    }
}


TEST_CASE("PlaybackRing — fills all frames without overflow (sentinel slot)",
          "[t2511][playback][ring][capacity]") {
    PlaybackRing ring;
    std::vector<std::vector<float>> inStore;
    std::vector<const float*>       inputs;
    makeRamp(inStore, inputs, 2, 64, 0.0f);

    for (int i = 0; i < kPlaybackRingFrameCount; ++i) {
        REQUIRE(ring.pushFrame(inputs.data(), 2, 64,
                               static_cast<std::int64_t>(i) * 64));
    }
    REQUIRE(ring.getNumReady() == kPlaybackRingFrameCount);
    REQUIRE(ring.overflowCount() == 0);
    // Sentinel slot: exactly kPlaybackRingFrameCount usable, no more.
    REQUIRE(ring.getFreeSpace() == 0);
}


TEST_CASE("PlaybackRing — overflow past capacity returns false + bumps counter",
          "[t2511][playback][ring][overflow]") {
    PlaybackRing ring;
    std::vector<std::vector<float>> inStore;
    std::vector<const float*>       inputs;
    makeRamp(inStore, inputs, 2, 64, 0.0f);

    for (int i = 0; i < kPlaybackRingFrameCount; ++i) {
        REQUIRE(ring.pushFrame(inputs.data(), 2, 64, 0));
    }
    // One past capacity overflows.
    REQUIRE_FALSE(ring.pushFrame(inputs.data(), 2, 64, 0));
    REQUIRE(ring.overflowCount() == 1);
    REQUIRE_FALSE(ring.pushFrame(inputs.data(), 2, 64, 0));
    REQUIRE(ring.overflowCount() == 2);
}


TEST_CASE("PlaybackRing — multi-channel memcpy correctness (8 channels)",
          "[t2511][playback][ring]") {
    PlaybackRing ring;
    std::vector<std::vector<float>> inStore;
    std::vector<const float*>       inputs;
    makeRamp(inStore, inputs, kPlaybackMaxChannels, 128, 3.25f);

    REQUIRE(ring.pushFrame(inputs.data(), kPlaybackMaxChannels, 128, 0));

    std::vector<std::vector<float>> outStore;
    std::vector<float*>             outputs;
    makeOutput(outStore, outputs, kPlaybackMaxChannels, 128, -1.0f);

    REQUIRE(ring.popAudioFrame(outputs.data(), kPlaybackMaxChannels, 128));
    for (int ch = 0; ch < kPlaybackMaxChannels; ++ch) {
        for (int s = 0; s < 128; ++s) {
            REQUIRE(outStore[ch][s] == inStore[ch][s]);
        }
    }
}


TEST_CASE("PlaybackRing — request wider than frame zero-fills surplus channels",
          "[t2511][playback][ring]") {
    PlaybackRing ring;
    // Frame carries 1 channel; caller requests 3.
    std::vector<std::vector<float>> inStore;
    std::vector<const float*>       inputs;
    makeRamp(inStore, inputs, /*channels*/ 1, /*samples*/ 64, 2.0f);
    REQUIRE(ring.pushFrame(inputs.data(), 1, 64, 0));

    std::vector<std::vector<float>> outStore;
    std::vector<float*>             outputs;
    makeOutput(outStore, outputs, /*channels*/ 3, 64, /*fill*/ 9.0f);

    REQUIRE(ring.popAudioFrame(outputs.data(), 3, 64));
    // Channel 0 carries the frame audio.
    for (int s = 0; s < 64; ++s) {
        REQUIRE(outStore[0][s] == inStore[0][s]);
    }
    // Channels 1 and 2 are zero-filled (silence on the surplus channels).
    for (int ch = 1; ch < 3; ++ch) {
        for (int s = 0; s < 64; ++s) {
            REQUIRE(outStore[ch][s] == 0.0f);
        }
    }
}


TEST_CASE("PlaybackRing — request longer than frame zero-fills the tail",
          "[t2511][playback][ring]") {
    PlaybackRing ring;
    // Frame carries 32 samples; caller requests 64.
    std::vector<std::vector<float>> inStore;
    std::vector<const float*>       inputs;
    makeRamp(inStore, inputs, 2, /*samples*/ 32, 1.0f);
    REQUIRE(ring.pushFrame(inputs.data(), 2, 32, 0));

    std::vector<std::vector<float>> outStore;
    std::vector<float*>             outputs;
    makeOutput(outStore, outputs, 2, /*samples*/ 64, /*fill*/ 5.0f);

    REQUIRE(ring.popAudioFrame(outputs.data(), 2, 64));
    for (int ch = 0; ch < 2; ++ch) {
        // First 32 samples are the frame audio.
        for (int s = 0; s < 32; ++s) {
            REQUIRE(outStore[ch][s] == inStore[ch][s]);
        }
        // Tail [32, 64) is zero-filled.
        for (int s = 32; s < 64; ++s) {
            REQUIRE(outStore[ch][s] == 0.0f);
        }
    }
}


TEST_CASE("PlaybackRing — sample-count clamp at the slot ceiling",
          "[t2511][playback][ring]") {
    PlaybackRing ring;
    // Producer hands a frame wider than the slot — pushFrame clamps it to
    // kPlaybackMaxSamplesPerFrame, never writing past the slot.
    std::vector<std::vector<float>> inStore;
    std::vector<const float*>       inputs;
    makeRamp(inStore, inputs, 2, kPlaybackMaxSamplesPerFrame + 64, 0.0f);

    REQUIRE(ring.pushFrame(inputs.data(), 2,
                           kPlaybackMaxSamplesPerFrame + 64, 0));

    std::vector<std::vector<float>> outStore;
    std::vector<float*>             outputs;
    makeOutput(outStore, outputs, 2, kPlaybackMaxSamplesPerFrame, -1.0f);
    REQUIRE(ring.popAudioFrame(outputs.data(), 2, kPlaybackMaxSamplesPerFrame));
    // The clamped frame round-trips its first kPlaybackMaxSamplesPerFrame
    // samples verbatim.
    for (int ch = 0; ch < 2; ++ch) {
        for (int s = 0; s < kPlaybackMaxSamplesPerFrame; ++s) {
            REQUIRE(outStore[ch][s] == inStore[ch][s]);
        }
    }
}


TEST_CASE("PlaybackRing — channel-count clamp at the channel ceiling",
          "[t2511][playback][ring]") {
    PlaybackRing ring;
    std::vector<std::vector<float>> inStore;
    std::vector<const float*>       inputs;
    makeRamp(inStore, inputs, kPlaybackMaxChannels + 4, 32, 0.0f);

    REQUIRE(ring.pushFrame(inputs.data(), kPlaybackMaxChannels + 4, 32, 0));

    std::vector<std::vector<float>> outStore;
    std::vector<float*>             outputs;
    makeOutput(outStore, outputs, kPlaybackMaxChannels, 32, -1.0f);
    REQUIRE(ring.popAudioFrame(outputs.data(), kPlaybackMaxChannels, 32));
    // The frame's channel count was clamped to kPlaybackMaxChannels; the
    // first kPlaybackMaxChannels round-trip verbatim.
    for (int ch = 0; ch < kPlaybackMaxChannels; ++ch) {
        for (int s = 0; s < 32; ++s) {
            REQUIRE(outStore[ch][s] == inStore[ch][s]);
        }
    }
}


TEST_CASE("PlaybackRing — concurrent reader (producer) + audio (consumer)",
          "[t2511][playback][ring][concurrent]") {
    PlaybackRing ring;
    constexpr int kFrames = 5000;

    std::atomic<int> produced{0};
    std::atomic<int> consumed{0};
    std::atomic<int> underran{0};

    std::vector<std::vector<float>> inStore;
    std::vector<const float*>       inputs;
    makeRamp(inStore, inputs, 2, 64, 0.0f);

    // Producer = the reader thread filling the ring.
    std::atomic<bool> producerDone{false};
    std::thread producer([&]() {
        int i = 0;
        while (i < kFrames) {
            if (ring.pushFrame(inputs.data(), 2, 64, i)) {
                produced.fetch_add(1, std::memory_order_relaxed);
                ++i;
            } else {
                // Ring full — back off and retry this frame (the reader's
                // drop-newest-then-retry policy).
                std::this_thread::yield();
            }
        }
        producerDone.store(true, std::memory_order_release);
    });

    // Consumer = the audio thread popping the ring. Pops until the
    // producer is done AND the ring is drained. Counts underruns
    // (drop-to-silence) but keeps going — never blocks.
    std::thread consumer([&]() {
        std::vector<std::vector<float>> outStore;
        std::vector<float*>             outputs;
        makeOutput(outStore, outputs, 2, 64, 0.0f);
        while (!producerDone.load(std::memory_order_acquire)
               || ring.getNumReady() > 0) {
            if (ring.popAudioFrame(outputs.data(), 2, 64)) {
                consumed.fetch_add(1, std::memory_order_relaxed);
            } else {
                underran.fetch_add(1, std::memory_order_relaxed);
                std::this_thread::yield();
            }
        }
    });

    producer.join();
    consumer.join();

    // Every frame the producer pushed was consumed exactly once.
    REQUIRE(produced.load() == kFrames);
    REQUIRE(consumed.load() == kFrames);
    // The ring's underrun counter matches the consumer's observed
    // underruns (drop-to-silence events while the producer lagged).
    REQUIRE(ring.underrunCount() ==
            static_cast<std::uint64_t>(underran.load()));
    REQUIRE(ring.getNumReady() == 0);
}
