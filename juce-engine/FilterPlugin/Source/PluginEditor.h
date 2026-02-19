#pragma once

#include <juce_audio_processors/juce_audio_processors.h>

#include "PluginProcessor.h"

class FilterAudioProcessorEditor : public juce::AudioProcessorEditor
{
public:
    explicit FilterAudioProcessorEditor(FilterAudioProcessor&);
    ~FilterAudioProcessorEditor() override;

    void paint(juce::Graphics&) override;
    void resized() override;

private:
    FilterAudioProcessor& audioProcessor;
    std::unique_ptr<juce::AudioProcessorEditor> genericEditor;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(FilterAudioProcessorEditor)
};
