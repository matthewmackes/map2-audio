#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "PluginProcessor.h"

class Peavey5150AudioProcessorEditor : public juce::AudioProcessorEditor
{
public:
    explicit Peavey5150AudioProcessorEditor(Peavey5150AudioProcessor&);
    ~Peavey5150AudioProcessorEditor() override;

    void paint(juce::Graphics&) override;
    void resized() override;

private:
    Peavey5150AudioProcessor& audioProcessor;

    // Generic editor delegates parameter UI to JUCE's built-in panel
    std::unique_ptr<juce::AudioProcessorEditor> genericEditor;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(Peavey5150AudioProcessorEditor)
};
