#pragma once

#include <juce_gui_extra/juce_gui_extra.h>

#include "PluginProcessor.h"

class NAMAudioProcessorEditor : public juce::AudioProcessorEditor
{
public:
    explicit NAMAudioProcessorEditor(NAMAudioProcessor&);
    ~NAMAudioProcessorEditor() override;

    void paint(juce::Graphics&) override;
    void resized() override;

private:
    NAMAudioProcessor& audioProcessor;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(NAMAudioProcessorEditor)
};
