// =============================================================================
// T2511-1 — PlaybackRing (SPSC ring buffer for one playback source).
// =============================================================================
//
// The consumer-mirror of T2507's RecordingTap (RecordingTap.h). Where
// RecordingTap has the audio thread PUSH and a writer thread READ, the
// PlaybackRing has the audio thread POP (consume) and an off-thread
// reader PUSH (produce). Same juce::AbstractFifo discipline, same
// pre-allocated std::array + sentinel-slot convention, same drop-policy
// shape — only the direction is reversed.
//
// RT-safety contract (operator-approved design contract,
// docs/architecture/T2511_RT_SAFETY_REVIEW.md §2, §4):
//   - Audio-thread side: popAudioFrame() is called from the JUCE
//     audioCallback. It never allocates, never locks, never syscalls.
//     Cost is bounded by a juce::AbstractFifo prepareToRead /
//     finishedRead pair + a memcpy of (numChannels * numSamples *
//     sizeof(float)) bytes out to the output buffer.
//   - Reader-thread side: pushFrame() is called from the playback
//     reader thread (the analogue of IoUringWriter's writerThread_).
//     The reader thread is non-RT and may allocate / block / syscall;
//     it does all the io_uring read + WAV decode work and fills the
//     ring ahead of the audio thread.
//   - Underrun policy: drop-to-silence + count (§4.2). When the ring is
//     empty (the reader fell behind), popAudioFrame() returns false and
//     bumps underrunCount_ atomically. The audio thread MUST then output
//     silence for that buffer — it NEVER blocks waiting for the reader.
//     This is the exact mirror of RecordingTap's drop-newest-and-count
//     overflow policy (RecordingTap.h:113-119), run as a consumer.
//   - Producer overflow policy: drop-newest. When the ring is full (the
//     reader ran ahead faster than the audio thread consumed — should be
//     rare given the deep cushion below), pushFrame() returns false and
//     bumps overflowCount_. The reader retries the same frame later.
//
// Shape / cushion (§4.3 — restated in REAL milliseconds at the actual
// 64-sample playback frame, per the operator's §4.3 follow-up):
//   - The record ring is 16 frames. At the 1024-sample record frame that
//     is ~340 ms, but at a 64-sample PLAYBACK frame 16 frames is only
//     16 * 64 / 48000 = ~21 ms of cushion — not the ~340 ms the record
//     frame size implies. ~21 ms is too shallow to absorb a non-isolated
//     reader-thread scheduler hiccup.
//   - Because the consumer here is hard-real-time and the producer (the
//     reader thread) is best-effort, the playback ring is sized DEEPER:
//     kPlaybackRingFrameCount = 64 frames. At a 64-sample frame that is
//     64 * 64 / 48000 = ~85.3 ms of look-ahead cushion — ~4x the record
//     ring, enough to ride out a multi-tens-of-ms reader stall. The
//     reader can burst-fill ahead to fill this depth.
//   - kPlaybackMaxSamplesPerFrame = 1024 and kPlaybackMaxChannels = 8
//     match the record-side ceilings so a frame slot fits any quantum up
//     to 1024 (production runs at 64).
//
// Memory footprint: 64 frames * 8 channels * 1024 samples * 4 bytes
// = 2 097 152 bytes (2 MB) per playback source at the 8-channel ceiling;
// a stereo source touches the first 2 of 8 channel buffers (512 KB live).

#pragma once

#include <array>
#include <atomic>
#include <cstdint>
#include <cstring>

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_core/juce_core.h>

