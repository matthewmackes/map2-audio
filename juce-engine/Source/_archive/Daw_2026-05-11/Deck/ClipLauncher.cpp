// =============================================================================
// T2503 Set 8 — ClipLauncher implementation
// =============================================================================

#include "ClipLauncher.h"

namespace map2::daw::deck {

ClipState ClipLauncher::press(int clipId) noexcept {
    const ClipState current = stateOf(clipId);
    ClipState next = current;
    switch (current) {
        case ClipState::Stopped:    next = ClipState::Queued;     break;
        case ClipState::Queued:     next = ClipState::Stopped;    break;  // cancel
        case ClipState::Playing:    next = ClipState::QueuedStop; break;
        case ClipState::QueuedStop: next = ClipState::Playing;    break;  // cancel
    }
    states_[clipId] = next;
    return next;
}

void ClipLauncher::onBeatBoundary() noexcept {
    for (auto& kv : states_) {
        if (kv.second == ClipState::Queued) kv.second = ClipState::Playing;
        else if (kv.second == ClipState::QueuedStop) kv.second = ClipState::Stopped;
    }
}

void ClipLauncher::setState(int clipId, ClipState state) noexcept {
    states_[clipId] = state;
}

ClipState ClipLauncher::stateOf(int clipId) const noexcept {
    auto it = states_.find(clipId);
    if (it == states_.end()) return ClipState::Stopped;
    return it->second;
}

ClipLauncher::StateCounts ClipLauncher::counts() const noexcept {
    StateCounts r{};
    for (const auto& kv : states_) {
        switch (kv.second) {
            case ClipState::Stopped:    ++r.stopped;    break;
            case ClipState::Queued:     ++r.queued;     break;
            case ClipState::Playing:    ++r.playing;    break;
            case ClipState::QueuedStop: ++r.queuedStop; break;
        }
    }
    return r;
}

} // namespace map2::daw::deck
