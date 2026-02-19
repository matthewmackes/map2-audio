#pragma once

#include <juce_audio_processors/juce_audio_processors.h>

#include "PluginProcessor.h"

class DynamicsAudioProcessorEditor : public juce::AudioProcessorEditor
{
public:
    explicit DynamicsAudioProcessorEditor(DynamicsAudioProcessor&);
    ~DynamicsAudioProcessorEditor() override;

    void paint(juce::Graphics&) override;
    void resized() override;

private:
    DynamicsAudioProcessor& audioProcessor;
    std::unique_ptr<juce::AudioProcessorEditor> genericEditor;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(DynamicsAudioProcessorEditor)
};
