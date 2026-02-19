#include "PluginEditor.h"

MesaDualRectifierAudioProcessorEditor::MesaDualRectifierAudioProcessorEditor(
    MesaDualRectifierAudioProcessor& p)
    : AudioProcessorEditor(&p), audioProcessor(p)
{
    genericEditor.reset(new juce::GenericAudioProcessorEditor(p));
    addAndMakeVisible(genericEditor.get());
    setSize(400, genericEditor->getHeight());
}

MesaDualRectifierAudioProcessorEditor::~MesaDualRectifierAudioProcessorEditor() = default;

void MesaDualRectifierAudioProcessorEditor::paint(juce::Graphics& g)
{
    g.fillAll(juce::Colour(0xff1a1a2e));
}

void MesaDualRectifierAudioProcessorEditor::resized()
{
    if (genericEditor)
        genericEditor->setBounds(getLocalBounds());
}
