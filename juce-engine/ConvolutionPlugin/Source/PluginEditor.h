#pragma once

#include <juce_gui_extra/juce_gui_extra.h>

#include "PluginProcessor.h"

class ConvolutionAudioProcessorEditor : public juce::AudioProcessorEditor
{
public:
    explicit ConvolutionAudioProcessorEditor(ConvolutionAudioProcessor&);
    ~ConvolutionAudioProcessorEditor() override;

    void paint(juce::Graphics&) override;
    void resized() override;

private:
    ConvolutionAudioProcessor& audioProcessor;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(ConvolutionAudioProcessorEditor)
};
