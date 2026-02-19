#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "PluginProcessor.h"

class MesaDualRectifierAudioProcessorEditor : public juce::AudioProcessorEditor
{
public:
    explicit MesaDualRectifierAudioProcessorEditor(MesaDualRectifierAudioProcessor&);
    ~MesaDualRectifierAudioProcessorEditor() override;

    void paint(juce::Graphics&) override;
    void resized() override;

private:
    MesaDualRectifierAudioProcessor& audioProcessor;

    // Generic editor delegates parameter UI to JUCE's built-in panel
    std::unique_ptr<juce::AudioProcessorEditor> genericEditor;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(MesaDualRectifierAudioProcessorEditor)
};
