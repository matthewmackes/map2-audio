#pragma once

#include <juce_gui_extra/juce_gui_extra.h>

#include "PluginProcessor.h"

class EventideH9AudioProcessorEditor : public juce::AudioProcessorEditor
{
public:
    explicit EventideH9AudioProcessorEditor(EventideH9AudioProcessor&);
    ~EventideH9AudioProcessorEditor() override;

    void paint(juce::Graphics&) override;
    void resized() override;

private:
    EventideH9AudioProcessor& audioProcessor;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(EventideH9AudioProcessorEditor)
};
