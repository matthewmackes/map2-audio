// =============================================================================
// T2503 Set 8 — BeatGrid
// =============================================================================
// Adapts Mixxx's beatgrid model: per-clip first-beat anchor + bpm + samples
// per beat. Original Mixxx implementation: src/track/beats.cpp
// (GPLv2-or-later). MAP2 re-implementation; attribution per .gemini rule.
//
// Differences from Mixxx:
//   - We hold beats as integer sample counts (Mixxx uses double seconds).
//     Sample-accurate at 48 kHz is enough resolution for our use cases.
//   - No support yet for non-uniform beatgrids (Mixxx supports manually
//     placed beat markers); a single (anchor, bpm) is the canonical form.
// =============================================================================

#pragma once

#if !MAP2_DAW_MODE
#error "BeatGrid.h included but MAP2_DAW_MODE is not set"
#endif

#include <cstdint>

namespace map2::daw::deck {

class BeatGrid {
public:
    BeatGrid() noexcept = default;
    BeatGrid(int64_t firstBeatSamples, double bpm, int sampleRate) noexcept;

    void set(int64_t firstBeatSamples, double bpm, int sampleRate) noexcept;

    int64_t firstBeatSamples() const noexcept { return firstBeat_; }
    double bpm() const noexcept { return bpm_; }
    int sampleRate() const noexcept { return sampleRate_; }

    /** Returns the sample count per beat. */
    double samplesPerBeat() const noexcept;

    /** Returns the beat number at ``positionSamples``. May be negative if
        the position is before firstBeat. */
    double positionToBeat(int64_t positionSamples) const noexcept;

    /** Returns the sample position of beat ``n``. */
    int64_t beatToPosition(double beatNumber) const noexcept;

    /** Snap ``positionSamples`` to the nearest beat boundary. */
    int64_t snapToBeat(int64_t positionSamples) const noexcept;

    /** Returns the next beat boundary at or after ``positionSamples``. */
    int64_t nextBeatPosition(int64_t positionSamples) const noexcept;

    /** True if both anchor and bpm are valid (non-zero). */
    bool isValid() const noexcept;

private:
    int64_t firstBeat_ = 0;
    double bpm_ = 120.0;
    int sampleRate_ = 48000;
};

} // namespace map2::daw::deck
