// =============================================================================
// T2507-3 — EngineRecorder unit tests.
// =============================================================================
//
// Covers the engine-level capture hooks. The hooks are the v1 audio-
// thread integration point that Map2AudioEngine::audioCallback calls
// once before audioGraph_->process() (capturePreFx) and once after
// the post-graph DSP chain (capturePostFx).
//
// Tests exercise the hooks against synthetic buffers without
// requiring a live Map2AudioEngine instance.

#include <catch2/catch_test_macros.hpp>

#include <juce_audio_basics/juce_audio_basics.h>

#include "Recorder/EngineRecorder.h"
#include "Recorder/RecordingTap.h"

using map2::recorder::EngineRecorder;
using map2::recorder::EnginePosition;
using map2::recorder::kTapMaxChannels;
using map2::recorder::kTapRingFrameCount;

namespace {

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


TEST_CASE("EngineRecorder — starts disarmed; no captures",
          "[t2507][recorder][engine-recorder]") {
    EngineRecorder rec;
    REQUIRE_FALSE(rec.isArmed());

    auto buf = makeBuffer(2, 64, 0.0f);
    rec.capturePreFx(buf);
    rec.capturePostFx(buf);

    REQUIRE(rec.tapPreFx()->getNumReady()  == 0);
    REQUIRE(rec.tapPostFx()->getNumReady() == 0);
    REQUIRE(rec.totalSamplesProcessed()    == 0);
}


TEST_CASE("EngineRecorder — arm/disarm flips the atomic flag",
          "[t2507][recorder][engine-recorder]") {
    EngineRecorder rec;
    rec.arm();
    REQUIRE(rec.isArmed());
    rec.disarm();
    REQUIRE_FALSE(rec.isArmed());
}


TEST_CASE("EngineRecorder — armed pre+post captures both rings, "
          "advances sample counter ONCE per (pre,post) pair",
          "[t2507][recorder][engine-recorder]") {
    EngineRecorder rec;
    rec.arm();

    auto pre  = makeBuffer(2, 64, 0.5f);
    auto post = makeBuffer(2, 64, 7.5f);

    // One callback's worth of work: capture pre, then capture post.
    rec.capturePreFx(pre);
    rec.capturePostFx(post);

    REQUIRE(rec.tapPreFx()->getNumReady()  == 1);
    REQUIRE(rec.tapPostFx()->getNumReady() == 1);
    REQUIRE(rec.totalSamplesProcessed()    == 64);

    // The pre frame retains the pre-FX audio verbatim.
    const auto* preFrame = rec.tapPreFx()->prepareToReadFrame();
    REQUIRE(preFrame != nullptr);
    REQUIRE(preFrame->startSampleIndex == 0);
    REQUIRE(preFrame->channels[0][0]  == 0.5f);
    REQUIRE(preFrame->channels[0][63] == 63.5f);
    rec.tapPreFx()->finishedReadFrame();

    // The post frame retains the post-FX audio verbatim.
    const auto* postFrame = rec.tapPostFx()->prepareToReadFrame();
    REQUIRE(postFrame != nullptr);
    REQUIRE(postFrame->startSampleIndex == 0);
    REQUIRE(postFrame->channels[0][0]  == 7.5f);
    REQUIRE(postFrame->channels[0][63] == 70.5f);
    rec.tapPostFx()->finishedReadFrame();
}


TEST_CASE("EngineRecorder — sample counter shared across pre+post pair",
          "[t2507][recorder][engine-recorder]") {
    EngineRecorder rec;
    rec.arm();

    juce::AudioBuffer<float> a(2, 32);
    juce::AudioBuffer<float> b(2, 32);

    // Four callbacks back-to-back. Each pair (pre, post) shares the
    // same startSampleIndex; the counter advances on capturePostFx.
    for (int i = 0; i < 4; ++i) {
        rec.capturePreFx(a);
        rec.capturePostFx(b);
    }

    REQUIRE(rec.totalSamplesProcessed() == 4 * 32);

    for (int i = 0; i < 4; ++i) {
        const auto* pre  = rec.tapPreFx()->prepareToReadFrame();
        const auto* post = rec.tapPostFx()->prepareToReadFrame();
        REQUIRE(pre  != nullptr);
        REQUIRE(post != nullptr);
        REQUIRE(pre->startSampleIndex  == i * 32);
        REQUIRE(post->startSampleIndex == i * 32);
        rec.tapPreFx()->finishedReadFrame();
        rec.tapPostFx()->finishedReadFrame();
    }
}


TEST_CASE("EngineRecorder — disarm stops captures on the next hook call",
          "[t2507][recorder][engine-recorder]") {
    EngineRecorder rec;
    rec.arm();

    auto buf = makeBuffer(2, 32, 0.0f);
    rec.capturePreFx(buf);
    rec.capturePostFx(buf);
    REQUIRE(rec.tapPreFx()->getNumReady() == 1);
    REQUIRE(rec.tapPostFx()->getNumReady() == 1);

    rec.disarm();
    rec.capturePreFx(buf);
    rec.capturePostFx(buf);

    REQUIRE(rec.tapPreFx()->getNumReady() == 1);
    REQUIRE(rec.tapPostFx()->getNumReady() == 1);
}


TEST_CASE("EngineRecorder — re-arm resets sample counter and warn flag",
          "[t2507][recorder][engine-recorder]") {
    EngineRecorder rec;
    rec.arm();

    auto buf = makeBuffer(2, 64, 0.0f);
    rec.capturePreFx(buf);
    rec.capturePostFx(buf);
    REQUIRE(rec.totalSamplesProcessed() == 64);

    rec.disarm();

    // Drain so the rings are empty before the next take.
    while (rec.tapPreFx()->getNumReady() > 0) {
        rec.tapPreFx()->prepareToReadFrame();
        rec.tapPreFx()->finishedReadFrame();
    }
    while (rec.tapPostFx()->getNumReady() > 0) {
        rec.tapPostFx()->prepareToReadFrame();
        rec.tapPostFx()->finishedReadFrame();
    }

    rec.arm();
    REQUIRE(rec.totalSamplesProcessed() == 0);

    rec.capturePreFx(buf);
    rec.capturePostFx(buf);

    const auto* preFrame = rec.tapPreFx()->prepareToReadFrame();
    REQUIRE(preFrame != nullptr);
    REQUIRE(preFrame->startSampleIndex == 0);
    rec.tapPreFx()->finishedReadFrame();
}


TEST_CASE("EngineRecorder — channel overflow clamps + warn-once "
          "across the pre+post pair",
          "[t2507][recorder][engine-recorder][overflow]") {
    EngineRecorder rec;
    rec.arm();
    REQUIRE(rec.channelOverflowCount() == 0);

    // Buffer wider than kTapMaxChannels triggers the clamp.
    juce::AudioBuffer<float> wide(kTapMaxChannels + 4, 32);
    for (int ch = 0; ch < kTapMaxChannels + 4; ++ch) {
        auto* w = wide.getWritePointer(ch);
        for (int s = 0; s < 32; ++s) {
            w[s] = static_cast<float>(ch * 100 + s);
        }
    }

    // Pre-FX hook trips warn-once → counter += 1.
    rec.capturePreFx(wide);
    REQUIRE(rec.channelOverflowCount() == 1);

    // Post-FX hook in the same arm cycle does NOT bump (warn-once).
    rec.capturePostFx(wide);
    REQUIRE(rec.channelOverflowCount() == 1);

    // Both rings see the clamped frame.
    auto checkClamped = [](map2::recorder::RecordingTap& tap) {
        const auto* frame = tap.prepareToReadFrame();
        REQUIRE(frame != nullptr);
        REQUIRE(frame->numChannels == kTapMaxChannels);
        tap.finishedReadFrame();
    };
    checkClamped(*rec.tapPreFx());
    checkClamped(*rec.tapPostFx());

    // A second pair in the SAME arm cycle still does not bump.
    rec.capturePreFx(wide);
    rec.capturePostFx(wide);
    REQUIRE(rec.channelOverflowCount() == 1);

    // Disarm + re-arm resets warn flag → next clamp bumps again.
    rec.disarm();
    rec.arm();
    rec.capturePreFx(wide);
    REQUIRE(rec.channelOverflowCount() == 2);
}


TEST_CASE("EngineRecorder — ring overflow on the pre-tap counted "
          "on the underlying RecordingTap",
          "[t2507][recorder][engine-recorder][overflow]") {
    EngineRecorder rec;
    rec.arm();

    // Push exactly kTapRingFrameCount pre-FX frames; pre ring at
    // capacity. No post captures yet.
    auto buf = makeBuffer(2, 32, 0.0f);
    for (int i = 0; i < kTapRingFrameCount; ++i) {
        rec.capturePreFx(buf);
    }
    REQUIRE(rec.tapPreFx()->overflowCount() == 0);

    // One more pre-FX push overflows the pre ring.
    rec.capturePreFx(buf);
    REQUIRE(rec.tapPreFx()->overflowCount() == 1);
}


TEST_CASE("EngineRecorder — empty buffer at hooks is a no-op",
          "[t2507][recorder][engine-recorder]") {
    EngineRecorder rec;
    rec.arm();

    juce::AudioBuffer<float> empty(0, 0);
    rec.capturePreFx(empty);
    rec.capturePostFx(empty);

    REQUIRE(rec.tapPreFx()->getNumReady() == 0);
    REQUIRE(rec.tapPostFx()->getNumReady() == 0);
    REQUIRE(rec.totalSamplesProcessed()   == 0);
}
