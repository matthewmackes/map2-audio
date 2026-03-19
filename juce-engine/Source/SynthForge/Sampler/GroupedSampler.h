#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_audio_formats/juce_audio_formats.h>

#include <array>

namespace map2::synthforge {

class GroupedSamplerSound : public juce::SamplerSound {
public:
    GroupedSamplerSound(const juce::String& name,
                        juce::AudioFormatReader& source,
                        const juce::BigInteger& midiNotes,
                        int midiNoteForNormalPitch,
                        double attackTimeSecs,
                        double releaseTimeSecs,
                        double maxSampleLengthSeconds,
                        int chokeGroup,
                        int offByGroup,
                        int seqLength,
                        int seqPosition);

    int getChokeGroup() const noexcept { return chokeGroup_; }
    int getOffByGroup() const noexcept { return offByGroup_; }
    int getSeqLength() const noexcept { return seqLength_; }
    int getSeqPosition() const noexcept { return seqPosition_; }
    bool appliesToRoundRobin(int roundRobinCounter) const noexcept;

private:
    int chokeGroup_ = 0;
    int offByGroup_ = 0;
    int seqLength_ = 0;
    int seqPosition_ = 0;
};

class GroupedSamplerSynthesiser : public juce::Synthesiser {
public:
    void noteOn(int midiChannel, int midiNoteNumber, float velocity) override;

private:
    void chokeVoicesForGroup(int midiChannel, int chokeGroup);
    int nextRoundRobinCounter(int midiNoteNumber) noexcept;

    std::array<int, 128> roundRobinCounters_{};
};

}  // namespace map2::synthforge
