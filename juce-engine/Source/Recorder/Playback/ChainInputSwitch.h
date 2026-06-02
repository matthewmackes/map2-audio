// =============================================================================
// T2511-2 — ChainInputSwitch (juce::AudioProcessor that atomically swaps a
//           chain's input source).
// =============================================================================
//
// Swaps a chain's input between candidate PlaybackSources (a
// FileInputProcessor for playback, or — in a later slice — a
// LiveInputSource for the chain's device input) without ever blocking the
// audio thread. It is the SAME SHAPE as T2507's armed_ flag (TapNode.h),
// only the payload differs: an atomic POINTER instead of an atomic bool.
//
// RT-safety contract (docs/architecture/T2511_RT_SAFETY_REVIEW.md §3, §6):
//   - Audio thread: read currentSource_.load(memory_order_acquire)
//     EXACTLY ONCE at buffer start into a local; pull the whole buffer
//     from that local. NEVER re-load the atomic mid-block (§3.2 rule 2 —
//     re-loading could tear the buffer across two sources and, worse,
//     dereference an object the control thread is about to free).
//   - Sample-accurate switching WITHIN a buffer (§6) is achieved by
//     QUEUED sample-offset triggers (TriggerQueue), NOT by re-loading the
//     atomic. The audio thread drains triggers at buffer start into a
//     stack array, then walks the buffer in sub-spans, switching the
//     ACTIVE LOCAL pointer at each trigger's offset by resolving the
//     trigger's source INDEX against a fixed, pre-registered source
//     table — no atomic re-load, no allocation.
//   - Control thread: setSource() swaps the published pointer via
//     compare_exchange_strong(acq_rel) — lock-free, never blocks the
//     audio thread (§3.2 rule 3). acquire/release gives the happens-
//     before so the audio thread only ever sees a fully-constructed,
//     pre-filled source (§3.2 rule 4).
//
// RECLAMATION (the §3.3 reviewer note — RCU-grace-period discipline):
//   setSource() does NOT delete the old source inline. It RETURNS the old
//   pointer to the caller, and a deferred-free seam (retireSource) hands
//   old pointers to a caller-owned deferred-free queue that the control /
//   message thread drains at least one full audio period AFTER the swap
//   is observed. The audio thread may still be holding the old pointer in
//   its per-buffer local when the CAS lands; deferring the free by >= one
//   period guarantees that local has been dropped before the object is
//   destroyed. This is the audio-graph analogue of RCU grace-period
//   reclamation. ChainInputSwitch NEVER owns or frees a source — ownership
//   and the deferred-free queue live in the caller (the graph builder /
//   RecorderService), exactly as TapNode never frees its writer's ring.

#pragma once

#include <array>
#include <atomic>
#include <cstdint>

#include <juce_audio_processors/juce_audio_processors.h>

#include "Recorder/Playback/PlaybackSource.h"
#include "Recorder/Playback/TriggerQueue.h"

namespace map2::recorder {

/**
 * Audio-graph node that produces audio from one of several registered
 * PlaybackSources, selected by an atomic pointer the control thread CASes
 * and by sample-accurate triggers the audio thread drains.
 *
 * Source ownership lives OUTSIDE this node (§3.3). The node holds only
 * NON-OWNING pointers: the live `currentSource_` atomic + a fixed
 * registration table indexed by source index (for sample-accurate
 * trigger resolution). The caller is responsible for keeping registered
 * sources alive until they are retired and drained from the deferred-free
 * queue.
 */
class ChainInputSwitch : public juce::AudioProcessor {
public:
    /// Maximum candidate sources a switch can hold (live, post-FX-wet
    /// playback, pre-FX playback + headroom). Fixed so the registration
    /// table is stack/pre-allocated — never grows on the audio thread.
    static constexpr int kMaxSources = 4;

    /// Maximum triggers drained per buffer into the stack array. Punch
    /// triggers are sparse; this bounds the per-buffer stack cost.
    static constexpr int kMaxTriggersPerBuffer = 16;

    /// Channel ceiling for the stack write-pointer array. Matches the
    /// PlaybackRing's kPlaybackMaxChannels (8) so a span pull can address
    /// every channel a source carries; declared locally so this header
    /// stays decoupled from PlaybackRing.h.
    static constexpr int kMaxChannels = 8;

    // sources_ is value-initialized ({} below), which zero-initializes
    // each std::atomic<PlaybackSource*> to nullptr. std::array::fill()
    // can't be used here because std::atomic is not copy-assignable.
    ChainInputSwitch() noexcept = default;

    ~ChainInputSwitch() override = default;

    ChainInputSwitch(const ChainInputSwitch&)            = delete;
    ChainInputSwitch& operator=(const ChainInputSwitch&) = delete;

    // ------------------------------------------------------------------
    // Control-thread API (non-RT). All swaps use the atomic seam.
    // ------------------------------------------------------------------

