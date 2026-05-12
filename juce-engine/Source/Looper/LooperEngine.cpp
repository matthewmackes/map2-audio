// =============================================================================
// LooperEngine — implementation.
// =============================================================================

#include "Looper/LooperEngine.h"

#include <algorithm>
#include <cmath>

namespace map2::looper {

namespace {

inline float dbToLinear(float db) noexcept {
    return std::pow(10.0f, db / 20.0f);
}

inline bool indexInRange(int trackIndex) noexcept {
    return trackIndex >= 0 && trackIndex < kLooperMaxTracks;
}

}  // namespace


LooperEngine::LooperEngine() {
    for (auto& t : tracks_) {
        t = std::make_unique<LooperTrack>();
    }
}


void LooperEngine::recordStomp(int trackIndex) noexcept {
    if (!indexInRange(trackIndex)) return;
    tracks_[static_cast<size_t>(trackIndex)]->onRecordStomp();
}
void LooperEngine::stopStomp(int trackIndex) noexcept {
    if (!indexInRange(trackIndex)) return;
    tracks_[static_cast<size_t>(trackIndex)]->onStopStomp();
}
void LooperEngine::clearStomp(int trackIndex) noexcept {
    if (!indexInRange(trackIndex)) return;
    tracks_[static_cast<size_t>(trackIndex)]->onClearStomp();
}
void LooperEngine::undoStomp(int trackIndex) noexcept {
    if (!indexInRange(trackIndex)) return;
    tracks_[static_cast<size_t>(trackIndex)]->onUndoStomp();
}
void LooperEngine::redoStomp(int trackIndex) noexcept {
    if (!indexInRange(trackIndex)) return;
    tracks_[static_cast<size_t>(trackIndex)]->onRedoStomp();
}


void LooperEngine::setTrackLevelDb(int trackIndex, float db) noexcept {
    if (!indexInRange(trackIndex)) return;
    tracks_[static_cast<size_t>(trackIndex)]->setLevelDb(db);
}
void LooperEngine::setTrackMuted(int trackIndex, bool muted) noexcept {
    if (!indexInRange(trackIndex)) return;
    tracks_[static_cast<size_t>(trackIndex)]->setMuted(muted);
}
void LooperEngine::setTrackSoloed(int trackIndex, bool soloed) noexcept {
    if (!indexInRange(trackIndex)) return;
    tracks_[static_cast<size_t>(trackIndex)]->setSoloed(soloed);
}
void LooperEngine::setTrackReverse(int trackIndex, bool rev) noexcept {
    if (!indexInRange(trackIndex)) return;
    tracks_[static_cast<size_t>(trackIndex)]->setReverse(rev);
}
void LooperEngine::setTrackHalfSpeed(int trackIndex, bool h) noexcept {
    if (!indexInRange(trackIndex)) return;
    tracks_[static_cast<size_t>(trackIndex)]->setHalfSpeed(h);
}


void LooperEngine::setMasterLevelDb(float db) noexcept {
    masterLevelDb_.store(std::clamp(db, -60.0f, 6.0f),
                         std::memory_order_release);
}


LooperStatus LooperEngine::getStatus() const noexcept {
    LooperStatus s;
    s.masterLevelDb = masterLevelDb_.load(std::memory_order_acquire);
    s.activeTrackCount = 0;
    for (int i = 0; i < kLooperMaxTracks; ++i) {
        s.tracks[static_cast<size_t>(i)] =
            tracks_[static_cast<size_t>(i)]->getStatus(i);
        if (s.tracks[static_cast<size_t>(i)].state != TrackState::Empty) {
            ++s.activeTrackCount;
        }
    }
    s.syncMaster = (s.tracks[0].state == TrackState::Playing
                    || s.tracks[0].state == TrackState::Overdubbing);
    return s;
}


void LooperEngine::processBlock(juce::AudioBuffer<float>& buffer) noexcept {
    // Check whether any track is soloed; if so, only soloed tracks
    // contribute. Otherwise every non-muted track plays.
    bool anySoloed = false;
    for (auto& t : tracks_) {
        const auto status = t->getStatus(0);  // index doesn't matter here
        if (status.soloed) {
            anySoloed = true;
            break;
        }
    }
    const float masterGain =
        dbToLinear(masterLevelDb_.load(std::memory_order_acquire));

    if (std::abs(masterGain - 1.0f) > 1e-4f) {
        buffer.applyGain(masterGain);
    }

    for (int i = 0; i < kLooperMaxTracks; ++i) {
        auto& track = *tracks_[static_cast<size_t>(i)];
        if (anySoloed) {
            const auto st = track.getStatus(i);
            if (!st.soloed) continue;
        }
        track.processBlock(buffer);
    }
}

}  // namespace map2::looper
