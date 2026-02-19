#pragma once

#include <juce_audio_processors/juce_audio_processors.h>

#include "DelayProcessor.h"

class DelayAudioProcessor : public juce::AudioProcessor,
                            public juce::AudioProcessorValueTreeState::Listener
{
public:
    DelayAudioProcessor();
    ~DelayAudioProcessor() override;

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
    double getTailLengthSeconds() const override { return 2.0; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}

    void getStateInformation(juce::MemoryBlock& destData) override;
    void setStateInformation(const void* data, int sizeInBytes) override;

    void parameterChanged(const juce::String& parameterID, float newValue) override;

    juce::AudioProcessorValueTreeState& getAPVTS() { return apvts; }

    static constexpr const char* PARAM_DELAY_L = "delayTimeL";
    static constexpr const char* PARAM_DELAY_R = "delayTimeR";
    static constexpr const char* PARAM_FEEDBACK = "feedback";
    static constexpr const char* PARAM_MIX = "mix";
    static constexpr const char* PARAM_STEREO_MODE = "stereoMode";
    static constexpr const char* PARAM_MOD_RATE = "modRate";
    static constexpr const char* PARAM_MOD_DEPTH = "modDepth";
    static constexpr const char* PARAM_LOW_CUT = "lowCut";
    static constexpr const char* PARAM_HIGH_CUT = "highCut";
    static constexpr const char* PARAM_DIFFUSION = "diffusion";
    static constexpr const char* PARAM_DUCK_AMOUNT = "duckAmount";
    static constexpr const char* PARAM_OUTPUT_LEVEL = "outputLevel";
    static constexpr const char* PARAM_BYPASS = "bypass";

private:
    juce::AudioProcessorValueTreeState::ParameterLayout createParameterLayout();
    void updateProcessorParameters();

    map2::DelayProcessor delay;
    juce::AudioProcessorValueTreeState apvts;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(DelayAudioProcessor)
};
