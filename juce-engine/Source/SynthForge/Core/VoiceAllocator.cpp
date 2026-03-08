#include "SynthForge/Core/VoiceAllocator.h"

#include <algorithm>

namespace map2::synthforge {

VoiceAllocator::VoiceAllocator() {
    reset();
}

void VoiceAllocator::reset() {
    activeNotes_.fill(false);
    activeVoices_ = 0;
    peakVoices_ = 0;
}

void VoiceAllocator::noteOn(int noteNumber) {
    const int note = clampNote(noteNumber);
    if (activeNotes_[static_cast<size_t>(note)]) {
        return;
    }

    if (activeVoices_ >= kMaxNotes) {
        for (size_t i = 0; i < activeNotes_.size(); ++i) {
            if (activeNotes_[i]) {
                activeNotes_[i] = false;
                --activeVoices_;
                break;
            }
        }
    }

    activeNotes_[static_cast<size_t>(note)] = true;
    ++activeVoices_;
    peakVoices_ = std::max(peakVoices_, activeVoices_);
}

void VoiceAllocator::noteOff(int noteNumber) {
    const int note = clampNote(noteNumber);
    if (!activeNotes_[static_cast<size_t>(note)]) {
        return;
    }

    activeNotes_[static_cast<size_t>(note)] = false;
    activeVoices_ = std::max(0, activeVoices_ - 1);
}

void VoiceAllocator::allNotesOff() {
    activeNotes_.fill(false);
    activeVoices_ = 0;
}

int VoiceAllocator::clampNote(int noteNumber) {
    return std::clamp(noteNumber, 0, kMaxNotes - 1);
}

}  // namespace map2::synthforge
