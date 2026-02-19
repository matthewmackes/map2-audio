#pragma once

#include <juce_gui_extra/juce_gui_extra.h>

#include "PluginProcessor.h"

class BossXS1PolyShifterAudioProcessorEditor : public juce::AudioProcessorEditor
{
public:
    explicit BossXS1PolyShifterAudioProcessorEditor(BossXS1PolyShifterAudioProcessor&);
    ~BossXS1PolyShifterAudioProcessorEditor() override;

    void paint(juce::Graphics&) override;
    void resized() override;

private:
    BossXS1PolyShifterAudioProcessor& audioProcessor;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(BossXS1PolyShifterAudioProcessorEditor)
};
