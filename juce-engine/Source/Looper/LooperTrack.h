// =============================================================================
// LooperTrack — single track in the multi-track looper.
// =============================================================================
//
// Per-track state machine + audio storage. The looper is built on
// the same RT-safe primitives as T2507's recorder:
//   - Atomic flags for transport state (industry-standard pattern,
//     same shape as TapNode::armed_).
//   - Pre-allocated audio storage; no heap allocations inside the
//     audio callback.
//   - Drop-newest on overflow (matches RecordingTap policy).
//
// Track storage shape (operator-locked when feature shipped):
//   - Max 60 seconds per track at 48 kHz stereo, 32-bit float.
//     That's 48000 * 60 * 2 * 4 = 23 MB per track; 4 tracks = 92 MB.
//     Generous but flat — no realloc surprises. Long-form loops
//     (>60 s) ship in a follow-on slice with the ring/file-streaming
//     hybrid design.
//   - 8-step undo/redo history per track: snapshot of the loop
//     content at each commit point. The history buffer doubles
//     the per-track footprint when full; we cap to 4 layers per
//     track in the audio thread and reuse slots in a circular
//     undo ring (operator-friendly: undo discards the most recent
//     overdub layer).
//
// All public methods are RT-safe unless explicitly noted.

#pragma once

#include <array>
#include <atomic>
#include <cstdint>
#include <memory>
#include <vector>

#include <juce_audio_basics/juce_audio_basics.h>

namespace map2::looper {

constexpr int    kLooperMaxTracks       = 4;
constexpr int    kLooperUndoDepth       = 4;
constexpr double kLooperMaxSeconds      = 60.0;
constexpr int    kLooperChannels        = 2;
// Allocated at the max we expect (48k * 60s) so the audio thread
// never touches heap. Resizable at construction; fixed at runtime.
constexpr int    kLooperMaxFramesPerTrack = 48000 * 60;

/// Transport state for a single track. Atomic so the audio thread
/// can read it without locking and the operator thread can flip
/// it from a UI handler.
enum class TrackState : int {
    Empty       = 0,  ///< Track has no content; record arms it.
    Recording   = 1,  ///< Capturing the first layer (sets loop length).
    Playing     = 2,  ///< Streaming the loop on a wrapping playhead.
    Overdubbing = 3,  ///< Playing AND capturing additively (sums on top).
    Stopped     = 4,  ///< Loop exists, content frozen, playhead halted.
};

/// Read-only projection for the UI / WebSocket broadcasts.
struct TrackStatus {
    int          trackIndex      {-1};
    TrackState   state           {TrackState::Empty};
    int          loopLengthFrames {0};
    int          playheadFrames  {0};
    int          layerCount       {0};  ///< Number of recorded layers (0..kLooperUndoDepth).
    float        levelDb         {0.0f}; ///< Operator volume, dB.
    bool         muted           {false};
    bool         soloed          {false};
    bool         reverse         {false};
    bool         halfSpeed       {false};
};

/**
 * Single looper track.
 *
 * Audio storage is pre-allocated at construction; the audio
 * thread can record + play + overdub without ever touching heap.
 * Undo/redo is implemented as a layer-by-layer stack of mix
 * snapshots — committing an overdub pushes the *current* buffer
 * onto the undo stack BEFORE the overdub mix; undo pops it back.
 */
class LooperTrack {
public:
    /// Heap-allocates layer storage at construction. NOT RT-safe;
    /// must be called before any audio-thread access. ~92 MB per
    /// track at max (4 layers × 60 s × 48 kHz × 2 ch × 4 B).
    LooperTrack() {
        for (auto& layer : layers_) {
            // unique_ptr<float[]> avoids the std::array<5.7M float>
            // stack-allocation issue. Allocated once, never freed
            // during the looper's lifetime.
            layer = std::make_unique<float[]>(
                static_cast<std::size_t>(kLooperMaxFramesPerTrack) *
                static_cast<std::size_t>(kLooperChannels));
            std::fill_n(layer.get(),
                        static_cast<std::size_t>(kLooperMaxFramesPerTrack) *
                            static_cast<std::size_t>(kLooperChannels),
                        0.0f);
        }
    }

    ~LooperTrack() = default;

