// =============================================================================
// T2511-3 — ChainInputSwitch ENGINE-INTEGRATION tests.
// =============================================================================
//
// These prove the engine wiring of the shipped ChainInputSwitch
// (docs/architecture/T2511_3_PLAYBACK_GRAPH_INTEGRATION.md), with one test
// elevated above all others:
//
//   *** LIVE-PATH PARITY — THE critical test ***
//   When no take is loaded the switch points at the LiveInputSource sentinel.
//   The sentinel's pullBlock MUST reproduce the engine's original input-copy
//   block (Map2AudioEngine.cpp:2283-2311) BYTE-FOR-BYTE across Stereo,
//   MonoLeft, MonoRight, and the extra-channel-clear case. The test runs the
//   ORIGINAL logic directly into a reference buffer and the switch-driven
//   logic into a second buffer, then asserts they are bit-identical. This is
//   the proof that the live path is not regressed.
//
// The remaining tests cover:
//   - File-source active → buffer filled from the ring; underrun → silence
//     (not live, not garbage).
//   - A mid-block apply_at_sample trigger flips live→file at the exact
//     sample offset (samples [0,S) live, [S,N) file).
//   - load/unload retires the old source through the deferred-free seam,
//     never an inline delete.

#include <array>
#include <cstring>
#include <vector>

#include <catch2/catch_test_macros.hpp>

#include "Recorder/Playback/ChainInputSwitch.h"
#include "Recorder/Playback/FileInputProcessor.h"
#include "Recorder/Playback/LiveInputSource.h"
#include "Recorder/Playback/PlaybackRing.h"
#include "Recorder/Playback/PlaybackSource.h"

using map2::recorder::ChainInputSwitch;
using map2::recorder::FileInputProcessor;
using map2::recorder::LiveInputSource;
using map2::recorder::PlaybackRing;
using map2::recorder::PlaybackSource;

namespace {

// Local mirror of Map2AudioEngine::InputChannelMode (values match 1:1).
enum class InputChannelMode : int { MonoLeft = 0, MonoRight = 1, Stereo = 2 };

// -----------------------------------------------------------------------------
// The REFERENCE implementation: a faithful, standalone copy of the engine's
// original input-copy block (Map2AudioEngine.cpp:2283-2311). The parity test
// asserts the switch+sentinel produce bit-identical output to THIS.
// -----------------------------------------------------------------------------
void referenceInputCopy(juce::AudioBuffer<float>& buffer,
                        const float* const* inputs,
                        int safeInputChannels,
                        int copyInputChannels,
                        int processChannels,
                        int processSamples,
                        InputChannelMode mode) {
    if (mode == InputChannelMode::Stereo) {
        for (int ch = 0; ch < copyInputChannels; ++ch) {
            if (inputs[ch] != nullptr) {
                buffer.copyFrom(ch, 0, inputs[ch], processSamples);
            } else {
                buffer.clear(ch, 0, processSamples);
            }
        }
        for (int ch = copyInputChannels; ch < processChannels; ++ch) {
            buffer.clear(ch, 0, processSamples);
        }
    } else {
        const int sourceChannel = mode == InputChannelMode::MonoRight ? 1 : 0;
        const int monoCopyChannels = std::min(processChannels, 2);
        const bool sourceAvailable =
            sourceChannel < safeInputChannels && inputs[sourceChannel] != nullptr;
        for (int ch = 0; ch < monoCopyChannels; ++ch) {
            if (sourceAvailable) {
                buffer.copyFrom(ch, 0, inputs[sourceChannel], processSamples);
            } else {
                buffer.clear(ch, 0, processSamples);
            }
        }
        for (int ch = monoCopyChannels; ch < processChannels; ++ch) {
            buffer.clear(ch, 0, processSamples);
        }
    }
}

// Build a deterministic device-input block: ch c, sample s -> base + c*100 + s.
std::vector<std::vector<float>> makeDeviceInputs(int channels, int samples) {
    std::vector<std::vector<float>> data(
        static_cast<size_t>(channels), std::vector<float>(static_cast<size_t>(samples)));
    for (int c = 0; c < channels; ++c) {
        for (int s = 0; s < samples; ++s) {
            data[static_cast<size_t>(c)][static_cast<size_t>(s)] =
                1.0f + static_cast<float>(c) * 100.0f + static_cast<float>(s);
        }
    }
    return data;
}

std::vector<const float*> inputPtrs(std::vector<std::vector<float>>& data) {
    std::vector<const float*> ptrs(data.size());
    for (size_t i = 0; i < data.size(); ++i) {
        ptrs[i] = data[i].data();
    }
    return ptrs;
}

// Assert two AudioBuffers are BIT-identical (memcmp on every channel).
void requireBitIdentical(const juce::AudioBuffer<float>& a,
                         const juce::AudioBuffer<float>& b,
                         int channels, int samples) {
    REQUIRE(a.getNumChannels() >= channels);
    REQUIRE(b.getNumChannels() >= channels);
    for (int ch = 0; ch < channels; ++ch) {
        const int cmp = std::memcmp(a.getReadPointer(ch),
                                    b.getReadPointer(ch),
                                    static_cast<size_t>(samples) * sizeof(float));
        REQUIRE(cmp == 0);
    }
}

// Drive the switch exactly the way Map2AudioEngine::audioCallback does for
// the live path: bind the sentinel for the block, then processBlock.
void driveLiveSwitch(ChainInputSwitch& sw,
                     LiveInputSource& live,
                     juce::AudioBuffer<float>& buffer,
                     const float* const* inputs,
                     int safeInputChannels,
                     int copyInputChannels,
                     int processChannels,
                     InputChannelMode mode) {
    live.bindBlock(
        inputs, safeInputChannels, copyInputChannels, processChannels,
        static_cast<LiveInputSource::InputChannelMode>(static_cast<int>(mode)));
    juce::MidiBuffer midi;
    sw.processBlock(buffer, midi);
}

}  // namespace


