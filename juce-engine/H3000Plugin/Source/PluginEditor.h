#pragma once

#include <juce_gui_extra/juce_gui_extra.h>

#include "PluginProcessor.h"

class H3000AudioProcessorEditor : public juce::AudioProcessorEditor
{
public:
    explicit H3000AudioProcessorEditor(H3000AudioProcessor&);
    ~H3000AudioProcessorEditor() override;

    void paint(juce::Graphics&) override;
    void resized() override;

private:
    H3000AudioProcessor& audioProcessor;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(H3000AudioProcessorEditor)
};
