#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_audio_formats/juce_audio_formats.h>

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
                        int offByGroup);

    int getChokeGroup() const noexcept { return chokeGroup_; }
    int getOffByGroup() const noexcept { return offByGroup_; }

private:
    int chokeGroup_ = 0;
    int offByGroup_ = 0;
};

class GroupedSamplerSynthesiser : public juce::Synthesiser {
public:
    void noteOn(int midiChannel, int midiNoteNumber, float velocity) override;

private:
    void chokeVoicesForGroup(int midiChannel, int chokeGroup);
};

}  // namespace map2::synthforge