// =============================================================================
// THE CRITICAL TEST — live-path parity, byte-for-byte, across every mode.
// =============================================================================
TEST_CASE("T2511-3 — live path is BYTE-FOR-BYTE identical to the original "
          "input copy (Stereo / MonoLeft / MonoRight + extra-channel clear)",
          "[t2511][integration][parity][critical]") {
    constexpr int kSamples = 64;

    struct Case {
        const char* name;
        InputChannelMode mode;
        int safeInputChannels;   // device input channels available
        int processChannels;     // target buffer channels
    };

    // Each case exercises a different mode + channel-reconciliation path.
    const std::array<Case, 6> cases = {{
        {"Stereo, 2 in / 2 proc",                 InputChannelMode::Stereo,    2, 2},
        {"Stereo, 1 in / 2 proc (extra clear)",   InputChannelMode::Stereo,    1, 2},
        {"Stereo, 2 in / 4 proc (extra clear)",   InputChannelMode::Stereo,    2, 4},
        {"MonoLeft, 2 in / 2 proc",               InputChannelMode::MonoLeft,  2, 2},
        {"MonoRight, 2 in / 2 proc",              InputChannelMode::MonoRight, 2, 2},
        {"MonoLeft, 1 in / 3 proc (extra clear)", InputChannelMode::MonoLeft,  1, 3},
    }};

    for (const auto& c : cases) {
        SECTION(c.name) {
            const int copyInputChannels = std::min(c.safeInputChannels, c.processChannels);

            auto deviceData = makeDeviceInputs(c.safeInputChannels, kSamples);
            auto ptrs = inputPtrs(deviceData);

            // (a) Reference: run the ORIGINAL :2283-2311 logic directly.
            juce::AudioBuffer<float> refBuf(c.processChannels, kSamples);
            // Pre-fill with a sentinel so any un-written sample is visible.
            for (int ch = 0; ch < c.processChannels; ++ch) {
                for (int s = 0; s < kSamples; ++s) refBuf.setSample(ch, s, -777.0f);
            }
            referenceInputCopy(refBuf, ptrs.data(), c.safeInputChannels,
                               copyInputChannels, c.processChannels, kSamples,
                               c.mode);

            // (b) Switch-driven: the live sentinel bound exactly as the
            //     engine binds it.
            ChainInputSwitch sw;
            LiveInputSource live;
            sw.registerSource(0, &live);
            sw.setSource(&live);

            juce::AudioBuffer<float> swBuf(c.processChannels, kSamples);
            for (int ch = 0; ch < c.processChannels; ++ch) {
                for (int s = 0; s < kSamples; ++s) swBuf.setSample(ch, s, -777.0f);
            }
            driveLiveSwitch(sw, live, swBuf, ptrs.data(), c.safeInputChannels,
                            copyInputChannels, c.processChannels, c.mode);

            // (c) The proof: bit-identical on every channel.
            requireBitIdentical(refBuf, swBuf, c.processChannels, kSamples);
            // The live path never silences a span (live audio is "produced").
            REQUIRE(sw.silenceSpanCount() == 0);
        }
    }
}


