#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "PluginProcessor.h"

class Marshall800AudioProcessorEditor : public juce::AudioProcessorEditor
{
public:
    explicit Marshall800AudioProcessorEditor(Marshall800AudioProcessor&);
    ~Marshall800AudioProcessorEditor() override;

    void paint(juce::Graphics&) override;
    void resized() override;

private:
    Marshall800AudioProcessor& audioProcessor;

    // Generic editor delegates parameter UI to JUCE's built-in panel
    std::unique_ptr<juce::AudioProcessorEditor> genericEditor;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(Marshall800AudioProcessorEditor)
};
