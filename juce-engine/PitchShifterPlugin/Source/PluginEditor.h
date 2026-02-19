#pragma once

#include <juce_gui_extra/juce_gui_extra.h>

#include "PluginProcessor.h"

class PitchShifterAudioProcessorEditor : public juce::AudioProcessorEditor
{
public:
    explicit PitchShifterAudioProcessorEditor(PitchShifterAudioProcessor&);
    ~PitchShifterAudioProcessorEditor() override;

    void paint(juce::Graphics&) override;
    void resized() override;

private:
    PitchShifterAudioProcessor& audioProcessor;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(PitchShifterAudioProcessorEditor)
};
