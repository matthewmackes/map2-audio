#pragma once

#include "SynthForge/Sampler/SfzLoader.h"

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_dsp/juce_dsp.h>
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
                        bool hasRandomRange,
                        int swDefault,
                        int swLast,
                        int swLoKey,
                        int swHiKey,
                        int transpose,
                        float tuneCents,
                        float volumeDb,
                        float pan,
                        float cutoffHz,
                        float resonance,
                        GroupedSamplerFilterType filterType);

    int getChokeGroup() const noexcept { return chokeGroup_; }
    int getOffByGroup() const noexcept { return offByGroup_; }
    int getSeqLength() const noexcept { return seqLength_; }
    int getSeqPosition() const noexcept { return seqPosition_; }
    float getLoRand() const noexcept { return loRand_; }
    float getHiRand() const noexcept { return hiRand_; }
    int getSwLast() const noexcept { return swLast_; }
    int getTranspose() const noexcept { return transpose_; }
    float getTuneCents() const noexcept { return tuneCents_; }
    float getVolumeDb() const noexcept { return volumeDb_; }
    float getPan() const noexcept { return pan_; }
    float getCutoffHz() const noexcept { return cutoffHz_; }
    float getResonance() const noexcept { return resonance_; }
    GroupedSamplerFilterType getFilterType() const noexcept { return filterType_; }
    double getSourceSampleRate() const noexcept { return sourceSampleRate_; }
    int getMidiRootNote() const noexcept { return midiRootNote_; }
    const juce::ADSR::Parameters& getEnvelopeParameters() const noexcept { return envelopeParameters_; }
    bool appliesToRoundRobin(int roundRobinCounter) const noexcept;
    bool appliesToRandomValue(float randomValue) const noexcept;
    bool isKeySwitchNote(int midiNoteNumber) const noexcept;
    bool matchesKeySwitch(int activeKeySwitch) const noexcept;
    int resolveDefaultKeySwitch() const noexcept;

private:
    int chokeGroup_ = 0;
    int offByGroup_ = 0;
    int seqLength_ = 0;
    int seqPosition_ = 0;
    float loRand_ = 0.0f;
    float hiRand_ = 1.0f;
    bool hasRandomRange_ = false;
    int swDefault_ = -1;
    int swLast_ = -1;
    int swLoKey_ = -1;
    int swHiKey_ = -1;
    int transpose_ = 0;
    float tuneCents_ = 0.0f;
    float volumeDb_ = 0.0f;
    float pan_ = 0.0f;
    float cutoffHz_ = 20000.0f;
    float resonance_ = 0.707f;
    GroupedSamplerFilterType filterType_ = GroupedSamplerFilterType::None;
    double sourceSampleRate_ = 0.0;
    int midiRootNote_ = 60;
    juce::ADSR::Parameters envelopeParameters_{};
};

class GroupedSamplerVoice : public juce::SynthesiserVoice {
public:
    bool canPlaySound(juce::SynthesiserSound* sound) override;
    void startNote(int midiNoteNumber, float velocity, juce::SynthesiserSound* sound, int pitchWheel) override;
    void stopNote(float velocity, bool allowTailOff) override;
    void pitchWheelMoved(int newValue) override;
    void controllerMoved(int controllerNumber, int newValue) override;
    void renderNextBlock(juce::AudioBuffer<float>& outputBuffer, int startSample, int numSamples) override;
    using juce::SynthesiserVoice::renderNextBlock;

private:
    using Filter = juce::dsp::StateVariableTPTFilter<float>;
    static void configureFilter(Filter& filter,
                                GroupedSamplerFilterType type,
                                double sampleRate,
                                float cutoffHz,
                                float resonance);

    double pitchRatio_ = 0.0;
    double sourceSamplePosition_ = 0.0;
    float leftGain_ = 0.0f;
    float rightGain_ = 0.0f;
    juce::ADSR adsr_;
    GroupedSamplerFilterType filterType_ = GroupedSamplerFilterType::None;
    Filter leftFilterA_;
    Filter rightFilterA_;
    Filter leftFilterB_;
    Filter rightFilterB_;
};

class GroupedSamplerSynthesiser : public juce::Synthesiser {
public:
    GroupedSamplerSynthesiser();
    void noteOn(int midiChannel, int midiNoteNumber, float velocity) override;
    void setNextRandomValueForTesting(float randomValue) noexcept;

private:
    void chokeVoicesForGroup(int midiChannel, int chokeGroup);
    int nextRoundRobinCounter(int midiNoteNumber) noexcept;
    float nextRandomValue() noexcept;
    int channelIndex(int midiChannel) const noexcept;
    int currentKeySwitchForChannel(int midiChannel, const GroupedSamplerSound* sound) const noexcept;

    std::array<int, 128> roundRobinCounters_{};
    std::array<int, 17> activeKeySwitches_{};
    float randomValueOverride_ = -1.0f;
};

}  // namespace map2::synthforge
