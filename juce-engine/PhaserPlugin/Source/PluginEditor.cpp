#include "PluginEditor.h"

PhaserAudioProcessorEditor::PhaserAudioProcessorEditor(PhaserAudioProcessor& p)
    : AudioProcessorEditor(&p), audioProcessor(p)
{
    genericEditor.reset(new juce::GenericAudioProcessorEditor(p));
    addAndMakeVisible(genericEditor.get());
    setSize(420, juce::jmax(300, genericEditor->getHeight()));
}

PhaserAudioProcessorEditor::~PhaserAudioProcessorEditor() = default;

void PhaserAudioProcessorEditor::paint(juce::Graphics& g)
{
    g.fillAll(juce::Colour(0xff241d19));
}

void PhaserAudioProcessorEditor::resized()
{
    if (genericEditor) {
        genericEditor->setBounds(getLocalBounds());
    }
}
