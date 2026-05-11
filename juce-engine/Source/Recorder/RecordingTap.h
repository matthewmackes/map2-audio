// =============================================================================
// T2507-1 — RecordingTap (SPSC ring buffer for one audio tap).
// =============================================================================
//
// One ring per tap. A tap captures the input to a chain (pre-FX) or
// the output of a chain (post-FX) — see T2507-2 TapNode for the audio
// processor that owns one of these rings.
//
// RT-safety contract (operator-locked 2026-05-11):
//   - Audio-thread side: pushAudioFrame() is called from the JUCE
//     audioCallback. It never allocates, never locks, never syscalls.
//     Cost is bounded by a memcpy of (numChannels * numSamples *
//     sizeof(float)) bytes + a juce::AbstractFifo prepareToWrite /
//     finishedWrite pair.
//   - Writer-thread side: prepareToReadFrame() / finishedReadFrame()
//     are called from the IoUringWriter thread (T2507-4). The writer
//     thread is non-RT and can take its time.
//   - Overflow policy: drop-newest. When the ring is full, the audio
//     thread drops the incoming buffer and increments overflowCount_
//     atomically. The live signal continues uninterrupted; the
//     recorded take loses a window (marked in the sidecar JSON).
//
// Shape (operator-locked 2026-05-11):
//   - 16 frames per ring (~340 ms cushion at 48 kHz when each frame
//     is one audio-callback buffer).
//   - 1024 samples per frame (covers any quantum up to 1024; the
//     production deployment runs at 64).
//   - Up to MAX_TAP_CHANNELS channels per frame (default 2; raised
//     when a chain uses >2 channels).
//
// Memory footprint: 16 frames * 2 channels * 1024 samples * 4 bytes
// = 131 072 bytes (128 KB) per tap. A session with 8 chains * 2 taps
// = 16 taps occupies 2 MB of pinned audio-thread memory.

#pragma once

#include <array>
#include <atomic>
#include <cstdint>
#include <cstring>

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_core/juce_core.h>

namespace map2::recorder {

constexpr int kTapRingFrameCount     = 16;
constexpr int kTapMaxSamplesPerFrame = 1024;
constexpr int kTapMaxChannels        = 8;  // Hard ceiling; chains rarely exceed 2.

// juce::AbstractFifo reserves one sentinel slot to disambiguate
// empty vs full (`getFreeSpace() = bufferSize - getNumReady() - 1`),
// so we allocate frame storage for kTapRingFrameCount + 1 slots to
// get the operator-locked "16 in flight" capacity.
constexpr int kTapRingStorageSlots = kTapRingFrameCount + 1;

struct RecordingTapFrame {
    // Pre-allocated channel buffers. The audio thread copies into
    // channels[0..numChannels-1][0..numSamples-1] then publishes.
    float channels[kTapMaxChannels][kTapMaxSamplesPerFrame];
    int   numChannels = 0;
    int   numSamples  = 0;
    // Sample-counter at the start of this frame. The writer
    // serializes this into the sidecar JSON so the operator can
    // reconstruct gaps from drop-newest overflows.
    std::int64_t startSampleIndex = 0;
};

/**
 * Single-producer / single-consumer audio ring for one tap.
 *
 * Producer: the JUCE audio callback (one specific tap node).
 * Consumer: the IoUringWriter thread for the same tap.
 *
 * No allocations on either side after construction.
 */
class RecordingTap {
public:
    RecordingTap() noexcept = default;

    // Non-copyable / non-movable: the pre-allocated frame array
    // would be expensive to move and there's no use case.
    RecordingTap(const RecordingTap&)            = delete;
    RecordingTap& operator=(const RecordingTap&) = delete;
    RecordingTap(RecordingTap&&)                 = delete;
    RecordingTap& operator=(RecordingTap&&)      = delete;

