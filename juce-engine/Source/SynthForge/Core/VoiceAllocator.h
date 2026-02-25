#pragma once

/**
 * SynthForge - Voice allocator (Phase 1)
 * Tracks note activity and provides simple deterministic voice stealing.
 */

#include <array>

namespace map2::synthforge {

class VoiceAllocator {
public:
    static constexpr int kMaxNotes = 128;

    VoiceAllocator();

    void reset();
    void noteOn(int noteNumber);
    void noteOff(int noteNumber);
    void allNotesOff();

    int getActiveVoices() const { return activeVoices_; }
    int getPeakVoices() const { return peakVoices_; }

private:
    static int clampNote(int noteNumber);

    std::array<bool, kMaxNotes> activeNotes_{};
    int activeVoices_ = 0;
    int peakVoices_ = 0;
};

}  // namespace map2::synthforge
