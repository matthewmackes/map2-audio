// =============================================================================
// T2507-3 — EngineRecorder (engine-level capture hooks, v1).
// =============================================================================
//
// Operator-locked scope (2026-05-11): v1 captures the engine-wide
// pre-FX and post-FX buffers via two hook calls in the existing
// Map2AudioEngine::audioCallback. No juce::AudioProcessorGraph
// mutation. Per-chain TapNode mounting (the worklist's original
// v2 design) is a follow-on cycle behind its own RT-safety review.
//
// Hook placement in Map2AudioEngine::audioCallback:
//   - capturePreFx(buffer)  — immediately BEFORE audioGraph_->process().
//   - capturePostFx(buffer) — immediately AFTER all post-graph
//                              processing (modulation, cabinet IR,
//                              EQ, gate, comp, limiter, reverb IR)
//                              and BEFORE the output copy + metering.
//
// RT-safety contract (operator-locked 2026-05-11):
//   - Hot path when disarmed: one armed_.load(memory_order_acquire)
//     per hook + a conditional branch. Zero cost.
//   - Hot path when armed: forward the buffer to a RecordingTap
//     (T2507-1) which memcpys into pre-allocated SPSC ring slots.
//     Drop-newest on overflow + bump counter.
//   - Channel overflow: clamped to kTapMaxChannels (8) by the tap;
//     warn-once per arm cycle.
//
// Ownership: EngineRecorder is owned by Map2AudioEngine as a
// std::unique_ptr member. The writer thread (T2507-4) reads from
// the two rings via non-owning pointers; the writer must drop its
// references before EngineRecorder is destroyed.

#pragma once

#include <atomic>
#include <cstdint>
#include <memory>

#include <juce_audio_basics/juce_audio_basics.h>

#include "Recorder/RecordingTap.h"

namespace map2::recorder {

/// Position of the buffer relative to the audio engine's plugin graph.
enum class EnginePosition {
    PreFx,   ///< Engine-input buffer immediately before audioGraph_->process().
    PostFx,  ///< Engine-output buffer after all DSP, before output gain + metering.
};

/**
 * Engine-level (process-wide) capture hooks for the multi-track
 * recorder v1. Holds one RecordingTap per position (pre, post).
 *
 * Wiring:
 *   - Map2AudioEngine constructs one EngineRecorder in its ctor
 *     and stores it as a std::unique_ptr.
 *   - The operator-facing arm/disarm path (T2507-5 RecorderService)
 *     calls arm()/disarm() from a non-RT thread.
 *   - The audioCallback calls capturePreFx() before audioGraph_->process()
 *     and capturePostFx() after the post-graph chain.
 *   - The writer thread (T2507-4) drains tapPreFx().ring() and
 *     tapPostFx().ring() in lockstep with the sample counters.
 */
class EngineRecorder {
public:
    EngineRecorder()
        : preFx_(std::make_unique<RecordingTap>()),
          postFx_(std::make_unique<RecordingTap>())
    {}

    ~EngineRecorder() = default;

    EngineRecorder(const EngineRecorder&) = delete;
    EngineRecorder& operator=(const EngineRecorder&) = delete;

    // ------------------------------------------------------------------
    // Operator-side API (non-RT)
    // ------------------------------------------------------------------

    /// Arm both taps for a new session. Reset sample counters and
    /// warn-once flags atomically before publishing the arm flag.
    void arm() noexcept {
        sampleCounter_.store(0, std::memory_order_release);
        warnedChannelOverflow_.store(false, std::memory_order_release);
        armed_.store(true, std::memory_order_release);
    }

    /// Disarm both taps. The writer thread keeps draining the rings
    /// until empty, then finalizes the take.
    void disarm() noexcept {
        armed_.store(false, std::memory_order_release);
    }

    bool isArmed() const noexcept {
        return armed_.load(std::memory_order_acquire);
    }

