#include "SynthForge/Core/MidiRouter.h"

#include <algorithm>

namespace map2::synthforge {

namespace {

bool acceptsMessage(const juce::MidiMessage& message, int partChannel) {
    const int channel = message.getChannel();

    if (partChannel == kOmniMidiChannel) {
        return true;
    }

    if (channel <= 0) {
        return false;
    }

    return channel == partChannel;
}

}  // namespace

void MidiRouter::routeMidi(
    const juce::MidiBuffer& input,
    std::array<juce::MidiBuffer, kNumParts>& partBuffers,
    const std::array<int, kNumParts>& partChannels) const {
    for (auto& buffer : partBuffers) {
        buffer.clear();
    }

    for (const auto metadata : input) {
        const juce::MidiMessage message = metadata.getMessage();
        const int samplePosition = metadata.samplePosition;

        for (int part = 0; part < kNumParts; ++part) {
            const int channel = std::clamp(partChannels[static_cast<size_t>(part)], 0, 16);
            if (acceptsMessage(message, channel)) {
                partBuffers[static_cast<size_t>(part)].addEvent(message, samplePosition);
            }
        }
    }
}

}  // namespace map2::synthforge
