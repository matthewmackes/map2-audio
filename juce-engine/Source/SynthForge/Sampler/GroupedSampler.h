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
                        int seqPosition,
                        float loRand,
                        float hiRand,
                        bool hasRandomRange);

    int getChokeGroup() const noexcept { return chokeGroup_; }
    int getOffByGroup() const noexcept { return offByGroup_; }
    int getSeqLength() const noexcept { return seqLength_; }
    int getSeqPosition() const noexcept { return seqPosition_; }
    float getLoRand() const noexcept { return loRand_; }
    float getHiRand() const noexcept { return hiRand_; }
    bool appliesToRoundRobin(int roundRobinCounter) const noexcept;
    bool appliesToRandomValue(float randomValue) const noexcept;

private:
    int chokeGroup_ = 0;
    int offByGroup_ = 0;
    int seqLength_ = 0;
    int seqPosition_ = 0;
    float loRand_ = 0.0f;
    float hiRand_ = 1.0f;
    bool hasRandomRange_ = false;
};

class GroupedSamplerSynthesiser : public juce::Synthesiser {
public:
    void noteOn(int midiChannel, int midiNoteNumber, float velocity) override;
    void setNextRandomValueForTesting(float randomValue) noexcept;

private:
    void chokeVoicesForGroup(int midiChannel, int chokeGroup);
    int nextRoundRobinCounter(int midiNoteNumber) noexcept;
    float nextRandomValue() noexcept;

    std::array<int, 128> roundRobinCounters_{};
    float randomValueOverride_ = -1.0f;
};

}  // namespace map2::synthforge
