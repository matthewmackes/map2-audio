#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_dsp/juce_dsp.h>

#include "Amps/AmpModel.h"
#include "Amps/Peavey5150.h"
#include "DSP/Oversampler.h"

class Peavey5150AudioProcessor : public juce::AudioProcessor,
                                  public juce::AudioProcessorValueTreeState::Listener
{
public:
    Peavey5150AudioProcessor();
    ~Peavey5150AudioProcessor() override;

    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    bool isBusesLayoutSupported(const BusesLayout& layouts) const override;
    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override;

    const juce::String getName() const override;
    bool acceptsMidi() const override { return false; }
    bool producesMidi() const override { return false; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 0.0; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}

    void getStateInformation(juce::MemoryBlock& destData) override;
    void setStateInformation(const void* data, int sizeInBytes) override;

    void parameterChanged(const juce::String& parameterID, float newValue) override;

    juce::AudioProcessorValueTreeState& getAPVTS() { return apvts; }

    static constexpr const char* PARAM_GAIN       = "gain";
    static constexpr const char* PARAM_BASS       = "bass";
    static constexpr const char* PARAM_MID        = "mid";
    static constexpr const char* PARAM_TREBLE     = "treble";
    static constexpr const char* PARAM_PRESENCE   = "presence";
    static constexpr const char* PARAM_MASTER     = "master";
    static constexpr const char* PARAM_BRIGHT     = "bright";
    static constexpr const char* PARAM_RESONANCE  = "resonance";
    static constexpr const char* PARAM_SAG        = "sag";
    static constexpr const char* PARAM_BIAS       = "bias";
    static constexpr const char* PARAM_OVERSAMPLE = "oversample";

private:
    juce::AudioProcessorValueTreeState::ParameterLayout createParameterLayout();
    void updateAmpParameters();
    void setOversampleFactor(int factor);

    Amps::Peavey5150 amp;
    DSP::Oversampler oversampler{4};
    int oversampleFactor = 4;

    double dcBlockerState[2]  = {0.0, 0.0};
    double dcBlockerOutput[2] = {0.0, 0.0};

    juce::AudioProcessorValueTreeState apvts;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(Peavey5150AudioProcessor)
};
