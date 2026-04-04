#pragma once

#include <juce_audio_processors/juce_audio_processors.h>

#include "ConvolutionProcessor.h"

namespace map2 {

class NativeConvolutionPluginProcessor final : public juce::AudioProcessor,
                                               public juce::AudioProcessorValueTreeState::Listener {
public:
    explicit NativeConvolutionPluginProcessor(juce::String name, float defaultMixPercent);
    ~NativeConvolutionPluginProcessor() override;

    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    bool isBusesLayoutSupported(const BusesLayout& layouts) const override;
    void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages) override;

    juce::AudioProcessorEditor* createEditor() override { return nullptr; }
    bool hasEditor() const override { return false; }

    const juce::String getName() const override { return name_; }
    bool acceptsMidi() const override { return false; }
    bool producesMidi() const override { return false; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override;

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}

    void getStateInformation(juce::MemoryBlock& destData) override;
    void setStateInformation(const void* data, int sizeInBytes) override;
    void parameterChanged(const juce::String& parameterID, float newValue) override;

    bool loadImpulseResponse(const std::string& path);
    void unloadImpulseResponse();
    ConvolutionProcessor::IRInfo getIRInfo() const;
    float getMixPercent() const;
    bool isBypassedLocally() const;

    void setMixPercent(float mixPercent);
    void setBypassEnabled(bool enabled);

private:
    juce::AudioProcessorValueTreeState::ParameterLayout createParameterLayout() const;
    void syncParameters();
    void syncParameterValue(const juce::String& parameterID, float newValue);

    juce::String name_;
    float defaultMixPercent_;
    ConvolutionProcessor processor_;
    juce::AudioProcessorValueTreeState apvts_;
    std::string irPath_;
};

} // namespace map2
