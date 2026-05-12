// =============================================================================
// LooperEngine — 4-track looper owning a LooperTrack array.
// =============================================================================
//
// One LooperEngine per Map2AudioEngine. Constructed in the engine
// ctor alongside the recorder. The audio callback calls
// processBlock(buffer) once per buffer; the looper sums all
// non-muted tracks' playback (and accepts incoming audio for
// recording/overdubbing) into the buffer.
//
// Operator-side API (non-RT) flips per-track atomics; the audio
// thread observes them next callback.

#pragma once

#include <array>
#include <cstdint>
#include <memory>
#include <mutex>
#include <vector>

#include "Looper/LooperTrack.h"

namespace map2::looper {

struct LooperStatus {
    std::array<TrackStatus, kLooperMaxTracks> tracks;
    int   activeTrackCount {0};
    bool  syncMaster       {false};  ///< Track 0 is the loop-sync master.
    float masterLevelDb    {0.0f};
};

class LooperEngine {
public:
    LooperEngine();
    ~LooperEngine() = default;

    LooperEngine(const LooperEngine&)            = delete;
    LooperEngine& operator=(const LooperEngine&) = delete;

    // -------- Operator-side (non-RT) --------

    /// Single-stomp record: forwards to track.onRecordStomp().
    /// Idempotent on out-of-range indices.
    void recordStomp(int trackIndex)  noexcept;
    void stopStomp(int trackIndex)    noexcept;
    void clearStomp(int trackIndex)   noexcept;
    void undoStomp(int trackIndex)    noexcept;
    void redoStomp(int trackIndex)    noexcept;

    void setTrackLevelDb(int trackIndex, float db) noexcept;
    void setTrackMuted(int trackIndex, bool muted)   noexcept;
    void setTrackSoloed(int trackIndex, bool soloed) noexcept;
    void setTrackReverse(int trackIndex, bool rev)    noexcept;
    void setTrackHalfSpeed(int trackIndex, bool h)    noexcept;

    void setMasterLevelDb(float db) noexcept;

    LooperStatus getStatus() const noexcept;

    // -------- Audio-thread API (RT-CRITICAL) --------

    /// Called from Map2AudioEngine::audioCallback after the engine
    /// graph has produced its post-FX output. Each track sums its
    /// playback into the buffer and (if recording/overdubbing)
    /// captures the buffer into its loop layer.
    void processBlock(juce::AudioBuffer<float>& buffer) noexcept;

private:
    std::array<std::unique_ptr<LooperTrack>, kLooperMaxTracks> tracks_;
    std::atomic<float> masterLevelDb_ {0.0f};
};

}  // namespace map2::looper
