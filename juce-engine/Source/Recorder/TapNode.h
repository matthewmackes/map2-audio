// =============================================================================
// T2507-2 — TapNode (juce::AudioProcessor that captures a chain audio bus).
// =============================================================================
//
// Inserted into the live juce::AudioProcessorGraph at two positions per
// chain:
//   - PRE  — between the chain's input bus and its first plugin.
//   - POST — between the chain's last plugin and the chain's output bus.
//
// When the operator arms a session that targets this chain, the
// audio thread sees armed_=true via std::memory_order_acquire and
// fans the current buffer out into the SPSC ring (T2507-1). When
// armed_=false the node is a zero-cost passthrough: one atomic load
// + a conditional branch, then return. Matches the industry-standard
// pattern (JUCE AudioProcessor::isSuspended, Mixxx ControlValueAtomic,
// JACK transport state).
//
// RT-safety contract (operator-locked 2026-05-11):
//   - No allocations in processBlock().
//   - No locks in processBlock().
//   - No syscalls in processBlock().
//   - Channel overflow (chain channels > kTapMaxChannels): clamp to
//     8 channels, bump the ring's overflowCount_ once per arm cycle,
//     and emit a warn-once log line off-thread (via the existing
//     juce::Logger; the actual write happens in the JUCE message
//     thread, NOT the audio thread).

#pragma once

#include <atomic>
#include <cstdint>
#include <memory>
#include <string>

#include <juce_audio_processors/juce_audio_processors.h>

#include "Recorder/RecordingTap.h"

namespace map2::recorder {

/// Where the tap lives relative to the chain's plugin block.
enum class TapPosition {
    PreFx,   ///< Before the first plugin.
    PostFx,  ///< After the last plugin.
};

/**
 * Audio-graph node that captures its input buffer into an
 * SPSC RecordingTap when armed; otherwise passes the buffer
 * through unchanged.
 *
 * Owns its own RecordingTap (one ring per node). The writer
 * thread (T2507-4 IoUringWriter) holds a non-owning pointer
 * to the ring and drains it.
 *
 * Wiring (T2507-3): the graph builder inserts one TapNode in
 * Pre position and one in Post position per chain; both reuse
 * the chain's bus channel count.
 */
class TapNode : public juce::AudioProcessor {
public:
    TapNode(std::string chainId,
            TapPosition position,
            int numChannels)
        : chainId_(std::move(chainId)),
          position_(position),
          declaredChannels_(numChannels),
          tap_(std::make_unique<RecordingTap>())
    {}

    ~TapNode() override = default;

    // ------------------------------------------------------------------
    // Operator-side API (non-RT). All ops use the atomic seam.
    // ------------------------------------------------------------------

    /// Arm or disarm this tap. Producer-thread side of the ring's
    /// `pushAudioFrame` does an `armed_.load(acquire)` per buffer;
    /// flipping this flag is observable on the next callback.
    void setArmed(bool shouldArm) noexcept {
        if (shouldArm) {
            sampleCounter_.store(0, std::memory_order_release);
            warnedChannelOverflow_.store(false, std::memory_order_release);
        }
        armed_.store(shouldArm, std::memory_order_release);
    }

    bool isArmed() const noexcept {
        return armed_.load(std::memory_order_acquire);
    }

    /// Non-owning pointer for the writer thread (T2507-4).
    /// Lifetime: the writer must drop this before TapNode is
    /// destroyed (handled by RecorderService::stop in T2507-5).
    RecordingTap* ring() noexcept { return tap_.get(); }
    const RecordingTap* ring() const noexcept { return tap_.get(); }

    const std::string& chainId() const noexcept { return chainId_; }
    TapPosition position() const noexcept { return position_; }
    int declaredChannels() const noexcept { return declaredChannels_; }

    /// Sample-counter snapshot — exposed for sidecar metadata.
    std::int64_t totalSamplesProcessed() const noexcept {
        return sampleCounter_.load(std::memory_order_acquire);
    }

    // ------------------------------------------------------------------
    // juce::AudioProcessor interface
    // ------------------------------------------------------------------

    const juce::String getName() const override {
        const auto suffix =
            position_ == TapPosition::PreFx ? "/pre" : "/post";
        return juce::String("RecorderTap[")
               + chainId_ + suffix + "]";
    }

