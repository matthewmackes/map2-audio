// =============================================================================
// T2511-3 — LiveInputSource (the "live device input" PlaybackSource sentinel).
// =============================================================================
//
// This is the sentinel that makes ChainInputSwitch a SINGLE code path: the
// switch always points at SOME PlaybackSource — either a FileInputProcessor
// (playback) or this LiveInputSource (the chain's normal device input). When
// no take is loaded, the switch's currentSource_ is this sentinel and the
// engine's input path is byte-for-byte today's behaviour plus one predicted-
// taken atomic load + branch (the switch's load-once-per-buffer).
//
// THE SINGLE MOST IMPORTANT SAFETY PROPERTY (T2511_3 §5 open-item 1):
//   The disarmed/live path must be BYTE-FOR-BYTE IDENTICAL to the engine's
//   pre-T2511-3 input copy (Map2AudioEngine.cpp:2283-2311). pullBlock() below
//   reproduces that exact logic — Stereo, MonoLeft, MonoRight, and the
//   extra-channel clear — sample-for-sample. A parity test
//   (ChainInputSwitchIntegrationTests.cpp) asserts identity against a
//   reference that runs the original :2283-2311 logic directly.
//
// WHY A BIND STEP (and why it is RT-safe):
//   PlaybackSource::pullBlock(outputs, numChannels, numSamples) has no access
//   to the engine's raw device inputs[] or its InputChannelMode. We supply
//   them via bindBlock(...), which the engine calls IMMEDIATELY before
//   invoking the switch, ON THE AUDIO THREAD, within the same callback.
//   bindBlock + pullBlock therefore execute on the SAME thread in the SAME
//   block with no interleaving — there is no cross-thread race and no
//   synchronisation needed. bindBlock only stores plain pointers + ints
//   (no alloc, no lock, no syscall); pullBlock only reads them + memcpys.
//   The control thread NEVER touches this sentinel's per-block state.
//
// RT-safety contract (docs/architecture/T2511_RT_SAFETY_REVIEW.md §2, §3):
//   - bindBlock(): audio thread only. Plain stores. Zero alloc/lock/syscall.
//   - pullBlock(): audio thread only. copyFrom/clear over the bound inputs
//     exactly as the engine did inline. Zero alloc/lock/syscall.
//   - The sentinel is constructed once in the engine ctor (non-RT) and lives
//     as long as the engine; it is never retired through the deferred-free
//     queue (only FileInputProcessors are).

#pragma once

#include <cstring>

#include <juce_audio_basics/juce_audio_basics.h>

#include "Recorder/Playback/PlaybackSource.h"

namespace map2::recorder {

/**
 * "Live device input" sentinel PlaybackSource.
 *
 * Reproduces Map2AudioEngine::audioCallback's original input-copy block
 * (:2283-2311) verbatim. The engine binds the current block's raw device
 * input pointers + channel mode + channel counts via bindBlock() right
 * before driving the ChainInputSwitch; pullBlock() then fills the output
 * buffer exactly as the engine used to fill it inline.
 */
class LiveInputSource final : public PlaybackSource {
public:
    /// Channel-mode mirror of Map2AudioEngine::InputChannelMode. Kept local
    /// so this header stays decoupled from the engine header (the engine
    /// passes static_cast<int>(inputChannelMode_); the values match 1:1).
    enum class InputChannelMode : int {
        MonoLeft  = 0,
        MonoRight = 1,
        Stereo    = 2,
    };

    LiveInputSource() noexcept = default;
    ~LiveInputSource() override = default;

    LiveInputSource(const LiveInputSource&)            = delete;
    LiveInputSource& operator=(const LiveInputSource&) = delete;

    /**
     * Bind this block's device inputs + routing. AUDIO-THREAD ONLY — called
     * by the engine immediately before the switch is driven, in the same
     * callback. Plain stores; no alloc/lock/syscall.
     *
     * @param inputs            The engine's raw device input channel pointers
     *                          (may contain nullptr entries — handled exactly
     *                          as the original code: clear that channel).
     * @param safeInputChannels The clamped device input channel count
     *                          (the engine's `safeInputChannels`).
     * @param copyInputChannels min(safeInputChannels, processChannels) — the
     *                          engine's `copyInputChannels` for Stereo mode.
     * @param processChannels   The engine's `processChannels` (target buffer
     *                          channel count).
     * @param mode              The engine's InputChannelMode for this block.
     */
    void bindBlock(const float* const* inputs,
                   int safeInputChannels,
                   int copyInputChannels,
                   int processChannels,
                   InputChannelMode mode) noexcept {
        inputs_            = inputs;
        safeInputChannels_ = safeInputChannels;
        copyInputChannels_ = copyInputChannels;
        processChannels_   = processChannels;
        mode_              = mode;
    }

