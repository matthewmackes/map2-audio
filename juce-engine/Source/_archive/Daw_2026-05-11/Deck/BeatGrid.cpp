// =============================================================================
// T2503 Set 8 — BeatGrid implementation
// =============================================================================

#include "BeatGrid.h"

#include <cmath>

namespace map2::daw::deck {

BeatGrid::BeatGrid(int64_t firstBeatSamples, double bpm, int sampleRate) noexcept
    : firstBeat_(firstBeatSamples), bpm_(bpm), sampleRate_(sampleRate) {}

void BeatGrid::set(int64_t firstBeatSamples, double bpm, int sampleRate) noexcept {
    firstBeat_ = firstBeatSamples;
    bpm_ = bpm;
    sampleRate_ = sampleRate;
}

double BeatGrid::samplesPerBeat() const noexcept {
    if (bpm_ <= 0.0 || sampleRate_ <= 0) return 0.0;
    return (60.0 * static_cast<double>(sampleRate_)) / bpm_;
}

double BeatGrid::positionToBeat(int64_t positionSamples) const noexcept {
    const double spb = samplesPerBeat();
    if (spb <= 0.0) return 0.0;
    return (static_cast<double>(positionSamples - firstBeat_)) / spb;
}

int64_t BeatGrid::beatToPosition(double beatNumber) const noexcept {
    const double spb = samplesPerBeat();
    return firstBeat_ + static_cast<int64_t>(std::round(beatNumber * spb));
}

int64_t BeatGrid::snapToBeat(int64_t positionSamples) const noexcept {
    const double spb = samplesPerBeat();
    if (spb <= 0.0) return positionSamples;
    const double beat = positionToBeat(positionSamples);
    return beatToPosition(std::round(beat));
}

int64_t BeatGrid::nextBeatPosition(int64_t positionSamples) const noexcept {
    const double spb = samplesPerBeat();
    if (spb <= 0.0) return positionSamples;
    const double beat = positionToBeat(positionSamples);
    const double nextBeat = std::ceil(beat);
    return beatToPosition(nextBeat);
}

bool BeatGrid::isValid() const noexcept {
    return bpm_ > 0.0 && sampleRate_ > 0;
}

} // namespace map2::daw::deck