namespace map2::recorder {

// Sized DEEPER than the record ring on purpose (see header comment / §4.3):
// the consumer is hard-RT, the producer is best-effort, so we trade memory
// for reader-thread hiccup tolerance. 64 frames @ 64 samples = ~85.3 ms.
constexpr int kPlaybackRingFrameCount    = 64;
constexpr int kPlaybackMaxSamplesPerFrame = 1024;  // Matches kTapMaxSamplesPerFrame.
constexpr int kPlaybackMaxChannels        = 8;     // Matches kTapMaxChannels.

// juce::AbstractFifo reserves one sentinel slot to disambiguate empty
// vs full (`getFreeSpace() = bufferSize - getNumReady() - 1`), so we
// allocate frame storage for kPlaybackRingFrameCount + 1 slots to get
// the documented "64 in flight" capacity — same +1 convention as
// kTapRingStorageSlots (RecordingTap.h:55).
constexpr int kPlaybackRingStorageSlots = kPlaybackRingFrameCount + 1;

struct PlaybackFrame {
    // Pre-allocated channel buffers. The reader thread fills
    // channels[0..numChannels-1][0..numSamples-1] then publishes; the
    // audio thread memcpys them out to the engine output buffer.
    float channels[kPlaybackMaxChannels][kPlaybackMaxSamplesPerFrame];
    int   numChannels = 0;
    int   numSamples  = 0;
    // Sample-counter at the start of this frame. The reader stamps it
    // from the WAV read position so the consumer / diagnostics can
    // reconstruct the play position and detect gaps.
    std::int64_t startSampleIndex = 0;
};

/**
 * Single-producer / single-consumer audio ring for one playback source.
 *
 * Producer: the playback reader thread (off-thread, non-RT) — fills the
 *           ring from io_uring WAV reads ahead of playback.
 * Consumer: the JUCE audio callback (one specific FileInputProcessor) —
 *           pops one frame per buffer and memcpys it to the output.
 *
 * No allocations on either side after construction. The pre-allocated
 * frame array is constructed once and never reallocated.
 */
class PlaybackRing {
public:
    PlaybackRing() noexcept = default;

    // Non-copyable / non-movable: the pre-allocated frame array would be
    // expensive to move and there's no use case — same discipline as
    // RecordingTap (RecordingTap.h:83-86).
    PlaybackRing(const PlaybackRing&)            = delete;
    PlaybackRing& operator=(const PlaybackRing&) = delete;
    PlaybackRing(PlaybackRing&&)                 = delete;
    PlaybackRing& operator=(PlaybackRing&&)      = delete;

    // ------------------------------------------------------------------
    // Audio-thread side (RT-CRITICAL) — consumer.
    // ------------------------------------------------------------------

    /**
     * RT-safe consume from the audio callback. Reads ONE frame from the
     * ring and memcpys it into the caller's output channel pointers.
     * Returns true if a frame was popped, false on underrun (ring empty
     * — reader fell behind). On underrun the caller MUST output silence;
     * underrunCount_ is bumped automatically.
     *
     * The caller supplies `numChannels` output pointers and the
     * `numSamples` it wants. The frame's own numSamples / numChannels
     * are clamped against both the request and the slot ceiling, so a
     * mismatched frame can never write past the caller's buffer or read
     * past the slot. Channels the frame does not cover (request wider
     * than the frame) are zero-filled. Samples the frame does not cover
     * (frame shorter than the request) are zero-filled per channel.
     *
     * Caller guarantees:
     *   - numSamples  > 0.
     *   - numChannels > 0.
     *   - outputs[ch] points to numSamples writable floats for each
     *     ch in [0, numChannels).
     *
     * Cost: one prepareToRead/finishedRead pair + up to numChannels
     * memcpy() calls + optional zero-fill memsets. No allocations, no
     * locks, no syscalls. Mirror of RecordingTap::pushAudioFrame run as
     * a consumer (RecordingTap.h:105-137).
     */
    bool popAudioFrame(float* const* outputs,
                       int numChannels,
                       int numSamples) noexcept
    {
        int start1, size1, start2, size2;
        fifo_.prepareToRead(1, start1, size1, start2, size2);

        if (size1 <= 0) {
            // Ring empty — the reader thread fell behind. Drop to
            // silence per the operator-approved underrun policy (§4.2).
            // NEVER block waiting for the reader.
            underrunCount_.fetch_add(1, std::memory_order_release);
            return false;
        }

        const auto& frame = ring_[static_cast<size_t>(start1)];

        const int reqChannels   = numChannels;
        const int reqSamples     = numSamples;
        const int frameChannels  = frame.numChannels;
        const int frameSamples    = std::min(frame.numSamples, reqSamples);

        for (int ch = 0; ch < reqChannels; ++ch) {
            float* dst = outputs[ch];
            if (ch < frameChannels) {
                std::memcpy(dst,
                            frame.channels[ch],
                            static_cast<size_t>(frameSamples) * sizeof(float));
                // Zero-fill any tail the (shorter) frame didn't cover so
                // the audio thread never reads stale output samples.
                if (frameSamples < reqSamples) {
                    std::memset(dst + frameSamples,
                                0,
                                static_cast<size_t>(reqSamples - frameSamples)
                                    * sizeof(float));
                }
            } else {
                // The caller requested more channels than the frame
                // carries — output silence on the extra channels.
                std::memset(dst,
                            0,
                            static_cast<size_t>(reqSamples) * sizeof(float));
            }
        }

        fifo_.finishedRead(1);
        return true;
    }

