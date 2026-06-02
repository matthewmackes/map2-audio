// =============================================================================
// T2511-4 — TriggerQueue (SPSC ring of sample-accurate source-switch triggers).
// =============================================================================
//
// Carries `apply_at_sample` punch triggers from the controller-host
// control thread to the audio thread. It is the playback analogue of
// T2507-6's automation ring (EngineRecorder.h:54, :188-206): same
// juce::AbstractFifo discipline, same pre-allocated std::array, same
// drop-newest-on-full policy with an atomic counter, same sentinel-slot
// convention.
//
// RT-safety contract (docs/architecture/T2511_RT_SAFETY_REVIEW.md §6):
//   - Control thread (producer): push() one {applyAtSample, sourceIndex}
//     entry. Lock-free, allocation-free. Drop-newest on full + bump
//     overflowCount_ (mirror of EngineRecorder.h:196-199).
//   - Audio thread (consumer): at buffer start, DRAIN all pending
//     triggers into stack locals (drainPending) — never allocate to
//     receive a trigger (§6 rule 2). The audio thread then applies the
//     switch at the exact sample offset within the current buffer
//     (the switch happens INSIDE processBlock only — §6 rule 1).
//   - Out-of-window clamp policy (§6 rule 3): a trigger whose
//     applyAtSample falls before the current buffer's start applies at
//     sample 0 of the current buffer (clamp, do not drop); one that
//     falls after the current buffer's end is HELD for a later buffer
//     (re-queued by the consumer). The audio thread never spins/waits
//     for "the right buffer."
//
// Sizing: kTriggerRingCapacity = 256 entries. Punch triggers are sparse
// (a handful per second under continuous punch-in every 5 s), so 256 is a
// generous cushion versus the automation ring's 2048 (which absorbs dense
// per-sample parameter gestures). Storage = capacity + 1 for the
// AbstractFifo sentinel slot.

#pragma once

#include <array>
#include <atomic>
#include <cstdint>

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_core/juce_core.h>

namespace map2::recorder {

constexpr int kTriggerRingCapacity = 256;

// juce::AbstractFifo sentinel slot — allocate one extra so the
// operator-visible capacity is the round 256 (same +1 convention as
// kAutomationRingStorageSlots, EngineRecorder.h:60).
constexpr int kTriggerRingStorageSlots = kTriggerRingCapacity + 1;

/// One sample-accurate source-switch request.
struct SourceSwitchTrigger {
    /// Absolute engine sample index at which the switch should take
    /// effect, timestamped by the controller-host against the shared
    /// sample clock (§6). Compared to the buffer's start sample on the
    /// audio thread to derive the intra-buffer offset.
    std::int64_t applyAtSample = 0;
    /// Index of the desired source the ChainInputSwitch should select
    /// (e.g. 0 = live, 1 = playback). The audio thread maps this index
    /// to the actual source pointer it holds.
    int desiredSourceIndex = 0;
};

/**
 * Single-producer (control thread) / single-consumer (audio thread)
 * trigger ring.
 *
 * No allocations on either side after construction.
 */
class TriggerQueue {
public:
    TriggerQueue() noexcept = default;

    TriggerQueue(const TriggerQueue&)            = delete;
    TriggerQueue& operator=(const TriggerQueue&) = delete;
    TriggerQueue(TriggerQueue&&)                 = delete;
    TriggerQueue& operator=(TriggerQueue&&)      = delete;

    // ------------------------------------------------------------------
    // Control-thread side (non-RT) — producer.
    // ------------------------------------------------------------------

    /**
     * Enqueue a trigger. Returns true if queued, false if the ring was
     * full (drop-newest; overflowCount_ bumped). Lock-free,
     * allocation-free. Mirror of EngineRecorder::capturePluginParameter
     * (EngineRecorder.h:188-206).
     */
    bool push(std::int64_t applyAtSample, int desiredSourceIndex) noexcept {
        int start1, size1, start2, size2;
        fifo_.prepareToWrite(1, start1, size1, start2, size2);
        if (size1 <= 0) {
            overflowCount_.fetch_add(1, std::memory_order_release);
            return false;
        }
        auto& entry = ring_[static_cast<size_t>(start1)];
        entry.applyAtSample      = applyAtSample;
        entry.desiredSourceIndex = desiredSourceIndex;
        fifo_.finishedWrite(1);
        return true;
    }

