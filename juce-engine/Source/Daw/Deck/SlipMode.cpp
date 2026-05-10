// =============================================================================
// T2503 Set 8 — SlipMode implementation
// =============================================================================

#include "SlipMode.h"

#include <cmath>

namespace map2::daw::deck {

void SlipMode::engage(int64_t startPosition, double playbackRate) noexcept {
    if (active_) return;
    if (startPosition < 0) startPosition = 0;
    active_ = true;
    slippedPosition_ = startPosition;
    playbackRate_ = playbackRate;
}

int64_t SlipMode::disengage() noexcept {
    const int64_t pos = slippedPosition_;
    active_ = false;
    return pos;
}

void SlipMode::advance(int64_t elapsedSamples) noexcept {
    if (!active_) return;
    if (elapsedSamples <= 0) return;
    const double advanced = static_cast<double>(elapsedSamples) * playbackRate_;
    slippedPosition_ += static_cast<int64_t>(std::round(advanced));
}

} // namespace map2::daw::deck
