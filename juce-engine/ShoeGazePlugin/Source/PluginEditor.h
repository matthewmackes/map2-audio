#pragma once

#include <juce_gui_extra/juce_gui_extra.h>

#include "PluginProcessor.h"

class ShoeGazeAudioProcessorEditor : public juce::AudioProcessorEditor
{
public:
    explicit ShoeGazeAudioProcessorEditor(ShoeGazeAudioProcessor&);
    ~ShoeGazeAudioProcessorEditor() override;

    void paint(juce::Graphics&) override;
    void resized() override;

private:
    ShoeGazeAudioProcessor& audioProcessor;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(ShoeGazeAudioProcessorEditor)
};
