#pragma once

/**
 * SynthForge - MIDI router (Phase 1)
 * Routes incoming MIDI events into per-part buffers by channel/OMNI configuration.
 */

#include "SynthForge/Common/Types.h"

#include <juce_audio_basics/juce_audio_basics.h>

#include <array>

namespace map2::synthforge {

class MidiRouter {
public:
    void routeMidi(
        const juce::MidiBuffer& input,
        std::array<juce::MidiBuffer, kNumParts>& partBuffers,
        const std::array<int, kNumParts>& partChannels) const;
};

}  // namespace map2::synthforge