    // ------------------------------------------------------------------
    // PlaybackSource interface (RT-CRITICAL) — the today-path.
    // ------------------------------------------------------------------

    /**
     * Fill `outputs` from the bound device inputs. This is a sample-for-
     * sample reproduction of Map2AudioEngine.cpp:2283-2311.
     *
     * `numChannels` is the channel count the switch is writing (the engine's
     * processChannels for that span); `numSamples` is the span length. The
     * switch passes write-pointers offset to the current sub-span start, so
     * this method always writes from sample 0 of each `outputs[ch]` — but the
     * source inputs are likewise read from offset 0 of the block. Because the
     * live path never registers a sample-accurate trigger that would split a
     * block (the only triggers in v1 flip live<->file at block-aligned punch
     * points), `numSamples` == the engine's processSamples and the copy is
     * the original whole-block copy. Always returns true (live audio is
     * always "produced"; the original code never silenced on a present
     * device).
     */
    bool pullBlock(float* const* outputs,
                   int numChannels,
                   int numSamples) noexcept override {
        // Mirror of the engine's processChannels clamp: never write more
        // channels than the caller offered.
        const int processChannels = numChannels;

        if (mode_ == InputChannelMode::Stereo) {
            // ---- Original Stereo block (:2284-2295) ----
            const int copyInputChannels =
                copyInputChannels_ < processChannels ? copyInputChannels_
                                                     : processChannels;
            for (int ch = 0; ch < copyInputChannels; ++ch) {
                if (inputs_ != nullptr && inputs_[ch] != nullptr) {
                    // buffer.copyFrom(ch, 0, inputs[ch], processSamples)
                    std::memcpy(outputs[ch], inputs_[ch],
                                static_cast<size_t>(numSamples) * sizeof(float));
                } else {
                    // buffer.clear(ch, 0, processSamples) — only when null.
                    std::memset(outputs[ch], 0,
                                static_cast<size_t>(numSamples) * sizeof(float));
                }
            }
            // Clear any extra channels beyond input count (:2293-2295).
            for (int ch = copyInputChannels; ch < processChannels; ++ch) {
                std::memset(outputs[ch], 0,
                            static_cast<size_t>(numSamples) * sizeof(float));
            }
        } else {
            // ---- Original Mono block (:2296-2311) ----
            const int sourceChannel =
                (mode_ == InputChannelMode::MonoRight) ? 1 : 0;
            const int monoCopyChannels = processChannels < 2 ? processChannels : 2;
            const bool sourceAvailable =
                sourceChannel < safeInputChannels_
                && inputs_ != nullptr
                && inputs_[sourceChannel] != nullptr;

            for (int ch = 0; ch < monoCopyChannels; ++ch) {
                if (sourceAvailable) {
                    std::memcpy(outputs[ch], inputs_[sourceChannel],
                                static_cast<size_t>(numSamples) * sizeof(float));
                } else {
                    std::memset(outputs[ch], 0,
                                static_cast<size_t>(numSamples) * sizeof(float));
                }
            }
            for (int ch = monoCopyChannels; ch < processChannels; ++ch) {
                std::memset(outputs[ch], 0,
                            static_cast<size_t>(numSamples) * sizeof(float));
            }
        }

        return true;  // live input is always "produced" (matches original).
    }

private:
    // Per-block state, written by bindBlock() and read by pullBlock() on the
    // SAME audio-thread callback. Non-atomic by design: never touched by any
    // other thread.
    const float* const* inputs_ = nullptr;
    int safeInputChannels_ = 0;
    int copyInputChannels_ = 0;
    int processChannels_   = 0;
    InputChannelMode mode_ = InputChannelMode::Stereo;
};

}  // namespace map2::recorder