    // ------------------------------------------------------------------
    // Reader-thread side (non-RT) — producer.
    // ------------------------------------------------------------------

    /**
     * Non-RT fill from the reader thread. Copies one frame's audio into
     * the next free ring slot. Returns true if the frame was queued,
     * false if the ring was full (drop-newest — the reader ran ahead;
     * overflowCount_ is bumped and the reader should retry this frame
     * after the audio thread drains a slot).
     *
     * Caller guarantees:
     *   - numSamples  > 0 and <= kPlaybackMaxSamplesPerFrame.
     *   - numChannels > 0 and <= kPlaybackMaxChannels.
     *   - inputs[ch] points to numSamples valid floats for each
     *     ch in [0, numChannels).
     *
     * This runs OFF the audio thread, so allocations / blocking are
     * permitted in the caller; this method itself does neither.
     */
    bool pushFrame(const float* const* inputs,
                   int numChannels,
                   int numSamples,
                   std::int64_t startSampleIndex) noexcept
    {
        int start1, size1, start2, size2;
        fifo_.prepareToWrite(1, start1, size1, start2, size2);

        if (size1 <= 0) {
            // Ring full — reader ran ahead of the consumer. Drop-newest;
            // the reader retries this frame on the next pass.
            overflowCount_.fetch_add(1, std::memory_order_release);
            return false;
        }

        auto& frame = ring_[static_cast<size_t>(start1)];
        const int clampedSamples  = std::min(numSamples, kPlaybackMaxSamplesPerFrame);
        const int clampedChannels = std::min(numChannels, kPlaybackMaxChannels);
        frame.numSamples       = clampedSamples;
        frame.numChannels      = clampedChannels;
        frame.startSampleIndex = startSampleIndex;

        for (int ch = 0; ch < clampedChannels; ++ch) {
            std::memcpy(frame.channels[ch],
                        inputs[ch],
                        static_cast<size_t>(clampedSamples) * sizeof(float));
        }

        fifo_.finishedWrite(1);
        return true;
    }

    // ------------------------------------------------------------------
    // Counters / introspection.
    // ------------------------------------------------------------------

    /** Snapshot of the drop-to-silence underrun counter (§5.4 — the
        symmetric playback-side counter the §8 gate asserts == 0). */
    std::uint64_t underrunCount() const noexcept
    {
        return underrunCount_.load(std::memory_order_acquire);
    }

    /** Snapshot of the producer-side drop-newest counter. */
    std::uint64_t overflowCount() const noexcept
    {
        return overflowCount_.load(std::memory_order_acquire);
    }

    /** For tests / the reader thread: number of frames ready to pop.
        Not RT-safe; do not call from the audio callback. */
    int getNumReady() const noexcept
    {
        return fifo_.getNumReady();
    }

    /** For the reader thread: number of free slots to fill. Not RT-safe;
        do not call from the audio callback. */
    int getFreeSpace() const noexcept
    {
        return fifo_.getFreeSpace();
    }

private:
    // Pre-allocated frame storage. Constructed once; never reallocated.
    // Storage count is one larger than kPlaybackRingFrameCount so the
    // AbstractFifo sentinel slot doesn't steal a usable frame.
    std::array<PlaybackFrame, kPlaybackRingStorageSlots> ring_{};
    juce::AbstractFifo fifo_{kPlaybackRingStorageSlots};

    std::atomic<std::uint64_t> underrunCount_ {0};
    std::atomic<std::uint64_t> overflowCount_ {0};
};

}  // namespace map2::recorder