    /**
     * RT-safe write from the audio callback. Returns true if the
     * frame was queued, false if the ring was full (caller can drop
     * silently; the overflow counter is bumped automatically).
     *
     * `startSampleIndex` is the sample-counter at the start of this
     * frame — the audio callback maintains a per-tap monotonic
     * counter so the writer can detect gaps later.
     *
     * Caller guarantees:
     *   - numSamples > 0 and <= kTapMaxSamplesPerFrame.
     *   - numChannels > 0 and <= kTapMaxChannels.
     *   - inputs[ch] points to numSamples valid floats for each
     *     ch in [0, numChannels).
     *
     * Cost: numChannels memcpy() calls. No allocations, no locks.
     */
    bool pushAudioFrame(const float* const* inputs,
                        int numChannels,
                        int numSamples,
                        std::int64_t startSampleIndex) noexcept
    {
        int start1, size1, start2, size2;
        fifo_.prepareToWrite(1, start1, size1, start2, size2);

        if (size1 <= 0) {
            // Ring full. Drop-newest per the operator-locked overflow
            // policy. The live signal keeps flowing; the recording
            // gap is reconstructable from the sample-counter jump.
            overflowCount_.fetch_add(1, std::memory_order_release);
            return false;
        }

        auto& frame = ring_[static_cast<size_t>(start1)];
        const int clampedSamples  = std::min(numSamples, kTapMaxSamplesPerFrame);
        const int clampedChannels = std::min(numChannels, kTapMaxChannels);
        frame.numSamples       = clampedSamples;
        frame.numChannels      = clampedChannels;
        frame.startSampleIndex = startSampleIndex;

        for (int ch = 0; ch < clampedChannels; ++ch) {
            std::memcpy(frame.channels[ch],
                        inputs[ch],
                        static_cast<size_t>(clampedSamples) * sizeof(float));
        }

        fifo_.finishedWrite(1);
        dataReady_.store(true, std::memory_order_release);
        return true;
    }

    /**
     * Non-RT read from the writer thread. Returns a pointer to the
     * next frame the writer should drain, or nullptr if the ring
     * is empty.
     *
     * The caller MUST call finishedReadFrame() after copying the
     * data out — until then, the slot is not freed for the
     * producer.
     */
    const RecordingTapFrame* prepareToReadFrame() noexcept
    {
        int start1, size1, start2, size2;
        fifo_.prepareToRead(1, start1, size1, start2, size2);
        if (size1 <= 0) {
            return nullptr;
        }
        readSlot_ = start1;
        return &ring_[static_cast<size_t>(start1)];
    }

    /** Release the frame returned by prepareToReadFrame(). */
    void finishedReadFrame() noexcept
    {
        fifo_.finishedRead(1);
        // dataReady_ is only an optimization for the writer to
        // sleep when idle; on the read path we leave it for the
        // next pushAudioFrame to set.
    }

    /** Snapshot of the drop-newest counter for sidecar JSON. */
    std::uint64_t overflowCount() const noexcept
    {
        return overflowCount_.load(std::memory_order_acquire);
    }

    /** Reader-thread sleep hint. Non-binding. */
    bool hasDataReady() const noexcept
    {
        return dataReady_.load(std::memory_order_acquire);
    }

    /** For tests: number of unread frames. Not RT-safe; do not call
        from the audio callback. */
    int getNumReady() const noexcept
    {
        return fifo_.getNumReady();
    }

private:
    // Pre-allocated frame storage. Constructed once; never reallocated.
    // Storage count is one larger than kTapRingFrameCount so the
    // AbstractFifo sentinel slot doesn't steal a usable frame.
    std::array<RecordingTapFrame, kTapRingStorageSlots> ring_{};
    juce::AbstractFifo fifo_{kTapRingStorageSlots};

    std::atomic<bool>          dataReady_     {false};
    std::atomic<std::uint64_t> overflowCount_ {0};

    // Slot we returned from prepareToReadFrame; finishedReadFrame
    // uses it for an assert-on-mismatch in debug builds (Release
    // builds drop the assertion).
    int readSlot_ = -1;
};

}  // namespace map2::recorder