    /**
     * Register a candidate source at `index` for sample-accurate trigger
     * resolution. NON-RT: call from the control thread BEFORE the source
     * can be the target of a trigger. Non-owning — the caller owns
     * lifetime (§3.3). The pointer is published with release so the audio
     * thread observes a fully-constructed source when a trigger resolves
     * to it.
     */
    void registerSource(int index, PlaybackSource* source) noexcept {
        if (index < 0 || index >= kMaxSources) {
            return;
        }
        sources_[static_cast<size_t>(index)].store(
            source, std::memory_order_release);
    }

    /**
     * Atomically publish `desired` as the live source, returning the
     * OLD source pointer so the caller can RETIRE it via its deferred-
     * free queue (§3.3 — NEVER deleted here). Runs on the control thread.
     *
     * Uses compare_exchange_strong(acq_rel, acquire) in a CAS loop so a
     * concurrent control-thread caller (there should be only one) cannot
     * lose an update; the audio thread is never made to wait. The audio
     * thread observes either the old or the new pointer — never a tear.
     *
     * @return the previous source pointer (may be nullptr). The caller
     *         MUST defer its destruction by >= one audio period; pass it
     *         to retireSource() or an equivalent deferred-free queue.
     */
    PlaybackSource* setSource(PlaybackSource* desired) noexcept {
        PlaybackSource* expected = currentSource_.load(std::memory_order_acquire);
        while (!currentSource_.compare_exchange_strong(
                   expected, desired,
                   std::memory_order_acq_rel,
                   std::memory_order_acquire)) {
            // expected was reloaded with the current value; retry. On
            // this single-control-thread platform the loop runs at most
            // once, but the CAS is correct under contention regardless.
        }
        return expected;  // old source — caller defers its free.
    }

    /**
     * Deferred-free seam (§3.3). Hand the old source pointer to the
     * caller-owned deferred-free queue. This base implementation forwards
     * to the registered retire callback if one is set; ChainInputSwitch
     * itself NEVER calls delete. The caller wires a callback that pushes
     * the pointer onto an RCU-grace-period queue drained on the message
     * thread >= one audio period later.
     *
     * Provided as a convenience so the retire path is explicit and
     * testable; callers may equally ignore it and route setSource()'s
     * return value to their own queue directly.
     */
    void retireSource(PlaybackSource* old) noexcept {
        if (old != nullptr && retireCallback_ != nullptr) {
            retireCallback_(old);
        }
    }

    /// Install the deferred-free callback (non-RT, set once at wiring
    /// time). The callback is invoked from the CONTROL thread by
    /// retireSource(); it must enqueue, NOT delete inline.
    void setRetireCallback(void (*cb)(PlaybackSource*)) noexcept {
        retireCallback_ = cb;
    }

    /// Snapshot of the live source (non-RT introspection / tests).
    PlaybackSource* currentSource() const noexcept {
        return currentSource_.load(std::memory_order_acquire);
    }

    /// The trigger queue the controller-host pushes punch triggers into
    /// (control thread) and the audio thread drains (§6).
    TriggerQueue& triggerQueue() noexcept { return triggerQueue_; }

    /// Snapshot of the underrun count accumulated when a pulled source
    /// reported silence. Distinct from a source's own ring underruns;
    /// this counts buffers (or sub-spans) where the active source had no
    /// audio. Surfaced for the §8 gate.
    std::uint64_t silenceSpanCount() const noexcept {
        return silenceSpanCount_.load(std::memory_order_acquire);
    }

    // ------------------------------------------------------------------
    // juce::AudioProcessor interface
    // ------------------------------------------------------------------

    const juce::String getName() const override {
        return juce::String("ChainInputSwitch");
    }

    void prepareToPlay(double /*sampleRate*/, int /*bufferSize*/) override {
        // No allocation in the hot path — everything is pre-allocated.
        sampleClock_.store(0, std::memory_order_release);
    }

    void releaseResources() override {}

    bool isBusesLayoutSupported(const BusesLayout& layouts) const override {
        return layouts.getMainOutputChannelSet()
            == layouts.getMainInputChannelSet();
    }

