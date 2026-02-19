#include "PluginEditor.h"

ChorusAudioProcessorEditor::ChorusAudioProcessorEditor(ChorusAudioProcessor& p)
    : AudioProcessorEditor(&p), audioProcessor(p)
{
    genericEditor.reset(new juce::GenericAudioProcessorEditor(p));
    addAndMakeVisible(genericEditor.get());
    setSize(420, juce::jmax(300, genericEditor->getHeight()));
}

ChorusAudioProcessorEditor::~ChorusAudioProcessorEditor() = default;

void ChorusAudioProcessorEditor::paint(juce::Graphics& g)
{
    g.fillAll(juce::Colour(0xff162028));
}

void ChorusAudioProcessorEditor::resized()
{
    if (genericEditor) {
        genericEditor->setBounds(getLocalBounds());
    }
}
