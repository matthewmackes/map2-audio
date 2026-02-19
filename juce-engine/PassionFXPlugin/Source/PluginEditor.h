#pragma once

#include <juce_gui_extra/juce_gui_extra.h>

#include "PluginProcessor.h"

class PassionFXAudioProcessorEditor : public juce::AudioProcessorEditor
{
public:
    explicit PassionFXAudioProcessorEditor(PassionFXAudioProcessor&);
    ~PassionFXAudioProcessorEditor() override;

    void paint(juce::Graphics&) override;
    void resized() override;

private:
    PassionFXAudioProcessor& audioProcessor;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(PassionFXAudioProcessorEditor)
};