    // ------------------------------------------------------------------
    // Audio-thread side (RT-CRITICAL) — consumer.
    // ------------------------------------------------------------------

    /**
     * Drain up to `maxEntries` pending triggers into the caller's stack
     * array `out`. Returns the number drained. RT-safe: lock-free, no
     * allocation. Called at buffer start by the audio thread; `out` is a
     * stack local (§6 rule 2). Mirror of EngineRecorder::drainAutomation
     * (EngineRecorder.h:215-233).
     */
    int drainPending(SourceSwitchTrigger* out, int maxEntries) noexcept {
        if (out == nullptr || maxEntries <= 0) {
            return 0;
        }
        int start1, size1, start2, size2;
        fifo_.prepareToRead(maxEntries, start1, size1, start2, size2);
        const int total = size1 + size2;
        int written = 0;
        for (int i = 0; i < size1; ++i) {
            out[written++] = ring_[static_cast<size_t>(start1 + i)];
        }
        for (int i = 0; i < size2; ++i) {
            out[written++] = ring_[static_cast<size_t>(start2 + i)];
        }
        fifo_.finishedRead(total);
        return total;
    }

    /**
     * Resolve a drained trigger's intra-buffer sample offset against the
     * current buffer window, applying the §6 rule-3 clamp policy. Pure
     * helper (no state) so the consumer's switch logic is testable in
     * isolation.
     *
     * @param trigger          A drained trigger.
     * @param bufferStartSample Absolute sample index of buffer sample 0.
     * @param numSamples        Samples in the current buffer.
     * @param[out] outOffset    Intra-buffer sample offset to apply the
     *                          switch at (only valid when result is
     *                          Apply; in [0, numSamples)).
     * @return Apply  — switch this buffer at outOffset (clamped to 0 if
     *                  the trigger was late).
     *         Hold   — trigger is for a later buffer; the consumer must
     *                  re-queue it (push) and not apply it now.
     */
    enum class Resolution { Apply, Hold };

    static Resolution resolve(const SourceSwitchTrigger& trigger,
                              std::int64_t bufferStartSample,
                              int numSamples,
                              int& outOffset) noexcept {
        const std::int64_t bufferEndSample =
            bufferStartSample + static_cast<std::int64_t>(numSamples);

        if (trigger.applyAtSample >= bufferEndSample) {
            // After this buffer — hold for a later one (clamp-not-drop).
            outOffset = 0;
            return Resolution::Hold;
        }
        if (trigger.applyAtSample <= bufferStartSample) {
            // At/before buffer start (clock skew / late delivery) — clamp
            // to sample 0 of THIS buffer. (§6 rule 3 + §-approval-note 3:
            // up to one buffer early under skew, an accepted tradeoff.)
            outOffset = 0;
            return Resolution::Apply;
        }
        // Inside this buffer — sample-accurate offset.
        outOffset = static_cast<int>(trigger.applyAtSample - bufferStartSample);
        return Resolution::Apply;
    }

    // ------------------------------------------------------------------
    // Counters / introspection.
    // ------------------------------------------------------------------

    /** Snapshot of the drop-newest counter. */
    std::uint64_t overflowCount() const noexcept {
        return overflowCount_.load(std::memory_order_acquire);
    }

    /** For tests / the control thread: number of queued triggers. Not
        RT-safe; do not call from the audio callback. */
    int getNumReady() const noexcept {
        return fifo_.getNumReady();
    }

private:
    std::array<SourceSwitchTrigger, kTriggerRingStorageSlots> ring_{};
    juce::AbstractFifo fifo_{kTriggerRingStorageSlots};

    std::atomic<std::uint64_t> overflowCount_ {0};
};

}  // namespace map2::recorder
