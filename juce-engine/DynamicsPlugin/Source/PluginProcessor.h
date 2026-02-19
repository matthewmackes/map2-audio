#pragma once

#include <juce_audio_processors/juce_audio_processors.h>

#include "DynamicsProcessor.h"

class DynamicsAudioProcessor : public juce::AudioProcessor,
                               public juce::AudioProcessorValueTreeState::Listener
{
public:
    DynamicsAudioProcessor();
    ~DynamicsAudioProcessor() override;

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

    static constexpr const char* PARAM_THRESHOLD = "threshold";
    static constexpr const char* PARAM_RATIO = "ratio";
    static constexpr const char* PARAM_ATTACK = "attack";
    static constexpr const char* PARAM_RELEASE = "release";
    static constexpr const char* PARAM_KNEE = "knee";
    static constexpr const char* PARAM_MAKEUP = "makeup";
    static constexpr const char* PARAM_AUTO_MAKEUP = "autoMakeup";
    static constexpr const char* PARAM_MODE = "mode";
    static constexpr const char* PARAM_BYPASS = "bypass";

private:
    juce::AudioProcessorValueTreeState::ParameterLayout createParameterLayout();
    void updateProcessorParameters();

    map2::DynamicsProcessor dynamics;
    juce::AudioProcessorValueTreeState apvts;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(DynamicsAudioProcessor)
};