    /// Sample-counter snapshot — exposed for sidecar metadata. Reflects
    /// the number of samples that have been pushed since the last arm().
    /// Pre and post counters move in lockstep (the audio callback
    /// captures both buffers for the same `numSamples`).
    std::int64_t totalSamplesProcessed() const noexcept {
        return sampleCounter_.load(std::memory_order_acquire);
    }

    /// Snapshot of the channel-clamp event counter (warn-once per arm).
    std::uint64_t channelOverflowCount() const noexcept {
        return overflowChannelClampCount_.load(std::memory_order_acquire);
    }

    /// Non-owning ring access for the writer thread (T2507-4).
    RecordingTap* tapPreFx()  noexcept { return preFx_.get();  }
    RecordingTap* tapPostFx() noexcept { return postFx_.get(); }
    const RecordingTap* tapPreFx()  const noexcept { return preFx_.get();  }
    const RecordingTap* tapPostFx() const noexcept { return postFx_.get(); }

    // ------------------------------------------------------------------
    // Audio-thread hooks (RT-CRITICAL)
    // ------------------------------------------------------------------

    /// Called from Map2AudioEngine::audioCallback BEFORE the plugin
    /// graph processes the buffer. RT-safe: zero allocations, zero
    /// locks, zero syscalls.
    void capturePreFx(const juce::AudioBuffer<float>& buffer) noexcept {
        if (!armed_.load(std::memory_order_acquire)) {
            return;
        }
        const std::int64_t startSample =
            sampleCounter_.load(std::memory_order_acquire);
        captureToTap(*preFx_, buffer, startSample);
    }

    /// Called from Map2AudioEngine::audioCallback AFTER all post-graph
    /// DSP (modulation, cabinet IR, EQ, dynamics, reverb IR) and
    /// BEFORE the output copy. Advances the shared sample counter
    /// after the capture so both rings share the same startSample
    /// for the buffer they just processed.
    void capturePostFx(const juce::AudioBuffer<float>& buffer) noexcept {
        if (!armed_.load(std::memory_order_acquire)) {
            return;
        }
        const std::int64_t startSample =
            sampleCounter_.load(std::memory_order_acquire);
        captureToTap(*postFx_, buffer, startSample);
        // Advance the counter for the next callback. The audio thread
        // is single-threaded so a relaxed RMW is safe; use release
        // so non-RT readers observe the increment.
        sampleCounter_.store(startSample + buffer.getNumSamples(),
                             std::memory_order_release);
    }

private:
    void captureToTap(RecordingTap& tap,
                      const juce::AudioBuffer<float>& buffer,
                      std::int64_t startSample) noexcept
    {
        const int numChannels = buffer.getNumChannels();
        const int numSamples  = buffer.getNumSamples();
        if (numChannels <= 0 || numSamples <= 0) {
            return;
        }

        // Channel-overflow warn-once: bump the counter the first
        // time a clamp happens per arm cycle. RecordingTap clamps
        // internally; this counter surfaces the diagnostic.
        if (numChannels > kTapMaxChannels) {
            bool expected = false;
            if (warnedChannelOverflow_.compare_exchange_strong(
                    expected, true,
                    std::memory_order_acq_rel,
                    std::memory_order_acquire))
            {
                overflowChannelClampCount_.fetch_add(
                    1, std::memory_order_release);
            }
        }

        const float* channelPointers[kTapMaxChannels];
        const int capturedChannels = std::min(numChannels, kTapMaxChannels);
        for (int ch = 0; ch < capturedChannels; ++ch) {
            channelPointers[ch] = buffer.getReadPointer(ch);
        }

        tap.pushAudioFrame(channelPointers,
                           capturedChannels,
                           numSamples,
                           startSample);
    }

    std::unique_ptr<RecordingTap>      preFx_;
    std::unique_ptr<RecordingTap>      postFx_;

    std::atomic<bool>                  armed_                     {false};
    std::atomic<bool>                  warnedChannelOverflow_     {false};
    std::atomic<std::uint64_t>         overflowChannelClampCount_ {0};
    std::atomic<std::int64_t>          sampleCounter_             {0};
};

}  // namespace map2::recorder
