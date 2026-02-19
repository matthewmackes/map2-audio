#pragma once

#include <juce_gui_extra/juce_gui_extra.h>

#include "PluginProcessor.h"

class TweedBassmanAudioProcessorEditor : public juce::AudioProcessorEditor
{
public:
    explicit TweedBassmanAudioProcessorEditor(TweedBassmanAudioProcessor&);
    ~TweedBassmanAudioProcessorEditor() override;

    void paint(juce::Graphics&) override;
    void resized() override;

private:
    TweedBassmanAudioProcessor& audioProcessor;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(TweedBassmanAudioProcessorEditor)
};
