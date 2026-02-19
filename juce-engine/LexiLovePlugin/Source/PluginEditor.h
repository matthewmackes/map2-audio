#pragma once

#include <juce_gui_extra/juce_gui_extra.h>

#include "PluginProcessor.h"

class LexiLoveAudioProcessorEditor : public juce::AudioProcessorEditor
{
public:
    explicit LexiLoveAudioProcessorEditor(LexiLoveAudioProcessor&);
    ~LexiLoveAudioProcessorEditor() override;

    void paint(juce::Graphics&) override;
    void resized() override;

private:
    LexiLoveAudioProcessor& audioProcessor;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(LexiLoveAudioProcessorEditor)
};
