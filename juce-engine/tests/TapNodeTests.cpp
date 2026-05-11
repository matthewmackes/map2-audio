// =============================================================================
// T2507-2 — TapNode unit tests.
// =============================================================================
//
// Covers the audio-graph node that wraps a RecordingTap and exposes
// arm/disarm semantics. Tests use juce::AudioBuffer<float> directly
// (no graph required) so the RT-safe path can be exercised without
// pulling in the rest of Map2AudioEngine.

#include <catch2/catch_test_macros.hpp>

#include <juce_audio_basics/juce_audio_basics.h>

#include "Recorder/RecordingTap.h"
#include "Recorder/TapNode.h"

using map2::recorder::TapNode;
using map2::recorder::TapPosition;
using map2::recorder::kTapMaxChannels;
using map2::recorder::kTapRingFrameCount;

namespace {

/// Make a deterministic test buffer where ch[ch][i] = ch * 1000 + i + offset.
juce::AudioBuffer<float> makeBuffer(int channels, int samples, float offset) {
    juce::AudioBuffer<float> buf(channels, samples);
    for (int ch = 0; ch < channels; ++ch) {
        auto* w = buf.getWritePointer(ch);
        for (int s = 0; s < samples; ++s) {
            w[s] = offset + static_cast<float>(ch * 1000 + s);
        }
    }
    return buf;
}

}  // namespace


TEST_CASE("TapNode — disarmed processBlock is zero-effect",
          "[t2507][recorder][tapnode]") {
    TapNode node("chain-1", TapPosition::PreFx, /*channels*/ 2);
    REQUIRE_FALSE(node.isArmed());

    auto buf = makeBuffer(2, 64, 0.0f);
    juce::MidiBuffer midi;
    node.processBlock(buf, midi);

    REQUIRE(node.ring()->getNumReady() == 0);
    REQUIRE(node.ring()->overflowCount() == 0);
    REQUIRE(node.totalSamplesProcessed() == 0);
    // Buffer is unchanged (passthrough).
    REQUIRE(buf.getSample(0, 0) == 0.0f);
    REQUIRE(buf.getSample(0, 63) == 63.0f);
    REQUIRE(buf.getSample(1, 0) == 1000.0f);
}


TEST_CASE("TapNode — armed processBlock pushes the buffer into the ring",
          "[t2507][recorder][tapnode]") {
    TapNode node("chain-1", TapPosition::PreFx, 2);
    node.setArmed(true);

    auto buf = makeBuffer(2, 64, 7.5f);
    juce::MidiBuffer midi;
    node.processBlock(buf, midi);

    REQUIRE(node.ring()->getNumReady() == 1);
    REQUIRE(node.totalSamplesProcessed() == 64);

    const auto* frame = node.ring()->prepareToReadFrame();
    REQUIRE(frame != nullptr);
    REQUIRE(frame->numChannels == 2);
    REQUIRE(frame->numSamples  == 64);
    REQUIRE(frame->startSampleIndex == 0);
    REQUIRE(frame->channels[0][0]  == 7.5f);
    REQUIRE(frame->channels[0][63] == 70.5f);
    REQUIRE(frame->channels[1][0]  == 1007.5f);
    node.ring()->finishedReadFrame();

    // Buffer is unchanged by the passthrough.
    REQUIRE(buf.getSample(0, 0) == 7.5f);
}


TEST_CASE("TapNode — sample counter advances buffer by buffer",
          "[t2507][recorder][tapnode]") {
    TapNode node("c", TapPosition::PostFx, 1);
    node.setArmed(true);

    juce::MidiBuffer midi;
    for (int i = 0; i < 4; ++i) {
        auto buf = makeBuffer(1, 32, static_cast<float>(i));
        node.processBlock(buf, midi);
    }

    REQUIRE(node.totalSamplesProcessed() == 4 * 32);

    for (int i = 0; i < 4; ++i) {
        const auto* frame = node.ring()->prepareToReadFrame();
        REQUIRE(frame != nullptr);
        REQUIRE(frame->startSampleIndex == i * 32);
        node.ring()->finishedReadFrame();
    }
}


