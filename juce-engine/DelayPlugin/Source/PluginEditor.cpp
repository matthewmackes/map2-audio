#include "PluginEditor.h"

DelayAudioProcessorEditor::DelayAudioProcessorEditor(DelayAudioProcessor& p)
    : AudioProcessorEditor(&p), audioProcessor(p)
{
    genericEditor.reset(new juce::GenericAudioProcessorEditor(p));
    addAndMakeVisible(genericEditor.get());
    setSize(460, juce::jmax(360, genericEditor->getHeight()));
}

DelayAudioProcessorEditor::~DelayAudioProcessorEditor() = default;

void DelayAudioProcessorEditor::paint(juce::Graphics& g)
{
    g.fillAll(juce::Colour(0xff1f1a2b));
}

void DelayAudioProcessorEditor::resized()
{
    if (genericEditor) {
        genericEditor->setBounds(getLocalBounds());
    }
}
