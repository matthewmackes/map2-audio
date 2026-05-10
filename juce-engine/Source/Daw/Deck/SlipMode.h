// =============================================================================
// T2503 Set 8 — SlipMode
// =============================================================================
// Adapts Mixxx's slip-mode controller. Original implementation:
//   src/engine/controls/clockcontrol.cpp + slipcontrol.cpp (GPLv2-or-later).
// Re-implementation in MAP2 source.
//
// Behavior: when slip mode is active, scrubbing/cueing/loop edits don't
// move the "real" playhead — the deck remembers where it would have been
// if slip were off, and snaps back to that position on slip release.
//
// Mixxx maintains the slipped position as a separate sample counter that
// advances at the deck's normal rate; this implementation does the same.
// =============================================================================

#pragma once

#if !MAP2_DAW_MODE
#error "SlipMode.h included but MAP2_DAW_MODE is not set"
#endif

#include <cstdint>

namespace map2::daw::deck {

class SlipMode {
public:
    SlipMode() = default;

    bool isActive() const noexcept { return active_; }

    /** Enable slip at ``startPosition``. The deck's "real" playhead is
        captured here and advances at the deck's playback rate while slip is
        active. Editing operations on the visible playhead are decoupled. */
    void engage(int64_t startPosition, double playbackRate) noexcept;

    /** Disengage slip. Returns the position the deck should snap back to —
        the slipped position the playhead would have at this moment if slip
        had not been active. */
    int64_t disengage() noexcept;

    /** Advance the slipped position by ``elapsedSamples`` of audio time.
        Called from the audio callback or a non-RT cadence runner. */
    void advance(int64_t elapsedSamples) noexcept;

    /** Returns the current slipped position. Defined only when active. */
    int64_t currentSlippedPosition() const noexcept { return slippedPosition_; }

private:
    bool active_ = false;
    int64_t slippedPosition_ = 0;
    double playbackRate_ = 1.0;
};

} // namespace map2::daw::deck