TEST_CASE("TapNode — disarm stops pushing on the next buffer",
          "[t2507][recorder][tapnode]") {
    TapNode node("c", TapPosition::PreFx, 2);
    node.setArmed(true);

    auto buf = makeBuffer(2, 32, 0.0f);
    juce::MidiBuffer midi;
    node.processBlock(buf, midi);
    REQUIRE(node.ring()->getNumReady() == 1);

    node.setArmed(false);
    node.processBlock(buf, midi);
    // No new frame pushed.
    REQUIRE(node.ring()->getNumReady() == 1);
}


TEST_CASE("TapNode — re-arm resets the sample counter and warn flag",
          "[t2507][recorder][tapnode]") {
    TapNode node("c", TapPosition::PreFx, 2);
    node.setArmed(true);

    juce::MidiBuffer midi;
    auto buf = makeBuffer(2, 64, 0.0f);
    node.processBlock(buf, midi);
    REQUIRE(node.totalSamplesProcessed() == 64);

    // Disarm + drain.
    node.setArmed(false);
    while (node.ring()->getNumReady() > 0) {
        REQUIRE(node.ring()->prepareToReadFrame() != nullptr);
        node.ring()->finishedReadFrame();
    }

    // Re-arm resets the counter so a fresh take starts at sample 0.
    node.setArmed(true);
    REQUIRE(node.totalSamplesProcessed() == 0);
}


TEST_CASE("TapNode — channel overflow clamps + bumps the once-per-arm counter",
          "[t2507][recorder][tapnode][overflow]") {
    TapNode node("c", TapPosition::PreFx, /*channels*/ 16);
    node.setArmed(true);
    REQUIRE(node.channelOverflowCount() == 0);

    // Build a buffer with more channels than the tap allocation.
    juce::AudioBuffer<float> buf(kTapMaxChannels + 4, 32);
    for (int ch = 0; ch < kTapMaxChannels + 4; ++ch) {
        auto* w = buf.getWritePointer(ch);
        for (int s = 0; s < 32; ++s) {
            w[s] = static_cast<float>(ch * 100 + s);
        }
    }

    juce::MidiBuffer midi;
    node.processBlock(buf, midi);

    // Frame should have arrived with exactly kTapMaxChannels.
    const auto* frame = node.ring()->prepareToReadFrame();
    REQUIRE(frame != nullptr);
    REQUIRE(frame->numChannels == kTapMaxChannels);
    node.ring()->finishedReadFrame();

    REQUIRE(node.channelOverflowCount() == 1);

    // Subsequent over-wide buffers in the SAME arm cycle do NOT bump
    // the counter again — warn-once semantics.
    node.processBlock(buf, midi);
    REQUIRE(node.channelOverflowCount() == 1);

    // Disarm + re-arm resets the warn flag, so a new clamp event
    // bumps the counter again.
    node.setArmed(false);
    node.setArmed(true);
    node.processBlock(buf, midi);
    REQUIRE(node.channelOverflowCount() == 2);
}


TEST_CASE("TapNode — getName encodes chain id + position",
          "[t2507][recorder][tapnode]") {
    TapNode pre("chain-rhythm",  TapPosition::PreFx,  2);
    TapNode post("chain-rhythm", TapPosition::PostFx, 2);
    REQUIRE(pre.getName()  == juce::String("RecorderTap[chain-rhythm/pre]"));
    REQUIRE(post.getName() == juce::String("RecorderTap[chain-rhythm/post]"));
    REQUIRE(pre.position()  == TapPosition::PreFx);
    REQUIRE(post.position() == TapPosition::PostFx);
    REQUIRE(pre.chainId() == "chain-rhythm");
}


TEST_CASE("TapNode — ring overflow propagates from the underlying RecordingTap",
          "[t2507][recorder][tapnode][overflow]") {
    TapNode node("c", TapPosition::PreFx, 2);
    node.setArmed(true);

    juce::MidiBuffer midi;
    // Push exactly kTapRingFrameCount frames — should fit cleanly.
    for (int i = 0; i < kTapRingFrameCount; ++i) {
        auto buf = makeBuffer(2, 32, 0.0f);
        node.processBlock(buf, midi);
    }
    REQUIRE(node.ring()->overflowCount() == 0);

    // One more push overflows the ring.
    auto buf = makeBuffer(2, 32, 0.0f);
    node.processBlock(buf, midi);
    REQUIRE(node.ring()->overflowCount() == 1);
}