    LooperTrack(const LooperTrack&)            = delete;
    LooperTrack& operator=(const LooperTrack&) = delete;

    // ---------------------------------------------------------------
    // Operator-side API (non-RT — flips atomics)
    // ---------------------------------------------------------------

    /// First press: start recording (sets loop length on first stop).
    /// Subsequent press while playing: start overdubbing.
    /// Subsequent press while overdubbing: commit overdub + play.
    /// Subsequent press while recording: commit length + play.
    /// This is the "single stomp action" — the engine decides the
    /// transition based on current state.
    void onRecordStomp() noexcept {
        const auto current = state_.load(std::memory_order_acquire);
        switch (current) {
            case TrackState::Empty:       transitionTo(TrackState::Recording);   return;
            case TrackState::Recording:   commitFirstLayer();                    return;
            case TrackState::Playing:     transitionTo(TrackState::Overdubbing); return;
            case TrackState::Overdubbing: commitOverdubLayer();                  return;
            case TrackState::Stopped:     transitionTo(TrackState::Playing);     return;
        }
    }

    /// Stomp variant: stop or resume play. Empty tracks are ignored.
    void onStopStomp() noexcept {
        const auto current = state_.load(std::memory_order_acquire);
        if (current == TrackState::Empty || current == TrackState::Recording) {
            // Recording with no buffered content yet — drop into Empty.
            transitionTo(TrackState::Empty);
            return;
        }
        if (current == TrackState::Stopped) {
            transitionTo(TrackState::Playing);
            return;
        }
        // Playing or Overdubbing → Stopped.
        transitionTo(TrackState::Stopped);
    }

    /// Clear the track entirely. All state reverts to Empty.
    void onClearStomp() noexcept {
        // The audio thread's read of loopLengthFrames_ may race
        // briefly with the reset, but the state_ transition to
        // Empty stops audio-thread access on the next callback.
        state_.store(TrackState::Empty, std::memory_order_release);
        loopLengthFrames_.store(0, std::memory_order_release);
        playheadFrames_.store(0, std::memory_order_release);
        layerCount_.store(0, std::memory_order_release);
    }

    /// Undo the most-recent overdub layer (pops the undo stack).
    /// No-op when there's no history.
    void onUndoStomp() noexcept {
        const int count = layerCount_.load(std::memory_order_acquire);
        if (count <= 1) {
            // 0 = empty; 1 = first layer (no overdubs to undo).
            return;
        }
        // Walk back the undo ring by one and decrement layer count.
        // The audio callback uses layerCount_ when summing playback
        // so the change is observable next buffer.
        undoCursor_.store(
            (undoCursor_.load(std::memory_order_acquire) - 1 + kLooperUndoDepth)
                % kLooperUndoDepth,
            std::memory_order_release);
        layerCount_.fetch_sub(1, std::memory_order_release);
        redoAvailable_.store(true, std::memory_order_release);
    }

    /// Redo a previously-undone layer.
    void onRedoStomp() noexcept {
        if (!redoAvailable_.load(std::memory_order_acquire)) {
            return;
        }
        const int count = layerCount_.load(std::memory_order_acquire);
        if (count >= kLooperUndoDepth) {
            return;
        }
        undoCursor_.store(
            (undoCursor_.load(std::memory_order_acquire) + 1) % kLooperUndoDepth,
            std::memory_order_release);
        layerCount_.fetch_add(1, std::memory_order_release);
    }

    /// Per-track volume (dB, clamped to [-60, +6]).
    void setLevelDb(float db) noexcept {
        levelDb_.store(std::clamp(db, -60.0f, 6.0f), std::memory_order_release);
    }

    void setMuted(bool muted)        noexcept { muted_.store(muted, std::memory_order_release); }
    void setSoloed(bool soloed)      noexcept { soloed_.store(soloed, std::memory_order_release); }
    void setReverse(bool reverse)    noexcept { reverse_.store(reverse, std::memory_order_release); }
    void setHalfSpeed(bool half)     noexcept { halfSpeed_.store(half, std::memory_order_release); }