// Null-input-channel case: a device channel that is nullptr must clear (not
// copy garbage) in BOTH the reference and the switch path, identically.
TEST_CASE("T2511-3 — live path: null input channel clears identically",
          "[t2511][integration][parity]") {
    constexpr int kSamples = 64;
    constexpr int kChannels = 2;

    auto deviceData = makeDeviceInputs(kChannels, kSamples);
    auto ptrs = inputPtrs(deviceData);
    ptrs[1] = nullptr;  // channel 1 has no device input.

    juce::AudioBuffer<float> refBuf(kChannels, kSamples);
    for (int ch = 0; ch < kChannels; ++ch)
        for (int s = 0; s < kSamples; ++s) refBuf.setSample(ch, s, 5.0f);
    referenceInputCopy(refBuf, ptrs.data(), kChannels, kChannels, kChannels,
                       kSamples, InputChannelMode::Stereo);

    ChainInputSwitch sw;
    LiveInputSource live;
    sw.registerSource(0, &live);
    sw.setSource(&live);
    juce::AudioBuffer<float> swBuf(kChannels, kSamples);
    for (int ch = 0; ch < kChannels; ++ch)
        for (int s = 0; s < kSamples; ++s) swBuf.setSample(ch, s, 5.0f);
    driveLiveSwitch(sw, live, swBuf, ptrs.data(), kChannels, kChannels,
                    kChannels, InputChannelMode::Stereo);

    requireBitIdentical(refBuf, swBuf, kChannels, kSamples);
    // Channel 1 must be silence (was cleared because input was null).
    for (int s = 0; s < kSamples; ++s) REQUIRE(swBuf.getSample(1, s) == 0.0f);
}


// =============================================================================
// File-source active → buffer filled from the ring; underrun → silence.
// =============================================================================
TEST_CASE("T2511-3 — file source active: buffer filled from the ring",
          "[t2511][integration][file]") {
    constexpr int kSamples = 64;
    constexpr int kChannels = 2;

    FileInputProcessor take("/tmp/parity-take.wav", kChannels);
    take.setPlaying(true);

    // The reader thread's job: pre-fill the ring with a known frame.
    std::array<std::array<float, kSamples>, kChannels> frame{};
    for (int ch = 0; ch < kChannels; ++ch)
        for (int s = 0; s < kSamples; ++s)
            frame[static_cast<size_t>(ch)][static_cast<size_t>(s)] =
                10.0f + static_cast<float>(ch);
    const float* framePtrs[kChannels] = {frame[0].data(), frame[1].data()};
    REQUIRE(take.ring()->pushFrame(framePtrs, kChannels, kSamples, 0));

    ChainInputSwitch sw;
    LiveInputSource live;
    sw.registerSource(0, &live);
    sw.registerSource(1, &take);
    sw.setSource(&take);  // file source is live.

    // Bind the live sentinel too (the engine always binds it), but the active
    // source is the file processor so the device inputs are irrelevant here.
    auto deviceData = makeDeviceInputs(kChannels, kSamples);
    auto ptrs = inputPtrs(deviceData);
    juce::AudioBuffer<float> buf(kChannels, kSamples);
    buf.clear();
    driveLiveSwitch(sw, live, buf, ptrs.data(), kChannels, kChannels,
                    kChannels, InputChannelMode::Stereo);

    // The buffer is the FILE frame, not the live device input.
    for (int ch = 0; ch < kChannels; ++ch) {
        for (int s = 0; s < kSamples; ++s) {
            REQUIRE(buf.getSample(ch, s) == 10.0f + static_cast<float>(ch));
        }
    }
}


TEST_CASE("T2511-3 — file source underrun: silence, not live, not garbage",
          "[t2511][integration][file][underrun]") {
    constexpr int kSamples = 64;
    constexpr int kChannels = 2;

    FileInputProcessor take("/tmp/empty-take.wav", kChannels);
    take.setPlaying(true);
    // Ring is EMPTY (reader never filled it) — the source underruns.

    ChainInputSwitch sw;
    LiveInputSource live;
    sw.registerSource(0, &live);
    sw.registerSource(1, &take);
    sw.setSource(&take);

    auto deviceData = makeDeviceInputs(kChannels, kSamples);
    auto ptrs = inputPtrs(deviceData);
    juce::AudioBuffer<float> buf(kChannels, kSamples);
    // Pre-fill with garbage to prove the underrun path clears it.
    for (int ch = 0; ch < kChannels; ++ch)
        for (int s = 0; s < kSamples; ++s) buf.setSample(ch, s, 999.0f);

    driveLiveSwitch(sw, live, buf, ptrs.data(), kChannels, kChannels,
                    kChannels, InputChannelMode::Stereo);

    // Underrun → silence. NOT the live device input (would be 1.0f, 101.0f…),
    // NOT the 999.0f garbage.
    for (int ch = 0; ch < kChannels; ++ch) {
        for (int s = 0; s < kSamples; ++s) {
            REQUIRE(buf.getSample(ch, s) == 0.0f);
        }
    }
    REQUIRE(take.underrunCount() == 1);
    REQUIRE(sw.silenceSpanCount() == 1);
}


