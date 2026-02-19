#pragma once

#include <juce_audio_processors/juce_audio_processors.h>

#include "PluginProcessor.h"

class ChorusAudioProcessorEditor : public juce::AudioProcessorEditor
{
public:
    explicit ChorusAudioProcessorEditor(ChorusAudioProcessor&);
    ~ChorusAudioProcessorEditor() override;

    void paint(juce::Graphics&) override;
    void resized() override;

private:
    ChorusAudioProcessor& audioProcessor;
    std::unique_ptr<juce::AudioProcessorEditor> genericEditor;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(ChorusAudioProcessorEditor)
};
