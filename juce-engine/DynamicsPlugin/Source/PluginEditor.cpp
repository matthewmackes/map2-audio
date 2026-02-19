#include "PluginEditor.h"

DynamicsAudioProcessorEditor::DynamicsAudioProcessorEditor(DynamicsAudioProcessor& p)
    : AudioProcessorEditor(&p), audioProcessor(p)
{
    genericEditor.reset(new juce::GenericAudioProcessorEditor(p));
    addAndMakeVisible(genericEditor.get());
    setSize(420, juce::jmax(320, genericEditor->getHeight()));
}

DynamicsAudioProcessorEditor::~DynamicsAudioProcessorEditor() = default;

void DynamicsAudioProcessorEditor::paint(juce::Graphics& g)
{
    g.fillAll(juce::Colour(0xff1a251f));
}

void DynamicsAudioProcessorEditor::resized()
{
    if (genericEditor) {
        genericEditor->setBounds(getLocalBounds());
    }
}
