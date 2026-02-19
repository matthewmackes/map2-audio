#pragma once

#include <juce_gui_extra/juce_gui_extra.h>

#include "PluginProcessor.h"

class CircularDelayAudioProcessorEditor : public juce::AudioProcessorEditor
{
public:
    explicit CircularDelayAudioProcessorEditor(CircularDelayAudioProcessor&);
    ~CircularDelayAudioProcessorEditor() override;

    void paint(juce::Graphics&) override;
    void resized() override;

private:
    CircularDelayAudioProcessor& audioProcessor;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(CircularDelayAudioProcessorEditor)
};