    void prepareToPlay(double /*sampleRate*/, int /*bufferSize*/) override {
        // No allocations needed — the ring is pre-allocated.
    }

    void releaseResources() override {}

    bool isBusesLayoutSupported(const BusesLayout& layouts) const override {
        // Mono or stereo on the main bus; chains rarely exceed
        // stereo. Wider configurations are accepted but clamped by
        // the tap to kTapMaxChannels.
        return layouts.getMainOutputChannelSet()
            == layouts.getMainInputChannelSet();
    }

    void processBlock(juce::AudioBuffer<float>& buffer,
                      juce::MidiBuffer& /*midi*/) override {
        // RT-CRITICAL PATH.
        // Hot path: armed_=false. One atomic load, one branch, return.
        if (!armed_.load(std::memory_order_acquire)) {
            return;
        }

        const int numChannels = buffer.getNumChannels();
        const int numSamples  = buffer.getNumSamples();
        if (numChannels <= 0 || numSamples <= 0) {
            return;
        }

        // Channel-overflow clamp: chain channel count > kTapMaxChannels
        // (8). RecordingTap::pushAudioFrame already clamps internally,
        // but we also want to warn-once so the operator sees the
        // diagnostic. The warn flag is per-arm cycle (cleared in
        // setArmed(true)).
        if (numChannels > kTapMaxChannels) {
            bool expected = false;
            if (warnedChannelOverflow_.compare_exchange_strong(
                    expected, true,
                    std::memory_order_acq_rel,
                    std::memory_order_acquire))
            {
                // Bump overflow counter so the sidecar JSON marks
                // the clamp. The audio thread cannot log; the
                // counter is checked by the writer thread which can.
                overflowChannelClampCount_.fetch_add(
                    1, std::memory_order_release);
            }
        }

        // Build a const-ptr array on the stack — no allocation. The
        // ring's pushAudioFrame copies into its own pre-allocated
        // frame storage so the buffer lifetime ends with this call.
        const float* channelPointers[kTapMaxChannels];
        const int   capturedChannels =
            std::min(numChannels, kTapMaxChannels);
        for (int ch = 0; ch < capturedChannels; ++ch) {
            channelPointers[ch] = buffer.getReadPointer(ch);
        }

        const std::int64_t startSample =
            sampleCounter_.load(std::memory_order_acquire);

        tap_->pushAudioFrame(channelPointers,
                             capturedChannels,
                             numSamples,
                             startSample);

        sampleCounter_.store(startSample + numSamples,
                             std::memory_order_release);
    }

    // ------------------------------------------------------------------
    // juce::AudioProcessor — required boilerplate (non-RT).
    // ------------------------------------------------------------------

    double getTailLengthSeconds() const override { return 0.0; }
    bool   acceptsMidi()  const override { return false; }
    bool   producesMidi() const override { return false; }
    bool   hasEditor()    const override { return false; }
    juce::AudioProcessorEditor* createEditor() override { return nullptr; }
    int    getNumPrograms() override { return 1; }
    int    getCurrentProgram() override { return 0; }
    void   setCurrentProgram(int /*index*/) override {}
    const juce::String getProgramName(int /*index*/) override { return {}; }
    void   changeProgramName(int /*index*/, const juce::String& /*newName*/) override {}
    void   getStateInformation(juce::MemoryBlock& /*destData*/) override {}
    void   setStateInformation(const void* /*data*/, int /*sizeInBytes*/) override {}

    /// Snapshot of the channel-clamp event counter.
    std::uint64_t channelOverflowCount() const noexcept {
        return overflowChannelClampCount_.load(std::memory_order_acquire);
    }

private:
    const std::string                   chainId_;
    const TapPosition                   position_;
    const int                           declaredChannels_;
    std::unique_ptr<RecordingTap>       tap_;

    std::atomic<bool>                   armed_                 {false};
    std::atomic<bool>                   warnedChannelOverflow_ {false};
    std::atomic<std::uint64_t>          overflowChannelClampCount_ {0};
    std::atomic<std::int64_t>           sampleCounter_         {0};
};

}  // namespace map2::recorder
