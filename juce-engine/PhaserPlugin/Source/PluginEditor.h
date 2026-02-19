#pragma once

#include <juce_audio_processors/juce_audio_processors.h>

#include "PluginProcessor.h"

class PhaserAudioProcessorEditor : public juce::AudioProcessorEditor
{
public:
    explicit PhaserAudioProcessorEditor(PhaserAudioProcessor&);
    ~PhaserAudioProcessorEditor() override;

    void paint(juce::Graphics&) override;
    void resized() override;

private:
    PhaserAudioProcessor& audioProcessor;
    std::unique_ptr<juce::AudioProcessorEditor> genericEditor;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(PhaserAudioProcessorEditor)
};
