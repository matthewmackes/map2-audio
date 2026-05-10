// =============================================================================
// T2503 Set 8 — CueModel implementation
// =============================================================================

#include "CueModel.h"

namespace map2::daw::deck {

CueModel::CueModel() = default;

void CueModel::setMode(CueMode mode) noexcept { mode_ = mode; }

void CueModel::setMainCue(int64_t positionSamples) noexcept {
    if (positionSamples < 0) return;
    mainCue_ = positionSamples;
}

std::optional<int64_t> CueModel::mainCue() const noexcept {
    return mainCue_;
}

int64_t CueModel::pressMainCue(int64_t currentPosition) noexcept {
    // Mixxx mode: pressing the cue button while stopped sets the cue at the
    // current position; pressing while playing previews from the cue.
    mainCuePressed_ = true;
    mainCuePressPosition_ = currentPosition;
    if (!mainCue_.has_value()) {
        // First press: lock the cue here.
        mainCue_ = currentPosition;
        return currentPosition;
    }
    return *mainCue_;
}

int64_t CueModel::releaseMainCue(int64_t fallback) noexcept {
    mainCuePressed_ = false;
    if (mode_ == CueMode::Mixxx) {
        // On release, return the playhead to the cue (preview-style).
        if (mainCue_.has_value()) return *mainCue_;
    }
    return fallback;
}

void CueModel::setHotCue(int index, int64_t positionSamples, uint32_t color) noexcept {
    if (index < 0 || index >= kHotCueCount) return;
    if (positionSamples < 0) return;
    hotCues_[index].set = true;
    hotCues_[index].positionSamples = positionSamples;
    hotCues_[index].color = color;
}

void CueModel::clearHotCue(int index) noexcept {
    if (index < 0 || index >= kHotCueCount) return;
    hotCues_[index] = HotCue{};
}

std::optional<int64_t> CueModel::triggerHotCue(int index) const noexcept {
    if (index < 0 || index >= kHotCueCount) return std::nullopt;
    const auto& slot = hotCues_[index];
    if (!slot.set) return std::nullopt;
    return slot.positionSamples;
}

} // namespace map2::daw::deck