    /// Snapshot for UI / broadcast.
    TrackStatus getStatus(int trackIndex) const noexcept {
        TrackStatus s;
        s.trackIndex       = trackIndex;
        s.state            = state_.load(std::memory_order_acquire);
        s.loopLengthFrames = loopLengthFrames_.load(std::memory_order_acquire);
        s.playheadFrames   = playheadFrames_.load(std::memory_order_acquire);
        s.layerCount       = layerCount_.load(std::memory_order_acquire);
        s.levelDb          = levelDb_.load(std::memory_order_acquire);
        s.muted            = muted_.load(std::memory_order_acquire);
        s.soloed           = soloed_.load(std::memory_order_acquire);
        s.reverse          = reverse_.load(std::memory_order_acquire);
        s.halfSpeed        = halfSpeed_.load(std::memory_order_acquire);
        return s;
    }

    // ---------------------------------------------------------------
    // Audio-thread API (RT-CRITICAL)
    // ---------------------------------------------------------------

    /**
     * Process one audio buffer for this track:
     *   - Empty       → buffer untouched.
     *   - Recording   → write samples to layer 0; advance head.
     *   - Playing     → sum layer mix into buffer.
     *   - Overdubbing → sum layer mix into buffer AND write the
     *                   resulting buffer to the next undo slot
     *                   (becomes the next layer on commit).
     *   - Stopped     → buffer untouched.
     */
    void processBlock(juce::AudioBuffer<float>& buffer) noexcept;

private:
    void transitionTo(TrackState next) noexcept {
        state_.store(next, std::memory_order_release);
        if (next == TrackState::Empty) {
            loopLengthFrames_.store(0, std::memory_order_release);
            playheadFrames_.store(0, std::memory_order_release);
            layerCount_.store(0, std::memory_order_release);
            undoCursor_.store(-1, std::memory_order_release);
            redoAvailable_.store(false, std::memory_order_release);
        }
        if (next == TrackState::Recording) {
            playheadFrames_.store(0, std::memory_order_release);
            layerCount_.store(0, std::memory_order_release);
            undoCursor_.store(-1, std::memory_order_release);
        }
        if (next == TrackState::Playing && state_.load() == TrackState::Recording) {
            // Smooth re-arm: rewind playhead to 0 so the new loop
            // starts from its first sample.
            playheadFrames_.store(0, std::memory_order_release);
        }
    }

    void commitFirstLayer() noexcept {
        const int recorded = playheadFrames_.load(std::memory_order_acquire);
        loopLengthFrames_.store(recorded, std::memory_order_release);
        playheadFrames_.store(0, std::memory_order_release);
        layerCount_.store(1, std::memory_order_release);
        undoCursor_.store(0, std::memory_order_release);
        state_.store(TrackState::Playing, std::memory_order_release);
    }

    void commitOverdubLayer() noexcept {
        const int next = (undoCursor_.load(std::memory_order_acquire) + 1)
                         % kLooperUndoDepth;
        undoCursor_.store(next, std::memory_order_release);
        const int count = layerCount_.load(std::memory_order_acquire);
        if (count < kLooperUndoDepth) {
            layerCount_.fetch_add(1, std::memory_order_release);
        }
        redoAvailable_.store(false, std::memory_order_release);
        state_.store(TrackState::Playing, std::memory_order_release);
    }

    // ---------------------------------------------------------------
    // Storage (pre-allocated, never reallocated)
    // ---------------------------------------------------------------

    /// One layer per undo slot. Each layer is `kLooperMaxFramesPerTrack`
    /// frames * `kLooperChannels` channels of float32 — heap-allocated
    /// at construction so the audio callback never touches the
    /// allocator.
    std::array<std::unique_ptr<float[]>, kLooperUndoDepth> layers_;

    std::atomic<TrackState> state_           {TrackState::Empty};
    std::atomic<int>        loopLengthFrames_ {0};
    std::atomic<int>        playheadFrames_   {0};
    std::atomic<int>        layerCount_       {0};
    std::atomic<int>        undoCursor_       {-1};  ///< Current active layer.
    std::atomic<bool>       redoAvailable_    {false};

    std::atomic<float>      levelDb_         {0.0f};
    std::atomic<bool>       muted_           {false};
    std::atomic<bool>       soloed_          {false};
    std::atomic<bool>       reverse_         {false};
    std::atomic<bool>       halfSpeed_       {false};
};

}  // namespace map2::looper