// =============================================================================
// Mid-block apply_at_sample trigger flips live -> file at the exact offset.
// =============================================================================
TEST_CASE("T2511-3 — mid-block trigger flips live->file at the exact sample",
          "[t2511][integration][trigger][punch-in]") {
    constexpr int kSamples = 64;
    constexpr int kChannels = 2;
    constexpr int kSwitchAt = 40;  // samples [0,40) live, [40,64) file.

    FileInputProcessor take("/tmp/punch-take.wav", kChannels);
    take.setPlaying(true);
    std::array<std::array<float, kSamples>, kChannels> frame{};
    for (int ch = 0; ch < kChannels; ++ch)
        for (int s = 0; s < kSamples; ++s)
            frame[static_cast<size_t>(ch)][static_cast<size_t>(s)] = 50.0f;
    const float* framePtrs[kChannels] = {frame[0].data(), frame[1].data()};
    REQUIRE(take.ring()->pushFrame(framePtrs, kChannels, kSamples, 0));

    ChainInputSwitch sw;
    LiveInputSource live;
    sw.registerSource(0, &live);   // live = index 0
    sw.registerSource(1, &take);   // file = index 1
    sw.setSource(&live);           // start on live.

    // Device input is a constant per channel so the live span is identifiable.
    std::vector<std::vector<float>> deviceData(
        kChannels, std::vector<float>(kSamples, 0.0f));
    for (int ch = 0; ch < kChannels; ++ch)
        for (int s = 0; s < kSamples; ++s)
            deviceData[static_cast<size_t>(ch)][static_cast<size_t>(s)] = 3.0f;
    auto ptrs = inputPtrs(deviceData);

    // Clock starts at 0; trigger to switch to the file source at sample 40.
    sw.triggerQueue().push(/*applyAtSample*/ kSwitchAt, /*sourceIndex*/ 1);

    juce::AudioBuffer<float> buf(kChannels, kSamples);
    buf.clear();
    driveLiveSwitch(sw, live, buf, ptrs.data(), kChannels, kChannels,
                    kChannels, InputChannelMode::Stereo);

    for (int ch = 0; ch < kChannels; ++ch) {
        for (int s = 0; s < kSwitchAt; ++s) {
            REQUIRE(buf.getSample(ch, s) == 3.0f);   // live span.
        }
        for (int s = kSwitchAt; s < kSamples; ++s) {
            REQUIRE(buf.getSample(ch, s) == 50.0f);  // file span.
        }
    }
    // The atomic currentSource_ is unchanged — the trigger drove the local.
    REQUIRE(sw.currentSource() == &live);
}


// =============================================================================
// load/unload retires the old source via the deferred-free seam, not inline.
// =============================================================================
TEST_CASE("T2511-3 — retire seam: old source enqueued, never inline-deleted",
          "[t2511][integration][reclamation]") {
    // Model the engine's deferred-free queue: retired pointers land here and
    // are freed by the 'control thread' AFTER the swap, never inline.
    static std::vector<PlaybackSource*> retired;
    retired.clear();

    ChainInputSwitch sw;
    LiveInputSource live;
    sw.registerSource(0, &live);
    sw.setSource(&live);
    sw.setRetireCallback(+[](PlaybackSource* old) { retired.push_back(old); });

    // Load a take: register at index 1, retire whatever was loaded (nothing),
    // CAS onto the take.
    auto take = std::make_unique<FileInputProcessor>("/tmp/r.wav", 2);
    take->setPlaying(true);
    sw.registerSource(1, take.get());
    sw.setSource(take.get());
    REQUIRE(sw.currentSource() == take.get());
    REQUIRE(retired.empty());  // nothing retired yet (was on the live sentinel).

    // Unload: hand the take to the retire seam, then CAS back to live.
    FileInputProcessor* takeRaw = take.get();
    sw.retireSource(takeRaw);            // enqueue — must NOT delete inline.
    sw.setSource(&live);

    REQUIRE(retired.size() == 1);
    REQUIRE(retired[0] == takeRaw);
    REQUIRE(sw.currentSource() == &live);
    // The retired object is STILL ALIVE (no inline delete): we can use it.
    REQUIRE(static_cast<FileInputProcessor*>(retired[0])->isPlaying());

    // The 'control thread' frees it now, off the audio thread (take owns it).
    take.reset();
}
