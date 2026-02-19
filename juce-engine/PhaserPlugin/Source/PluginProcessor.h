#pragma once

#include <juce_audio_processors/juce_audio_processors.h>

#include "PhaserProcessor.h"

class PhaserAudioProcessor : public juce::AudioProcessor,
                             public juce::AudioProcessorValueTreeState::Listener
{
public:
    PhaserAudioProcessor();
    ~PhaserAudioProcessor() override;

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

    static constexpr const char* PARAM_RATE = "rate";
    static constexpr const char* PARAM_DEPTH = "depth";
    static constexpr const char* PARAM_CENTRE_FREQUENCY = "centreFrequency";
    static constexpr const char* PARAM_FEEDBACK = "feedback";
    static constexpr const char* PARAM_MIX = "mix";
    static constexpr const char* PARAM_BYPASS = "bypass";

private:
    juce::AudioProcessorValueTreeState::ParameterLayout createParameterLayout();
    void updateProcessorParameters();

    map2::PhaserProcessor phaser;
    juce::AudioProcessorValueTreeState apvts;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(PhaserAudioProcessor)
};