    void processBlock(juce::AudioBuffer<float>& buffer,
                      juce::MidiBuffer& /*midi*/) override {
        // RT-CRITICAL PATH. Zero alloc / lock / syscall.
        const int numChannels = buffer.getNumChannels();
        const int numSamples  = buffer.getNumSamples();
        if (numChannels <= 0 || numSamples <= 0) {
            return;
        }

        // (1) Read the live source pointer EXACTLY ONCE into a local
        //     (§3.2 rule 1). This is the ONLY .load() of currentSource_
        //     in this function — never re-loaded mid-block.
        PlaybackSource* active = currentSource_.load(std::memory_order_acquire);

        // (2) Snapshot the buffer's absolute start sample (§6 rule 4 —
        //     read the shared clock with acquire).
        const std::int64_t bufferStart =
            sampleClock_.load(std::memory_order_acquire);

        // (3) Drain pending triggers into a STACK array (§6 rule 2 — no
        //     allocation to receive a trigger).
        SourceSwitchTrigger drained[kMaxTriggersPerBuffer];
        const int numDrained =
            triggerQueue_.drainPending(drained, kMaxTriggersPerBuffer);

        // (4) Resolve each trigger to an intra-buffer offset; build a
        //     sorted list of (offset, source) switch points. Triggers
        //     that resolve to Hold are re-queued (clamp-not-drop, §6
        //     rule 3) so a later buffer applies them.
        int     switchOffset[kMaxTriggersPerBuffer];
        PlaybackSource* switchSource[kMaxTriggersPerBuffer];
        int     numSwitches = 0;
        for (int i = 0; i < numDrained; ++i) {
            int offset = 0;
            const auto res = TriggerQueue::resolve(
                drained[i], bufferStart, numSamples, offset);
            if (res == TriggerQueue::Resolution::Hold) {
                // Re-queue for a later buffer (held, not dropped).
                triggerQueue_.push(drained[i].applyAtSample,
                                   drained[i].desiredSourceIndex);
                continue;
            }
            // Resolve the source INDEX to a registered pointer — NOT by
            // re-loading currentSource_. Out-of-range / unregistered
            // indices select silence (nullptr).
            PlaybackSource* target = nullptr;
            const int idx = drained[i].desiredSourceIndex;
            if (idx >= 0 && idx < kMaxSources) {
                target = sources_[static_cast<size_t>(idx)].load(
                    std::memory_order_acquire);
            }
            // Insertion-sort by offset so we walk the buffer in order.
            int pos = numSwitches;
            while (pos > 0 && switchOffset[pos - 1] > offset) {
                switchOffset[pos] = switchOffset[pos - 1];
                switchSource[pos] = switchSource[pos - 1];
                --pos;
            }
            switchOffset[pos] = offset;
            switchSource[pos] = target;
            ++numSwitches;
        }

        // (5) Walk the buffer in sub-spans, switching the ACTIVE LOCAL at
        //     each trigger offset. We pull each span from the local
        //     `active` pointer only — the atomic is never re-loaded.
        float* writePtrs[kMaxChannels];
        const int chCount = std::min(numChannels, kMaxChannels);

        int spanStart = 0;
        int switchIdx = 0;
        while (spanStart < numSamples) {
            // Apply any switches landing exactly at spanStart.
            while (switchIdx < numSwitches
                   && switchOffset[switchIdx] <= spanStart) {
                active = switchSource[switchIdx];
                ++switchIdx;
            }
            // Span runs until the next switch offset, or buffer end.
            int spanEnd = numSamples;
            if (switchIdx < numSwitches && switchOffset[switchIdx] > spanStart) {
                spanEnd = switchOffset[switchIdx];
            }
            const int spanLen = spanEnd - spanStart;

            // Pull this span from the (local) active source into offset
            // sub-pointers. No atomic re-load.
            for (int ch = 0; ch < chCount; ++ch) {
                writePtrs[ch] = buffer.getWritePointer(ch) + spanStart;
            }
            bool produced = false;
            if (active != nullptr) {
                produced = active->pullBlock(writePtrs, chCount, spanLen);
            }
            if (!produced) {
                // No active source, or the source underran — silence this
                // span (the source's own ring already counted any
                // underrun; we count the silenced span for the gate).
                for (int ch = 0; ch < numChannels; ++ch) {
                    buffer.clear(ch, spanStart, spanLen);
                }
                silenceSpanCount_.fetch_add(1, std::memory_order_release);
            } else {
                // Clear any channels beyond what the source covered.
                for (int ch = chCount; ch < numChannels; ++ch) {
                    buffer.clear(ch, spanStart, spanLen);
                }
            }
            spanStart = spanEnd;
        }

        // (6) Advance the shared sample clock for the next buffer (§6
        //     rule 4 — publish with release).
        sampleClock_.store(bufferStart + numSamples, std::memory_order_release);
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

private:
    // The live source (non-owning). Loaded once per buffer (acquire);
    // CASed from the control thread (acq_rel). §3.
    std::atomic<PlaybackSource*> currentSource_ {nullptr};

    // Fixed registration table for sample-accurate trigger resolution.
    // Indexed by SourceSwitchTrigger::desiredSourceIndex. Non-owning,
    // pre-allocated, never grows on the audio thread. Each slot is atomic
    // so a control-thread registerSource() publishes with release and the
    // audio-thread resolve reads with acquire.
    std::array<std::atomic<PlaybackSource*>, kMaxSources> sources_{};

    // Sample-accurate punch-trigger queue (§6). Control thread pushes,
    // audio thread drains.
    TriggerQueue triggerQueue_;

    // Shared sample clock (§6 rule 4). The audio thread advances it each
    // buffer (release); the controller-host timestamps triggers against
    // it (acquire).
    std::atomic<std::int64_t> sampleClock_ {0};

    // Diagnostics counter for the §8 gate.
    std::atomic<std::uint64_t> silenceSpanCount_ {0};

    // Deferred-free callback (§3.3). Non-owning; set once at wiring time.
    // Invoked by retireSource() on the control thread; MUST enqueue, not
    // delete inline.
    void (*retireCallback_)(PlaybackSource*) {nullptr};
};

}  // namespace map2::recorder
