#pragma once

#include <juce_audio_processors/juce_audio_processors.h>

#include "NAMProcessor.h"

namespace map2 {

class NativeNAMPluginProcessor final : public juce::AudioProcessor,
                                       public juce::AudioProcessorValueTreeState::Listener {
public:
    NativeNAMPluginProcessor();
    ~NativeNAMPluginProcessor() override;

    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    bool isBusesLayoutSupported(const BusesLayout& layouts) const override;
    void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages) override;

    juce::AudioProcessorEditor* createEditor() override { return nullptr; }
    bool hasEditor() const override { return false; }

    const juce::String getName() const override { return "MAP2 NAM"; }
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

    bool loadModel(const std::string& path);
    void unloadModel();
    NAMModelInfo getModelInfo() const;
    float getInputGainDb() const;
    float getOutputGainDb() const;
    float getInputLevel() const;
    float getOutputLevel() const;
    bool isNormalized() const;
    bool isBypassedLocally() const;

    void setInputGainDb(float value);
    void setOutputGainDb(float value);
    void setNormalizeEnabled(bool enabled);
    void setBypassEnabled(bool enabled);

private:
    static juce::AudioProcessorValueTreeState::ParameterLayout createParameterLayout();
    void syncParameters();
    void syncParameterValue(const juce::String& parameterID, float normalizedValue);

    NAMProcessor processor_;
    juce::AudioProcessorValueTreeState apvts_;
    std::string modelPath_;
};

} // namespace map2
