#pragma once

#include <juce_gui_extra/juce_gui_extra.h>

#include "PluginProcessor.h"

class IntelliFX8VoiceChorusAudioProcessorEditor : public juce::AudioProcessorEditor
{
public:
    explicit IntelliFX8VoiceChorusAudioProcessorEditor(IntelliFX8VoiceChorusAudioProcessor&);
    ~IntelliFX8VoiceChorusAudioProcessorEditor() override;

    void paint(juce::Graphics&) override;
    void resized() override;

private:
    IntelliFX8VoiceChorusAudioProcessor& audioProcessor;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(IntelliFX8VoiceChorusAudioProcessorEditor)
};
