#pragma once

#include <juce_gui_extra/juce_gui_extra.h>

#include "PluginProcessor.h"

class ParallelMixerAudioProcessorEditor : public juce::AudioProcessorEditor
{
public:
    explicit ParallelMixerAudioProcessorEditor(ParallelMixerAudioProcessor&);
    ~ParallelMixerAudioProcessorEditor() override;

    void paint(juce::Graphics&) override;
    void resized() override;

private:
    ParallelMixerAudioProcessor& audioProcessor;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(ParallelMixerAudioProcessorEditor)
};
